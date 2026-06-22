// Bus results page — shows timetable cards for the route saved in localStorage.

const TAB_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SCHEDULE_KEYS = {
  Monday: "Monday-Friday",
  Tuesday: "Monday-Friday",
  Wednesday: "Monday-Friday",
  Thursday: "Monday-Friday",
  Friday: "Monday-Friday",
  Saturday: "Saturday",
  Sunday: "Sunday",
};

const selectedArea = localStorage.getItem("selectedArea");
const selectedDestination = localStorage.getItem("selectedDestination");

const selectedRouteEl = document.getElementById("selectedRoute");
const dayTabsEl = document.getElementById("dayTabs");
const busListEl = document.getElementById("busList");
const busListStatusEl = document.getElementById("busListStatus");

let data = {};
let activeDay = getTodayTabDay();

if (!selectedArea || !selectedDestination) {
  window.location.href = "select-route.html";
} else if (selectedRouteEl) {
  selectedRouteEl.textContent = `${selectedArea} → ${selectedDestination}`;
}

function getTodayTabDay() {
  const jsDay = new Date().getDay();
  if (jsDay === 0) return "Sunday";
  if (jsDay === 6) return "Saturday";
  const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return weekdayNames[jsDay];
}

function setBusListStatus(msg) {
  if (busListStatusEl) {
    busListStatusEl.textContent = msg || "";
  }
}

function buildMapUrl(bus) {
  const params = new URLSearchParams({ busId: bus.bus_id });
  if (bus.bus_number) params.set("route", bus.bus_number);
  if (bus.time) params.set("time", bus.time);
  if (bus.route) params.set("dest", bus.route);
  return `map.html?${params.toString()}`;
}

function openBusMap(bus) {
  if (!bus || !bus.bus_id) {
    setBusListStatus("This bus is not configured for live tracking.");
    return;
  }
  window.location.href = buildMapUrl(bus);
}

function getBusesForDay(day) {
  const scheduleKey = SCHEDULE_KEYS[day];
  const routeData = data[selectedArea]?.[selectedDestination];
  if (!routeData || !scheduleKey) return [];
  return routeData[scheduleKey] || [];
}

function renderBusCards(day) {
  if (!busListEl) return;

  busListEl.innerHTML = "";
  setBusListStatus("");

  const buses = getBusesForDay(day);

  if (!buses.length) {
    busListEl.innerHTML =
      '<li class="results-empty">No buses available for this day.</li>';
    return;
  }

  buses.forEach((bus) => {
    const li = document.createElement("li");
    li.className = "results-bus-item";

    li.innerHTML = `
      <article class="results-bus-card">
        <div class="results-bus-info">
          <h3 class="results-bus-number">Bus ${bus.bus_number}</h3>
          <p class="results-bus-time">${bus.time}</p>
          <p class="results-bus-route">${bus.route}</p>
        </div>
        <button type="button" class="timetable-btn view-location-btn">View Location</button>
      </article>
    `;

    const btn = li.querySelector(".view-location-btn");
    btn.addEventListener("click", () => openBusMap(bus));

    busListEl.appendChild(li);
  });
}

function setActiveTab(day) {
  activeDay = day;
  dayTabsEl.querySelectorAll(".day-tab").forEach((tab) => {
    const isActive = tab.dataset.day === day;
    tab.classList.toggle("day-tab--active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  renderBusCards(day);
}

function buildDayTabs() {
  if (!dayTabsEl) return;

  dayTabsEl.innerHTML = "";

  TAB_DAYS.forEach((day) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "day-tab";
    tab.dataset.day = day;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.textContent = day;

    if (day === activeDay) {
      tab.classList.add("day-tab--active");
      tab.setAttribute("aria-selected", "true");
    }

    tab.addEventListener("click", () => setActiveTab(day));
    dayTabsEl.appendChild(tab);
  });
}

BusDataStore.init()
  .then(() => {
    data = BusDataStore.getTimetableData();

    if (!data[selectedArea] || !data[selectedArea][selectedDestination]) {
      window.location.href = "select-route.html";
      return;
    }

    buildDayTabs();
    renderBusCards(activeDay);
    renderPassengerAlerts();
  })
  .catch((err) => {
    console.error("[bus-results] Failed to load timetable data:", err);
    setBusListStatus("Could not load bus schedules. Please try again.");
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
