/**
 * Register page:
 *   - Password visibility toggles for every <input type="password"> on the page.
 *   - Submits the form to POST {BACKEND_URL}/auth/register, then redirects to
 *     login.html on success.
 *
 * BACKEND_URL is read from window.LiveBusTracking when available so all pages
 * stay in sync; otherwise falls back to the local backend.
 */
(function () {
  "use strict";

  // Backend targets. Switch the fallback to RENDER_BACKEND_URL for production.
  const RENDER_BACKEND_URL = "https://bus-management-system-backend.onrender.com";
  const LOCAL_BACKEND_URL = "http://localhost:8000";
  const BACKEND_URL =
    (window.LiveBusTracking && window.LiveBusTracking.BACKEND_URL) ||
    LOCAL_BACKEND_URL;

  const REDIRECT_AFTER_REGISTER = "login.html";

  console.log("[register] BACKEND_URL =", BACKEND_URL);

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

  function showStatus(msg, isError) {
    const el = document.getElementById("registerStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#c0392b" : "#1e73ff";
  }

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

  function extractErrorMessage(bodyText, status) {
    if (!bodyText) return `HTTP ${status} (empty body)`;
    try {
      const data = JSON.parse(bodyText);
      if (typeof data.detail === "string") return data.detail;
      if (Array.isArray(data.detail)) {
        return data.detail
          .map((d) => {
            const loc = Array.isArray(d.loc) ? d.loc.join(".") : d.loc || "";
            return loc ? `${loc}: ${d.msg}` : d.msg;
          })
          .join("; ");
      }
      return bodyText.slice(0, 200);
    } catch (_) {
      return bodyText.slice(0, 200);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();

    const fullNameEl = document.getElementById("fullName");
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const confirmEl = document.getElementById("confirmPassword");
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const fullName = ((fullNameEl && fullNameEl.value) || "").trim();
    const email = ((emailEl && emailEl.value) || "").trim();
    const password = (passwordEl && passwordEl.value) || "";
    const confirm = (confirmEl && confirmEl.value) || "";

    if (!fullName || !email || !password || !confirm) {
      showStatus("Fill in all fields.", true);
      return;
    }

    if (password !== confirm) {
      showStatus("Passwords do not match.", true);
      return;
    }

    if (password.length < 8) {
      showStatus("Password must be at least 8 characters.", true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    showStatus("Creating account...", false);

    const url = `${BACKEND_URL}/auth/register`;
    console.log("[register] POST URL:", url);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          email: email,
          password: password,
        }),
      });
    } catch (err) {
      console.error("[register] Network error:", err, "URL:", url);
      showStatus(`Network error: ${err.message || err}`, true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (readErr) {
      console.warn("[register] Could not read response body:", readErr);
    }
    console.log(
      "[register] response:",
      res.status,
      res.statusText,
      "body:",
      bodyText,
    );

    if (!res.ok) {
      const reason = extractErrorMessage(bodyText, res.status);
      showStatus(`Registration failed: ${res.status} — ${reason}`, true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    showStatus("Registration successful. Redirecting to login...", false);
    setTimeout(() => {
      window.location.href = REDIRECT_AFTER_REGISTER;
    }, 800);
  }

  function init() {
    initPasswordToggles();

    const form = document.getElementById("registerForm");
    if (!form) {
      console.error('[register] No <form id="registerForm"> found.');
      return;
    }
    form.addEventListener("submit", handleRegister);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
