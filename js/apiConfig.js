/**
 * Shared backend URL for the whole frontend.
 *
 * All environments (local browser, Netlify, Vercel, mobile) use the Render
 * backend so local and deployed frontends share the same database.
 *
 * Load this script before any page script that calls the API.
 */
(function () {
  "use strict";

  var BACKEND_URL = "https://bus-management-system-backend.onrender.com";

  window.AppConfig = {
    BACKEND_URL: BACKEND_URL,
  };

  console.log("Backend: Render Production");
})();
