//Step1: ---- Backend endpoints ----
const API_BASE_URL = "";
const LOCATION_POST_ENDPOINT = `${API_BASE_URL}/api/bus-locations`;
const LOCATION_GET_ENDPOINT = `${API_BASE_URL}/api/bus-locations`;

//Step2: ---- Load JSON ----
let data = {};
fetch("data/timeTable.json")
  .then((res) => res.json())
  .then((json) => {
    data = json;
  });

//Step3: ---- Elements ----
const areaInput = document.getElementById("areaInput");
const areaSuggestions = document.getElementById("areaSuggestions");
const destInput = document.getElementById("destInput");
const destSuggestions = document.getElementById("destSuggestions");
const busList = document.getElementById("busList");
const findBtn = document.getElementById("findBtn");
const shareBtn = document.getElementById("shareBtn");
const waitingBtn = document.getElementById("waitingBtn");
const trackingPanel = document.getElementById("trackingPanel");
const trackingDot = document.getElementById("trackingDot");
const trackingText = document.getElementById("trackingText");
const helpText = document.getElementById("helpText");
const waitingInfo = document.getElementById("waitingInfo");
const lastUpdateText = document.getElementById("lastUpdateText");
const busStatusText = document.getElementById("busStatusText");
const popup = document.getElementById("trackingPopup");
const arrivalText = document.getElementById("arrivalText");

//Step4: ---- State ----
let selectedBus = null;
let watchId = null;
let sharingActive = false;
let waitingActive = false;
let lastSentAt = null;
let lastServerLocation = null;
let map = null;
let userMarker = null;
let busMarker = null;
let pollIntervalId = null;
let lastSentTickerId = null;

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

