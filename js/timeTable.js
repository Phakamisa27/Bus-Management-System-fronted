//Step1: ---- Backend endpoints ----
// IMPORTANT: BACKEND_URL must be the *backend* ngrok tunnel
// (the one whose `Forwarding` line points to http://localhost:8000),
// NOT the frontend tunnel that serves index.html.
const BACKEND_URL =
  (window.LiveBusTracking && window.LiveBusTracking.BACKEND_URL) ||
  "https://bus-management-system-backend.onrender.com";

https: console.log("[timeTable] BACKEND_URL =", BACKEND_URL);
console.log(
  "[timeTable] page origin =",
  window.location.origin,
  "(should differ from BACKEND_URL)",
);

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

function getSelectedBusId() {
  if (window.LiveBusTracking && window.LiveBusTracking.getBusId) {
    return window.LiveBusTracking.getBusId();
  }
  return selectedBus ? selectedBus.bus_id : null;
}

function getLocationPostUrl(busId) {
  return `${BACKEND_URL}/buses/${busId}/location`;
}

//Step2: ---- Load JSON ----
let data = {};
fetch("data/timeTable.json")
  .then((res) => res.json())
  .then((json) => {
    data = json;
  })
  .catch((err) => {
    console.error("[timeTable] Failed to load timetable data:", err);
  });

//Step3: ---- Elements ----
const areaInput = document.getElementById("areaInput");
const areaSuggestions = document.getElementById("areaSuggestions");
const destInput = document.getElementById("destInput");
const destSuggestions = document.getElementById("destSuggestions");
const busList = document.getElementById("busList");
const findBtn = document.getElementById("findBtn");
const shareBtn = document.getElementById("shareBtn");
const trackingPanel = document.getElementById("trackingPanel");
const trackingDot = document.getElementById("trackingDot");
const trackingText = document.getElementById("trackingText");
const helpText = document.getElementById("helpText");
const lastUpdateText = document.getElementById("lastUpdateText");
const busStatusText = document.getElementById("busStatusText");
const popup = document.getElementById("trackingPopup");
const arrivalText = document.getElementById("arrivalText");

//Step4: ---- State ----
// Bus marker on the map lives in liveTracking.js (LiveBusTracking.getBusMarker()).
// Passenger GPS sharing only POSTs coordinates to the backend — it does NOT
// draw a marker on the map. This is the only marker policy: ONE bus marker.
let selectedBus = null;
let passengerWatchId = null;
let sharingActive = false;
let lastSentAt = null;
let lastServerLocation = null;
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

//Step5: ---- Utilities ----
function showSuggestions(input, list, suggestionsDiv, targetInput) {
  suggestionsDiv.innerHTML = "";
  if (!input) return;

  list
    .filter((item) => item.toLowerCase().includes(input.toLowerCase()))
    .forEach((item) => {
      const div = document.createElement("div");
      div.className = "suggest-item";
      div.textContent = item;
      div.onclick = () => {
        suggestionsDiv.innerHTML = "";
        targetInput.value = item;
      };
      suggestionsDiv.appendChild(div);
    });
}

function getBusKey(bus, area, destination, index) {
  return `${bus.route}-${area}-${destination}-${index}`;
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
    trackingText.textContent = selectedBus
      ? `You are helping track Bus ${selectedBus.route}`
      : "You are helping track this bus";
  } else {
    trackingText.textContent = "Tracking inactive";
    helpText.textContent = selectedBus
      ? `You stopped helping track Bus ${selectedBus.route}.`
      : "Tracking is inactive.";
  }
}

function showPopupMessage() {
  popup.classList.add("visible");
  setTimeout(() => popup.classList.remove("visible"), 3000);
}

function ensureMap() {
  if (!window.LiveBusTracking) {
    console.error(
      "[timeTable] LiveBusTracking not loaded. Ensure js/liveTracking.js runs after Leaflet.",
    );
    return;
  }
  if (!window.L) {
    console.error("[timeTable] Leaflet not loaded (window.L missing).");
    return;
  }
  LiveBusTracking.ensureMap();
  map = LiveBusTracking.getMap();
}

