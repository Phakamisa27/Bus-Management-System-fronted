/**
 * Login flow:
 *   POST {BACKEND_URL}/auth/login  { email, password }
 *   -> stores authToken + currentUser (passengers only) and redirects.
 *
 * BACKEND_URL comes from js/apiConfig.js (window.API_CONFIG.BACKEND_URL).
 */
(function () {
  "use strict";

  const REDIRECT_AFTER_LOGIN = "companies.html";
  const ADMIN_DENIED_MESSAGE =
    "This login is for passengers only. Company admins must use the admin portal.";

  const BACKEND_URL = window.API_CONFIG.BACKEND_URL;

  console.log("[login] BACKEND_URL =", BACKEND_URL);

  function showStatus(msg, isError) {
    const el = document.getElementById("loginStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#c0392b" : "#1e73ff";
  }

  async function probeBackend() {
    const url = `${BACKEND_URL}/openapi.json`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(
          "[login] Backend probe failed:",
          res.status,
          res.statusText,
          "body:",
          text.slice(0, 200),
        );
        showStatus(
          `Wrong BACKEND_URL? GET ${url} returned ${res.status} ${res.statusText}. ` +
            `Make sure BACKEND_URL points to the FastAPI server.`,
          true,
        );
        return;
      }
      const looksLikeOpenApi =
        text.includes('"openapi"') || text.includes("openapi");
      if (!looksLikeOpenApi) {
        console.error(
          "[login] /openapi.json did not look like FastAPI. Body:",
          text.slice(0, 200),
        );
        showStatus(
          `BACKEND_URL is probably the FRONTEND tunnel, not FastAPI. ` +
            `GET ${url} returned non-OpenAPI content.`,
          true,
        );
        return;
      }
      console.log(
        "[login] Backend probe OK — FastAPI reachable at",
        BACKEND_URL,
      );
    } catch (err) {
      console.error("[login] Backend probe network error:", err, "URL:", url);
      showStatus(
        `Cannot reach backend at ${BACKEND_URL}. (${err.message || err})`,
        true,
      );
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const email = ((emailEl && emailEl.value) || "").trim();
    const password = (passwordEl && passwordEl.value) || "";

    if (!email || !password) {
      showStatus("Enter email and password.", true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    showStatus("Signing in...", false);

    const url = `${BACKEND_URL}/auth/login`;
    console.log("[login] POST URL:", url);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      console.error("[login] Network error:", err, "URL:", url);
      showStatus(`Network error: ${err.message || err}`, true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (readErr) {
      console.warn("[login] Could not read response body:", readErr);
    }
    console.log(
      "[login] response:",
      res.status,
      res.statusText,
      "body:",
      bodyText,
    );

    if (!res.ok) {
      let errorData = {};

      try {
        errorData = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        errorData = {};
      }

      let msg = "Login failed. Please try again.";

      if (res.status === 401) {
        msg = "wrong email or password. Please try again";
      } else if (res.status === 404) {
        msg = "Login service not found.  Please check backend URL.";
      } else if (res.status === 500) {
        msg = "Server error. Please try again later.";
      } else if (errorData.details) {
        msg = errorData.details;
      }

      console.error("[login]", msg);
      showStatus(msg, true);
      
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    let data = {};
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch (parseErr) {
      console.error("[login] Could not parse JSON response:", parseErr);
      showStatus("Login response was not valid JSON.", true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const token = data.access_token || data.token;
    if (!token) {
      console.error(
        "[login] Login response missing access_token / token:",
        data,
      );
      showStatus("Login response did not include a token.", true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    let user;
    try {
      user = await Auth.fetchCurrentUser(token);
    } catch (profileErr) {
      console.error("[login] Could not load user profile:", profileErr);
      showStatus("Could not verify your account. Please try again.", true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (Auth.isAdminRole(user)) {
      showStatus(ADMIN_DENIED_MESSAGE, true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    Auth.storePassengerAuth(token, user);
    console.log("Login successful, passenger session saved");
    showStatus("Login successful. Redirecting...", false);

    window.location.href = REDIRECT_AFTER_LOGIN;
  }

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

  function init() {
    initPasswordToggles();

    const form = document.querySelector("form");
    if (!form) {
      console.error("[login] No <form> found on the page.");
      return;
    }
    form.addEventListener("submit", handleLogin);

    probeBackend();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
