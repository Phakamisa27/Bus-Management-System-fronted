/**
 * Forgot-password flow:
 *   POST {BACKEND_URL}/auth/forgot-password  { email }
 *   -> always shows a neutral confirmation message (no account enumeration).
 *
 * BACKEND_URL comes from js/apiConfig.js (window.API_CONFIG.BACKEND_URL).
 */
(function () {
  "use strict";

  const BACKEND_URL = window.API_CONFIG.BACKEND_URL;

  const SUCCESS_MESSAGE =
    "If this email exists, reset instructions have been sent.";

  console.log("[forgot-password] BACKEND_URL =", BACKEND_URL);

  function showStatus(msg, isError) {
    const el = document.getElementById("forgotStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#c0392b" : "#1e73ff";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const emailEl = document.getElementById("email");
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const email = ((emailEl && emailEl.value) || "").trim();

    if (!email) {
      showStatus("Enter your email.", true);
      return;
    }

    const originalBtnText = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }
    showStatus("Sending reset link...", false);

    const url = `${BACKEND_URL}/auth/forgot-password`;
    console.log("[forgot-password] POST URL:", url);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      console.error("[forgot-password] Network error:", err, "URL:", url);
      showStatus(
        `Cannot reach the server. Please try again later. (${err.message || err})`,
        true,
      );
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      return;
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (readErr) {
      console.warn("[forgot-password] Could not read response body:", readErr);
    }
    console.log(
      "[forgot-password] response:",
      res.status,
      res.statusText,
      "body:",
      bodyText,
    );

    if (!res.ok) {
      const excerpt = (bodyText || "").slice(0, 200) || "(empty body)";
      console.error(
        "[forgot-password] Request failed:",
        res.status,
        res.statusText,
        excerpt,
      );
      showStatus(
        "Something went wrong. Please try again later.",
        true,
      );
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      return;
    }

    // Prefer the backend message when present, otherwise use the neutral default.
    let message = SUCCESS_MESSAGE;
    try {
      const data = bodyText ? JSON.parse(bodyText) : {};
      if (data && typeof data.message === "string" && data.message.trim()) {
        message = data.message.trim();
      }
    } catch (parseErr) {
      console.warn(
        "[forgot-password] Response was not JSON, using default message.",
        parseErr,
      );
    }

    showStatus(message, false);

    // Do not redirect yet — keep the user on this page.
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }

  function init() {
    const form = document.getElementById("forgotPasswordForm");
    if (!form) {
      console.error("[forgot-password] No #forgotPasswordForm found.");
      return;
    }
    form.addEventListener("submit", handleSubmit);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
