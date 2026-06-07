/**
 * Reset-password flow:
 *   POST {BACKEND_URL}/auth/reset-password  { token, new_password }
 *   -> verifies the emailed token and sets the new password, then sends the
 *      user back to login.html.
 *
 * The token is read from the URL query string, e.g.:
 *   reset-password.html?token=XYZ
 *
 * BACKEND_URL comes from js/apiConfig.js (window.AppConfig.BACKEND_URL).
 */
(function () {
  "use strict";

  const BACKEND_URL =
    (window.AppConfig && window.AppConfig.BACKEND_URL) ||
    "https://bus-management-system-backend.onrender.com";

  // How long (ms) to keep the success message on screen before redirecting.
  const REDIRECT_DELAY_MS = 3000;
  const REDIRECT_AFTER_RESET = "login.html";
  const MIN_PASSWORD_LENGTH = 8;
  // Backend tokens are secrets.token_urlsafe(48) (~64 chars). Anything far
  // shorter is almost certainly a truncated/incomplete link.
  const MIN_TOKEN_LENGTH = 20;
  const SUCCESS_MESSAGE =
    "Your password has been reset. Redirecting to login...";
  const MISSING_TOKEN_MESSAGE =
    "This reset link is missing its token. Please use the link from your email.";
  const INCOMPLETE_TOKEN_MESSAGE =
    "This reset link looks incomplete. Please copy the full link from your email or request a new reset link.";

  console.log("[reset-password] BACKEND_URL =", BACKEND_URL);

  /**
   * getTokenFromUrl
   * Reads the `token` parameter from the current URL.
   *
   * Primary source is the query string (window.location.search), e.g.
   *   reset-password.html?token=XYZ
   * As a fallback it also scans the hash fragment (window.location.hash),
   * because some email clients / static hosts / SPA routers deliver the query
   * after a "#" (e.g. reset-password.html#token=XYZ or
   * .../#/reset-password.html?token=XYZ). In those cases location.search is
   * empty even though the token is present, which is the usual reason the
   * token looks "missing".
   *
   * Returns { token, source } where token is the trimmed string ("" if not
   * found) and source is "location.search", "location.hash", or "none".
   */
  function getTokenFromUrl() {
    // 1) Raw diagnostics so we can see exactly what the browser received.
    console.log("[reset-password] window.location.href   =", window.location.href);
    console.log("[reset-password] window.location.search =", window.location.search);
    console.log("[reset-password] window.location.hash   =", window.location.hash);

    // 2) Try the normal query string first.
    const searchParams = new URLSearchParams(window.location.search);
    let token = (searchParams.get("token") || "").trim();
    let source = token ? "location.search" : "none";

    // 3) Fallback: look inside the hash fragment if the query had no token.
    if (!token && window.location.hash) {
      // Strip the leading "#", then take whatever follows the first "?" if the
      // hash itself contains a query (e.g. "#/reset-password.html?token=XYZ").
      const rawHash = window.location.hash.replace(/^#/, "");
      const hashQuery = rawHash.includes("?")
        ? rawHash.slice(rawHash.indexOf("?") + 1)
        : rawHash;
      const hashParams = new URLSearchParams(hashQuery);
      const hashToken = (hashParams.get("token") || "").trim();
      if (hashToken) {
        token = hashToken;
        source = "location.hash";
      }
    }

    // 4) Report the extracted value and, when missing, exactly why.
    if (token) {
      console.log(
        `[reset-password] extracted token (from ${source}):`,
        `${token.slice(0, 8)}... (length ${token.length})`,
      );
    } else {
      console.warn(
        "[reset-password] token is MISSING. URLSearchParams found no 'token' " +
          "key in either location.search or location.hash. " +
          "search =",
        JSON.stringify(window.location.search),
        "| hash =",
        JSON.stringify(window.location.hash),
        "| query keys seen =",
        JSON.stringify(Array.from(searchParams.keys())),
      );
    }

    return { token, source };
  }

  /**
   * evaluateToken
   * Extracts the token (via getTokenFromUrl) and classifies it so callers can
   * decide whether it is safe to submit:
   *   - status "missing":    no token at all in the URL
   *   - status "incomplete": a token exists but is suspiciously short, which
   *                          usually means the link was truncated/word-wrapped
   *                          by the email client when copied.
   *   - status "ok":         a token of plausible length was found.
   * The backend issues secrets.token_urlsafe(48) (~64 chars), so anything well
   * below that is treated as incomplete.
   */
  function evaluateToken() {
    const { token, source } = getTokenFromUrl();

    if (!token) {
      return { status: "missing", token: "", source };
    }

    if (token.length < MIN_TOKEN_LENGTH) {
      console.warn(
        "[reset-password] token looks INCOMPLETE —",
        "length:",
        token.length,
        "| came from:",
        source,
        "| full URL:",
        window.location.href,
      );
      return { status: "incomplete", token, source };
    }

    return { status: "ok", token, source };
  }

  /**
   * showStatus
   * Writes a message into the #resetStatus element and colours it red for
   * errors or the brand blue for normal/success messages. Mirrors the helper
   * used by the login and forgot-password pages.
   */
  function showStatus(msg, isError) {
    const el = document.getElementById("resetStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#c0392b" : "#1e73ff";
  }

  /**
   * setLoading
   * Toggles the submit button's loading state: disables it and swaps the
   * label while a request is in flight, then restores the original label.
   * Returns nothing; callers pass the button and the original label text.
   */
  function setLoading(submitBtn, isLoading, originalText) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Resetting..." : originalText;
  }

  /**
   * validateInputs
   * Client-side checks before hitting the network:
   *   - both passwords are non-empty
   *   - new password meets the minimum length
   *   - confirm password matches the new password
   * Returns { ok: true } when valid, or { ok: false, message } otherwise.
   */
  function validateInputs(newPassword, confirmPassword) {
    if (!newPassword || !confirmPassword) {
      return { ok: false, message: "Enter and confirm your new password." };
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }
    if (newPassword !== confirmPassword) {
      return { ok: false, message: "Passwords do not match." };
    }
    return { ok: true };
  }

  /**
   * parseErrorMessage
   * Turns a (possibly JSON) error response body into a friendly message.
   * FastAPI typically returns { detail: "..." }; we fall back to a generic
   * message when the body is empty or not JSON.
   */
  function parseErrorMessage(bodyText, status) {
    let message = "Something went wrong. Please try again later.";
    try {
      const data = bodyText ? JSON.parse(bodyText) : {};
      if (data && typeof data.detail === "string" && data.detail.trim()) {
        message = data.detail.trim();
      } else if (
        data &&
        typeof data.message === "string" &&
        data.message.trim()
      ) {
        message = data.message.trim();
      }
    } catch (parseErr) {
      console.warn(
        "[reset-password] Error body was not JSON, using default message.",
        parseErr,
      );
    }
    if (status === 400 || status === 404 || status === 410) {
      // Common cases: token invalid / not found / expired.
      message = message || "This reset link is invalid or has expired.";
    }
    return message;
  }

  /**
   * handleSubmit
   * The form's submit handler. Validates inputs, POSTs the token plus the new
   * password to the backend, manages the loading state, surfaces success or
   * error messages, and redirects to login.html on success.
   */
  async function handleSubmit(event) {
    event.preventDefault();

    const tokenCheck = evaluateToken();
    const newPasswordEl = document.getElementById("newPassword");
    const confirmPasswordEl = document.getElementById("confirmPassword");
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const newPassword = (newPasswordEl && newPasswordEl.value) || "";
    const confirmPassword =
      (confirmPasswordEl && confirmPasswordEl.value) || "";

    // Block the request if the token is absent or looks truncated.
    if (tokenCheck.status === "missing") {
      showStatus(MISSING_TOKEN_MESSAGE, true);
      return;
    }
    if (tokenCheck.status === "incomplete") {
      showStatus(INCOMPLETE_TOKEN_MESSAGE, true);
      return;
    }
    const token = tokenCheck.token;

    const validation = validateInputs(newPassword, confirmPassword);
    if (!validation.ok) {
      showStatus(validation.message, true);
      return;
    }

    const originalBtnText = submitBtn ? submitBtn.textContent : "";
    setLoading(submitBtn, true, originalBtnText);
    showStatus("Resetting your password...", false);

    const url = `${BACKEND_URL}/auth/reset-password`;
    console.log("[reset-password] POST URL:", url);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
    } catch (err) {
      console.error("[reset-password] Network error:", err, "URL:", url);
      showStatus(
        `Cannot reach the server. Please try again later. (${err.message || err})`,
        true,
      );
      setLoading(submitBtn, false, originalBtnText);
      return;
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (readErr) {
      console.warn("[reset-password] Could not read response body:", readErr);
    }
    console.log(
      "[reset-password] response:",
      res.status,
      res.statusText,
      "body:",
      bodyText,
    );

    if (!res.ok) {
      const message = parseErrorMessage(bodyText, res.status);
      console.error(
        "[reset-password] Request failed:",
        res.status,
        res.statusText,
        message,
      );
      showStatus(message, true);
      setLoading(submitBtn, false, originalBtnText);
      return;
    }

    // Prefer the backend's message when present, otherwise the default.
    let message = SUCCESS_MESSAGE;
    try {
      const data = bodyText ? JSON.parse(bodyText) : {};
      if (data && typeof data.message === "string" && data.message.trim()) {
        message = data.message.trim();
      }
    } catch (parseErr) {
      console.warn(
        "[reset-password] Success body was not JSON, using default message.",
        parseErr,
      );
    }

    console.log("[reset-password] Password reset successful.");
    showStatus(message, false);

    // Keep the button disabled; we are about to leave this page.
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Done";
    }

    setTimeout(() => {
      console.log(
        "[reset-password] Redirecting to",
        REDIRECT_AFTER_RESET,
      );
      window.location.href = REDIRECT_AFTER_RESET;
    }, REDIRECT_DELAY_MS);
  }

  // Inline SVGs (same markup as the login page) for the show/hide states.
  const EYE_OPEN_SVG =
    '<svg class="pw-icon pw-eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>' +
    '<circle cx="12" cy="12" r="3"/>' +
    "</svg>";

  const EYE_CLOSED_SVG =
    '<svg class="pw-icon pw-eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M17.94 17.94A10.94 10.94 0 0112 19c-6.5 0-10-7-10-7a19.6 19.6 0 014.22-5.22"/>' +
    '<path d="M9.9 4.24A10.94 10.94 0 0112 4c6.5 0 10 7 10 7a19.6 19.6 0 01-3.17 4.19"/>' +
    '<path d="M9.88 9.88a3 3 0 104.24 4.24"/>' +
    '<line x1="3" y1="3" x2="21" y2="21"/>' +
    "</svg>";

  /**
   * initPasswordToggles
   * For every password input in scope, wraps it in a .pw-wrap container and
   * injects a .pw-toggle button (eye icon) on the right. Clicking the button
   * swaps the input between "password" and "text" and toggles the icon/ARIA
   * state. Identical behavior and markup to the login page.
   */
  function initPasswordToggles(root) {
    const scope = root || document;
    const inputs = scope.querySelectorAll('input[type="password"]');
    inputs.forEach((input) => {
      if (input.dataset.pwToggleAttached === "1") return;

      const wrap = document.createElement("div");
      wrap.className = "pw-wrap";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pw-toggle";
      btn.setAttribute("aria-label", "Show password");
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = EYE_OPEN_SVG + EYE_CLOSED_SVG;
      wrap.appendChild(btn);

      btn.addEventListener("click", () => {
        const willShow = input.type === "password";
        input.type = willShow ? "text" : "password";
        btn.classList.toggle("is-showing", willShow);
        btn.setAttribute("aria-pressed", willShow ? "true" : "false");
        btn.setAttribute(
          "aria-label",
          willShow ? "Hide password" : "Show password",
        );
      });

      input.dataset.pwToggleAttached = "1";
    });
  }

  /**
   * init
   * Wires the submit handler to #resetPasswordForm once the DOM is ready and
   * warns early if the token is absent so the user can request a fresh link.
   */
  function init() {
    initPasswordToggles();

    const form = document.getElementById("resetPasswordForm");
    if (!form) {
      console.error("[reset-password] No #resetPasswordForm found.");
      return;
    }
    form.addEventListener("submit", handleSubmit);

    // Early heads-up if the page was opened without a usable token.
    const tokenCheck = evaluateToken();
    if (tokenCheck.status === "missing") {
      showStatus(MISSING_TOKEN_MESSAGE, true);
    } else if (tokenCheck.status === "incomplete") {
      showStatus(INCOMPLETE_TOKEN_MESSAGE, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