function updateArrivalEstimate() {
  if (!map || !selectedBus || !lastServerLocation) {
    arrivalText.textContent = "Arrival estimate unavailable.";
    return;
  }

  const target = selectedBus.stopLatLng;
  if (!target) {
    arrivalText.textContent = "Arrival estimate unavailable.";
    return;
  }

  const busLatLng = L.latLng(
    lastServerLocation.latitude,
    lastServerLocation.longitude,
  );
  const meters = map.distance(target, busLatLng);
  const speedMps = 8.3;
  const etaMins = Math.max(1, Math.round(meters / speedMps / 60));
  arrivalText.textContent = `Bus arriving in ${etaMins} minute${etaMins === 1 ? "" : "s"}.`;
}

function updateLastSentLabel() {
  lastUpdateText.textContent = `Last update: ${minutesAgoLabel(lastSentAt)}`;
}

async function postPassengerLocation(position) {
  if (!sharingActive) return;

  const busId = getSelectedBusId();
  if (!busId) {
    showOnPage("Select a bus first");
    stopSharing();
    return;
  }

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  const url = getLocationPostUrl(busId);
  const rawToken = localStorage.getItem("access_token");
  const token = getAuthToken();

  console.log("[timeTable] POST URL:", url);
  console.log("[timeTable] access_token in localStorage?", Boolean(rawToken));
  console.log(
    "[timeTable] using token (any key)?",
    Boolean(token),
    token ? `length=${token.length}` : "",
  );

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
    console.warn("[timeTable]", msg);
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
    console.error(
      "[timeTable] Network error posting passenger location:",
      err,
      "URL:",
      url,
    );
    showOnPage(`POST network error: ${err.message || err} (URL: ${url})`);
    return;
  }

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch (readErr) {
    console.warn("[timeTable] Could not read response body:", readErr);
  }
  console.log(
    "[timeTable] POST response:",
    res.status,
    res.statusText,
    "body:",
    bodyText,
  );

  if (!res.ok) {
    const excerpt = (bodyText || "").slice(0, 200) || "(empty body)";
    const visible = `POST failed: ${res.status} ${res.statusText} — ${excerpt}`;
    console.error("[timeTable]", visible, "URL:", url);
    showOnPage(visible);
    if (res.status === 401 || res.status === 403) {
      stopSharing();
    }
    return;
  }

  console.log(`Passenger location sent: ${lat}, ${lng}`);
  lastSentAt = new Date();
  updateLastSentLabel();
  showOnPage(
    `Sharing your location with Bus ${selectedBus ? selectedBus.route : ""}`,
  );
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
  console.log("[timeTable] Stopped sharing location (clearWatch).");
  setTrackingUi(false);
}

function onGpsSuccess(position) {
  lastKnownPosition = position;

  if (selectedBus && window.L) {
    selectedBus.stopLatLng = L.latLng(
      position.coords.latitude,
      position.coords.longitude,
    );
  }

  // Passenger GPS sharing only POSTs; it never draws a marker on the map.
  postPassengerLocation(position);
}

