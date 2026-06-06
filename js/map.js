// Dedicated map page logic.
//
// The bus to display is chosen by the timetable card the user clicked and is
// passed in the URL, e.g. map.html?busId=<BUS_ID>. We read that id here and
// hand it to LiveBusTracking, so each bus opens its own independent map and
// never reuses another bus's location.

// Backend targets. Switch the fallback to RENDER_BACKEND_URL for production.
const RENDER_BACKEND_URL = "https://bus-management-system-backend.onrender.com";
const LOCAL_BACKEND_URL = "http://localhost:8000";
const BACKEND_URL =
  (window.LiveBusTracking && window.LiveBusTracking.BACKEND_URL) ||
  LOCAL_BACKEND_URL;

const NO_LOCATION_MESSAGE =
  "No one is currently sharing the location of this bus.";

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ---- Selected bus comes entirely from the URL ----
const busId = getQueryParam("busId");
const routeParam = getQueryParam("route") || "";
const timeParam = getQueryParam("time") || "";
const destParam = getQueryParam("dest") || "";

let selectedBus = busId
  ? { bus_id: busId, route: routeParam, time: timeParam, destination: destParam }
  : null;

// ---- Elements ----
const trackingPanel = document.getElementById("trackingPanel");
const trackingDot = document.getElementById("trackingDot");
const trackingText = document.getElementById("trackingText");
const helpText = document.getElementById("helpText");
const lastUpdateText = document.getElementById("lastUpdateText");
const busStatusText = document.getElementById("busStatusText");
const shareBtn = document.getElementById("shareBtn");
const popup = document.getElementById("trackingPopup");
const busTitle = document.getElementById("busTitle");

// ---- State ----
let passengerWatchId = null;
let sharingActive = false;
let lastSentAt = null;
let map = null;
let lastSentTickerId = null;
let lastKnownPosition = null;
let gpsRetryTimerId = null;

const GPS_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 30000,
  maximumAge: 10000,
};
const GPS_RETRY_DELAY_MS = 2000;

// ---- Helpers ----
function getAuthToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    ""
  );
}

function showOnPage(msg) {
  if (busStatusText) {
    busStatusText.textContent = msg;
  }
}

function getLocationPostUrl(id) {
  return `${BACKEND_URL}/buses/${id}/location`;
}

function busLabel() {
  return selectedBus && selectedBus.route
    ? `Bus ${selectedBus.route}`
    : "this bus";
}

function minutesAgoLabel(date) {
  if (!date) return "never";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000),
  );
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

function setTrackingUi(isActive) {
  sharingActive = isActive;
  shareBtn.textContent = isActive
    ? "Stop Sharing Location"
    : "Start Sharing Location";
  trackingDot.classList.toggle("active", isActive);
  if (isActive) {
    trackingText.textContent = `You are helping track ${busLabel()}`;
  } else {
    trackingText.textContent = "Tracking inactive";
    helpText.textContent = `You stopped helping track ${busLabel()}.`;
  }
}

function showPopupMessage() {
  popup.classList.add("visible");
  setTimeout(() => popup.classList.remove("visible"), 3000);
}

function ensureMap() {
  if (!window.LiveBusTracking) {
    console.error(
      "[map] LiveBusTracking not loaded. Ensure js/liveTracking.js runs after Leaflet.",
    );
    return;
  }
  if (!window.L) {
    console.error("[map] Leaflet not loaded (window.L missing).");
    return;
  }
  LiveBusTracking.ensureMap();
  map = LiveBusTracking.getMap();
}

function updateLastSentLabel() {
  lastUpdateText.textContent = `Last update: ${minutesAgoLabel(lastSentAt)}`;
}

async function postPassengerLocation(position) {
  if (!sharingActive) return;

  if (!busId) {
    showOnPage("No bus selected.");
    stopSharing();
    return;
  }

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  const url = getLocationPostUrl(busId);
  const token = getAuthToken();

  const headers = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    const msg =
      "No auth token in localStorage. Log in so access_token is saved.";
    console.warn("[map]", msg);
    showOnPage(`POST blocked: ${msg}`);
    stopSharing();
    return;
  }

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    });
  } catch (err) {
    console.error("[map] Network error posting passenger location:", err, url);
    showOnPage(`POST network error: ${err.message || err} (URL: ${url})`);
    return;
  }

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch (readErr) {
    console.warn("[map] Could not read response body:", readErr);
  }

  if (!res.ok) {
    const excerpt = (bodyText || "").slice(0, 200) || "(empty body)";
    const visible = `POST failed: ${res.status} ${res.statusText} — ${excerpt}`;
    console.error("[map]", visible, "URL:", url);
    showOnPage(visible);
    if (res.status === 401 || res.status === 403) {
      stopSharing();
    }
    return;
  }

  console.log(`Passenger location sent: ${lat}, ${lng}`);
  lastSentAt = new Date();
  updateLastSentLabel();
  showOnPage(`Sharing your location with ${busLabel()}`);
}