function getBusId(bus, area, destination, index) {
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
  trackingText.textContent = isActive ? "Tracking active" : "Tracking inactive";
  if (!isActive) {
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
  if (map || !window.L) return;
  map = L.map("map").setView([-29.88, 30.94], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
}

function smoothMove(marker, targetLatLng) {
  if (!marker) return;
  const start = marker.getLatLng();
  const duration = 1200;
  const startTime = performance.now();

  function animate(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const lat = start.lat + (targetLatLng.lat - start.lat) * progress;
    const lng = start.lng + (targetLatLng.lng - start.lng) * progress;
    marker.setLatLng([lat, lng]);
    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function updateArrivalEstimate() {
  if (!map || !selectedBus || !lastServerLocation) {
    arrivalText.textContent = "Arrival estimate unavailable.";
    return;
  }

  const target =
    selectedBus.stopLatLng || (userMarker && userMarker.getLatLng());
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

  if (waitingActive) {
    waitingInfo.textContent = `Bus is ${(meters / 1000).toFixed(2)} km away.`;
  }
}

function updateLastSentLabel() {
  lastUpdateText.textContent = `Last update: ${minutesAgoLabel(lastSentAt)}`;
}

async function postPassengerLocation(position) {
  if (!sharingActive || !selectedBus) return;

  const payload = {
    busId: selectedBus.busId,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(LOCATION_POST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    lastSentAt = new Date();
    updateLastSentLabel();
  } catch (_error) {
    busStatusText.textContent = "Unable to send live location to backend.";
  }
}

function stopSharing() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  setTrackingUi(false);
}

function startSharing() {
  if (!selectedBus) return;
  showPopupMessage();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setTrackingUi(true);
      selectedBus.stopLatLng = L.latLng(
        position.coords.latitude,
        position.coords.longitude,
      );

      if (userMarker) {
        userMarker.setLatLng(selectedBus.stopLatLng);
      } else {
        userMarker = L.marker(selectedBus.stopLatLng)
          .addTo(map)
          .bindPopup("You are here");
      }

      postPassengerLocation(position);
      watchId = navigator.geolocation.watchPosition(
        (pos) => postPassengerLocation(pos),
        () => {
          busStatusText.textContent =
            "Location error. Tracking has been stopped.";
          stopSharing();
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      );
    },
    () => {
      busStatusText.textContent = "Location permission denied.";
      setTrackingUi(false);
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

async function fetchBusLatestLocation() {
  if (!selectedBus) return;
  try {
    const response = await fetch(
      `${LOCATION_GET_ENDPOINT}?busId=${encodeURIComponent(selectedBus.busId)}`,
    );
    if (!response.ok) throw new Error("Fetch failed");

    const dataResponse = await response.json();
    const points = Array.isArray(dataResponse)
      ? dataResponse
      : dataResponse.locations || [];
    if (!points.length) {
      busStatusText.textContent = "Bus not currently tracked.";
      return;
    }

    const latest = points.reduce((acc, current) => {
      const accTime = new Date(acc.timestamp || 0).getTime();
      const currentTime = new Date(current.timestamp || 0).getTime();
      return currentTime > accTime ? current : acc;
    }, points[0]);

    lastServerLocation = latest;
    const ageMs =
      Date.now() - new Date(latest.timestamp || Date.now()).getTime();
    if (ageMs > 2 * 60 * 1000) {
      busStatusText.textContent = "Bus not currently tracked.";
      return;
    }

    const latLng = L.latLng(latest.latitude, latest.longitude);
    if (!busMarker) {
      busMarker = L.marker(latLng)
        .addTo(map)
        .bindPopup(`Bus ${selectedBus.route}`);
      map.setView(latLng, 14);
    } else {
      smoothMove(busMarker, latLng);
    }

    busStatusText.textContent = `Showing live location for Bus ${selectedBus.route}`;
    updateArrivalEstimate();
  } catch (_error) {
    busStatusText.textContent = "Live location unavailable.";
  }
}

function beginPolling() {
  if (pollIntervalId) clearInterval(pollIntervalId);
  fetchBusLatestLocation();
  pollIntervalId = setInterval(fetchBusLatestLocation, 4000);
}

function selectBus(bus, area, destination, index) {
  ensureMap();
  selectedBus = {
    ...bus,
    busId: getBusId(bus, area, destination, index),
    stopLatLng: null,
  };

  trackingPanel.classList.remove("hidden");
  shareBtn.disabled = false;
  waitingBtn.disabled = false;
  setTrackingUi(false);
  helpText.textContent = `You are now helping track Bus ${selectedBus.route} when sharing is on.`;
  waitingInfo.textContent = "";
  busStatusText.textContent = `Fetching latest location for Bus ${selectedBus.route}...`;
  beginPolling();
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
    li.innerHTML = `
      <div class="bus-card">
        <div class="bus-item">
          <strong>Bus ${bus.route}</strong><br>
          Time: ${bus.time}<br>
          ${bus.destination}
        </div>
        <div>
          <button class="timetable-btn">View Location</button>
        </div>
      </div>
    `;
    const button = li.querySelector(".timetable-btn");
    button.addEventListener("click", () => selectBus(bus, area, dest, index));
    busList.appendChild(li);
  });
};

shareBtn.addEventListener("click", () => {
  if (!selectedBus) return;
  if (sharingActive) {
    stopSharing();
    return;
  }
  startSharing();
});

waitingBtn.addEventListener("click", () => {
  waitingActive = !waitingActive;
  waitingBtn.classList.toggle("active", waitingActive);
  if (!waitingActive) {
    waitingInfo.textContent = "";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latLng = L.latLng(
        position.coords.latitude,
        position.coords.longitude,
      );
      if (!userMarker) {
        userMarker = L.marker(latLng).addTo(map).bindPopup("Your stop");
      } else {
        userMarker.setLatLng(latLng);
      }
      if (selectedBus) selectedBus.stopLatLng = latLng;
      updateArrivalEstimate();
    },
    () => {
      waitingInfo.textContent = "Unable to get your current stop location.";
      waitingActive = false;
      waitingBtn.classList.remove("active");
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

lastSentTickerId = setInterval(updateLastSentLabel, 5000);
