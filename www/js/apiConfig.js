/**
 * Shared backend URL for the whole frontend.
 *
 * - Local browser (localhost / 127.0.0.1): http://localhost:8000
 * - Capacitor Android/iOS app: https://bus-management-system-backend.onrender.com
 * - Deployed browser (e.g. Vercel): https://bus-management-system-backend.onrender.com
 *
 * Load this script before any page script that calls the API.
 */
(function () {
  "use strict";

  var LOCAL_BACKEND_URL = "http://localhost:8000";
  var RENDER_BACKEND_URL =
    "https://bus-management-system-backend.onrender.com";

  function isCapacitorApp() {
    if (
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function"
    ) {
      return window.Capacitor.isNativePlatform();
    }

    var protocol = window.location.protocol;
    if (protocol === "capacitor:" || protocol === "ionic:") {
      return true;
    }

    // Capacitor WebView serves from https://localhost (no dev-server port).
    return (
      window.location.hostname === "localhost" &&
      protocol === "https:" &&
      !window.location.port
    );
  }

  function isLocalEnvironment() {
    var hostname = window.location.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  }

  function detectEnvironment() {
    if (isCapacitorApp()) {
      return "Capacitor App";
    }
    if (isLocalEnvironment()) {
      return "Local Browser";
    }
    return "Production Browser";
  }

  var environment = detectEnvironment();
  var BACKEND_URL =
    environment === "Local Browser" ? LOCAL_BACKEND_URL : RENDER_BACKEND_URL;

  window.AppConfig = {
    BACKEND_URL: BACKEND_URL,
    LOCAL_BACKEND_URL: LOCAL_BACKEND_URL,
    RENDER_BACKEND_URL: RENDER_BACKEND_URL,
    environment: environment,
    isCapacitorApp: isCapacitorApp,
    isLocalEnvironment: isLocalEnvironment,
  };

  console.log("[AppConfig] Environment detected:", environment);
  console.log("[AppConfig] Selected BACKEND_URL =", BACKEND_URL);
})();