function describeGeoError(err) {
  if (!err) return "Location error.";
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission denied. Enable GPS access for this site.";
    case err.POSITION_UNAVAILABLE:
      return "GPS position unavailable.";
    case err.TIMEOUT:
      return "Timed out getting your location.";
    default:
      return `Location error: ${err.message || "unknown"}`;
  }
}

function clearWatchOnly() {
  if (passengerWatchId !== null) {
    navigator.geolocation.clearWatch(passengerWatchId);
    passengerWatchId = null;
  }
}

function cancelGpsRetry() {
  if (gpsRetryTimerId !== null) {
    clearTimeout(gpsRetryTimerId);
    gpsRetryTimerId = null;
  }
}

function stopSharing() {
  clearWatchOnly();
  cancelGpsRetry();
  console.log("[map] Stopped sharing location (clearWatch).");
  setTrackingUi(false);
}

function onGpsSuccess(position) {
  lastKnownPosition = position;
  // Passenger GPS sharing only POSTs; it never draws a marker on the map.
  postPassengerLocation(position);
}

function onGpsError(err) {
  console.warn("[map] watchPosition error:", err.code, err.message);

  if (err.code === err.PERMISSION_DENIED) {
    showOnPage(describeGeoError(err));
    stopSharing();
    return;
  }

  const fallbackPart = lastKnownPosition
    ? "Using last known location."
    : "Waiting for GPS signal...";
  showOnPage(`${fallbackPart} Retrying GPS...`);

  scheduleGpsRetry();
}

function scheduleGpsRetry() {
  if (gpsRetryTimerId !== null) return;
  if (!sharingActive) return;

  gpsRetryTimerId = setTimeout(() => {
    gpsRetryTimerId = null;
    if (!sharingActive) return;

    console.log("[map] Retrying GPS watch...");
    showOnPage("Retrying GPS...");
    clearWatchOnly();
    startGpsWatch();
  }, GPS_RETRY_DELAY_MS);
}

function startGpsWatch() {
  passengerWatchId = navigator.geolocation.watchPosition(
    onGpsSuccess,
    onGpsError,
    GPS_OPTIONS,
  );
}

function startSharing() {
  if (!busId) {
    showOnPage("No bus selected.");
    return;
  }

  if (!navigator.geolocation) {
    showOnPage("Geolocation is not supported by this browser.");
    console.error("[map] navigator.geolocation is unavailable.");
    return;
  }

  ensureMap();
  showPopupMessage();
  setTrackingUi(true);
  showOnPage("Waiting for GPS signal...");

  cancelGpsRetry();
  clearWatchOnly();
  startGpsWatch();
}

// ---- Live location events (from liveTracking.js) ----
window.addEventListener("livebus:location", (e) => {
  const detail = e.detail || {};
  // Ignore events for any other bus id (defensive — should not happen).
  if (detail.busId && busId && detail.busId !== busId) return;
  const ageMs =
    Date.now() - new Date(detail.timestamp || Date.now()).getTime();
  if (ageMs > 2 * 60 * 1000) {
    busStatusText.textContent = "Bus not currently tracked.";
    return;
  }
  busStatusText.textContent = `Showing live location for ${busLabel()}`;
});

// The selected bus has no fresh location:
//   - backend returned 404 (no location recorded for this bus_id), or
//   - the latest fix is older than the staleness threshold, or
//   - the coords are the (0, 0) sentinel.
window.addEventListener("livebus:no-location", (e) => {
  const detail = e.detail || {};
  if (detail.busId && busId && detail.busId !== busId) return;
  busStatusText.textContent = NO_LOCATION_MESSAGE;
});

window.addEventListener("livebus:error", (e) => {
  const detail = e.detail || {};
  if (detail.busId && busId && detail.busId !== busId) return;
  if (detail.status) {
    busStatusText.textContent = `Could not fetch bus location (HTTP ${detail.status}).`;
  } else {
    busStatusText.textContent = `Could not fetch bus location: ${detail.message || "network error"}.`;
  }
});

// ---- Share button ----
shareBtn.addEventListener("click", () => {
  if (sharingActive) {
    stopSharing();
    return;
  }
  startSharing();
});

// ---- Init ----
function init() {
  if (!busId) {
    if (busTitle) busTitle.textContent = "No bus selected";
    showOnPage("No bus selected. Go back and choose a bus.");
    shareBtn.disabled = true;
    return;
  }

  if (busTitle) {
    const parts = [];
    if (routeParam) parts.push(`Bus ${routeParam}`);
    if (destParam) parts.push(destParam);
    if (timeParam) parts.push(`Time: ${timeParam}`);
    busTitle.textContent = parts.join(" · ") || "Live Bus Location";
  }

  ensureMap();
  setTrackingUi(false);
  helpText.textContent = `You can help track ${busLabel()} by sharing your location.`;
  shareBtn.disabled = false;
  busStatusText.textContent = `Fetching latest location for ${busLabel()}...`;

  if (window.LiveBusTracking) {
    LiveBusTracking.setRouteLabel(busLabel());
    LiveBusTracking.setBusId(busId);
  }

  lastSentTickerId = setInterval(updateLastSentLabel, 5000);
}

init();
