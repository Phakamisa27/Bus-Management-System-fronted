// Route selection page — pick area + destination, then go to bus-results.html.

let data = {};
BusDataStore.init()
  .then(() => {
    data = BusDataStore.getTimetableData();
    renderPassengerAlerts();
  })
  .catch((err) => {
    console.error("[selectRoute] Failed to load timetable data:", err);
  });

function renderPassengerAlerts() {
  const alerts = BusDataStore.getActiveAlerts();
  const container = document.getElementById("passengerAlerts");
  if (!container || !alerts.length) return;

  container.hidden = false;
  container.innerHTML = alerts
    .map(
      (alert) =>
        `<div class="passenger-alert" role="alert">${escapeAlertHtml(alert.message)}</div>`,
    )
    .join("");
}

function escapeAlertHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const areaInput = document.getElementById("areaInput");
const areaSuggestions = document.getElementById("areaSuggestions");
const destInput = document.getElementById("destInput");
const destSuggestions = document.getElementById("destSuggestions");
const findBtn = document.getElementById("findBtn");
const routeStatus = document.getElementById("routeStatus");

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

function setRouteStatus(msg) {
  if (routeStatus) {
    routeStatus.textContent = msg || "";
  }
}

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
  setRouteStatus("");
  const area = areaInput.value.trim();
  const dest = destInput.value.trim();

  if (!area || !dest) {
    setRouteStatus("Please select both an area and a destination.");
    return;
  }

  if (!data[area] || !data[area][dest]) {
    setRouteStatus("No route found for that area and destination.");
    return;
  }

  localStorage.setItem("selectedArea", area);
  localStorage.setItem("selectedDestination", dest);
  window.location.href = "bus-results.html";
};