function onGpsError(err) {
  console.warn(
    "[timeTable] watchPosition error:",
    err.code,
    err.message,
    describeGeoError(err),
  );

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

    console.log("[timeTable] Retrying GPS watch...");
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
  if (!selectedBus || !getSelectedBusId()) {
    showOnPage("Select a bus first");
    return;
  }

  if (!navigator.geolocation) {
    showOnPage("Geolocation is not supported by this browser.");
    console.error("[timeTable] navigator.geolocation is unavailable.");
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

window.addEventListener("livebus:location", (e) => {
  lastServerLocation = e.detail;
  if (!selectedBus) return;
  const ageMs =
    Date.now() - new Date(lastServerLocation.timestamp || Date.now()).getTime();
  if (ageMs > 2 * 60 * 1000) {
    busStatusText.textContent = "Bus not currently tracked.";
    return;
  }
  busStatusText.textContent = `Showing live location for Bus ${selectedBus.route}`;
  updateArrivalEstimate();
});

window.addEventListener("livebus:no-location", () => {
  if (!selectedBus) return;
  lastServerLocation = null;
  busStatusText.textContent =
    "There is no one sharing location on this bus. Please share location.";
  arrivalText.textContent = "Arrival estimate unavailable.";
});

window.addEventListener("livebus:error", (e) => {
  if (!selectedBus) return;
  const detail = e.detail || {};
  if (detail.status) {
    busStatusText.textContent = `Could not fetch bus location (HTTP ${detail.status}).`;
  } else {
    busStatusText.textContent = `Could not fetch bus location: ${detail.message || "network error"}.`;
  }
});

function selectBus(bus, area, destination, index) {
  if (!bus || !bus.bus_id) {
    console.error(
      "[timeTable] Bus is missing a backend bus_id; cannot start tracking.",
      bus,
    );
    busStatusText.textContent = "This bus is not configured for live tracking.";
    return;
  }

  ensureMap();
  selectedBus = {
    ...bus,
    uiKey: getBusKey(bus, area, destination, index),
    stopLatLng: null,
  };
  lastServerLocation = null;
  arrivalText.textContent = "Arrival estimate unavailable.";

  trackingPanel.classList.remove("hidden");
  shareBtn.disabled = false;
  setTrackingUi(false);
  helpText.textContent = `You are now helping track Bus ${selectedBus.route} when sharing is on.`;
  busStatusText.textContent = `Fetching latest location for Bus ${selectedBus.route}...`;

  if (window.LiveBusTracking) {
    LiveBusTracking.setRouteLabel(`Bus ${bus.route}`);
    LiveBusTracking.setBusId(bus.bus_id);
  }
}

//Step6: ---- Auto-suggest wiring ----
areaInput.addEventListener("input", () => {
  const areas = Object.keys(data);
  showSuggestions(areaInput.value, areas, areaSuggestions, areaInput);
  destInput.disabled = false;
});

destInput.addEventListener("input", () => {
  const area = areaInput.value;
  if (!data[area]) return;
  const destinations = Object.keys(data[area]);
  showSuggestions(destInput.value, destinations, destSuggestions, destInput);
});

findBtn.onclick = () => {
  busList.innerHTML = "";
  const area = areaInput.value;
  const dest = destInput.value;

  if (!data[area] || !data[area][dest]) {
    busList.innerHTML = "<li>No buses found</li>";
    return;
  }

  data[area][dest].forEach((bus, index) => {
    const li = document.createElement("li");
    const busId = bus.bus_id || "";
    li.innerHTML = `
      <div class="bus-card" data-bus-id="${busId}">
        <div class="bus-item">
          <strong>Bus ${bus.route}</strong><br>
          Time: ${bus.time}<br>
          ${bus.destination}
        </div>
        <div>
          <button class="timetable-btn" data-bus-id="${busId}">View Location</button>
        </div>
      </div>
    `;
    const button = li.querySelector(".timetable-btn");
    button.addEventListener("click", () => {
      const id = button.dataset.busId;
      if (!id) {
        busStatusText.textContent =
          "This bus is not configured for live tracking.";
        return;
      }
      // Always carry the id read from the clicked card. No fallback, no
      // sharing of ids across cards.
      selectBus({ ...bus, bus_id: id }, area, dest, index);
    });
    busList.appendChild(li);
  });
};

shareBtn.disabled = false;
shareBtn.addEventListener("click", () => {
  if (sharingActive) {
    stopSharing();
    return;
  }
  startSharing();
});

// --- Future: "I Am Waiting Here" ---
// Restore in timeTable.html: <button id="waitingBtn" class="secondary-btn">,
// <p id="waitingInfo" class="waiting-info">. Track `waitingActive`, use
// getCurrentPosition to set selectedBus.stopLatLng, and surface distance/ETA
// in waitingInfo or arrivalText as needed.

lastSentTickerId = setInterval(updateLastSentLabel, 5000);
