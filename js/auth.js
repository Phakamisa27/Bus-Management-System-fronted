/**
 * Passenger auth helpers.
 *
 * Session keys: authToken + currentUser
 */
(function () {
  "use strict";

  var PASSENGER_TOKEN_KEY = "authToken";
  var PASSENGER_USER_KEY = "currentUser";
  var LEGACY_TOKEN_KEY = "access_token";

  function getBackendUrl() {
    return window.API_CONFIG.BACKEND_URL;
  }

  function migrateLegacyPassengerToken() {
    if (localStorage.getItem(PASSENGER_TOKEN_KEY)) return;
    var legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      localStorage.setItem(PASSENGER_TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  }

  function parseStoredUser(key) {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function storePassengerAuth(token, user) {
    localStorage.setItem(PASSENGER_TOKEN_KEY, token);
    localStorage.setItem(PASSENGER_USER_KEY, JSON.stringify(user));
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  function clearPassengerAuth() {
    localStorage.removeItem(PASSENGER_TOKEN_KEY);
    localStorage.removeItem(PASSENGER_USER_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  function getPassengerToken() {
    migrateLegacyPassengerToken();
    return localStorage.getItem(PASSENGER_TOKEN_KEY);
  }

  function getPassengerUser() {
    return parseStoredUser(PASSENGER_USER_KEY);
  }

  function isAdminRole(user) {
    return !!(user && user.role === "admin");
  }

  async function fetchCurrentUser(token) {
    var res = await fetch(getBackendUrl() + "/auth/me", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    });

    if (!res.ok) {
      var err = new Error("Could not load user profile.");
      err.status = res.status;
      throw err;
    }

    return res.json();
  }

  migrateLegacyPassengerToken();

  window.Auth = {
    PASSENGER_TOKEN_KEY: PASSENGER_TOKEN_KEY,
    PASSENGER_USER_KEY: PASSENGER_USER_KEY,
    getBackendUrl: getBackendUrl,
    fetchCurrentUser: fetchCurrentUser,
    storePassengerAuth: storePassengerAuth,
    clearPassengerAuth: clearPassengerAuth,
    getPassengerToken: getPassengerToken,
    getPassengerUser: getPassengerUser,
    isAdminRole: isAdminRole,
  };
})();
