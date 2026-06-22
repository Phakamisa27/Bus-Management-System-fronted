/**
 * Backend URL for the passenger frontend.
 *
 * Load this script before any page script that calls the API.
 */
(function () {
  "use strict";

  window.API_CONFIG = {
    BACKEND_URL: "https://bus-management-system-backend.onrender.com",
  };

  window.AppConfig = window.API_CONFIG;

  console.log(
    "[apiConfig] Using backend:",
    window.API_CONFIG.BACKEND_URL,
    "(environment: render)",
  );
})();
