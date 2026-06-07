/**
 * Shared backend URL for the whole frontend.
 *
 * - Local dev (localhost / 127.0.0.1): http://localhost:8000
 * - Deployed (any other host): https://bus-management-system-backend.onrender.com
 *
 * Load this script before any page script that calls the API.
 */
(function () {
  "use strict";

  var LOCAL_BACKEND_URL = "http://localhost:8000";
  var RENDER_BACKEND_URL =
    "https://bus-management-system-backend.onrender.com";

  function isLocalEnvironment() {
    var hostname = window.location.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  }

  var BACKEND_URL = isLocalEnvironment()
    ? LOCAL_BACKEND_URL
    : RENDER_BACKEND_URL;

  window.AppConfig = {
    BACKEND_URL: BACKEND_URL,
    LOCAL_BACKEND_URL: LOCAL_BACKEND_URL,
    RENDER_BACKEND_URL: RENDER_BACKEND_URL,
    isLocalEnvironment: isLocalEnvironment,
  };

  console.log(
    "[AppConfig] BACKEND_URL =",
    BACKEND_URL,
    "(" + (isLocalEnvironment() ? "local" : "production") + ")",
  );
})();
