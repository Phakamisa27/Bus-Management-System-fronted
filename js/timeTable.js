// Route finder page.
//
// This page only lets the user pick an area + destination and lists the
// matching buses. Each bus card is clickable and navigates to the dedicated
// map page for that specific bus:
//
//   map.html?busId=<BUS_ID>
//
// The live map / location-sharing UI lives entirely on map.html (js/map.js).

//Step1: ---- Load JSON ----
let data = {};
fetch("data/timeTable.json")
  .then((res) => res.json())
  .then((json) => {
    data = json;
  })
  .catch((err) => {
    console.error("[timeTable] Failed to load timetable data:", err);
  });

//Step2: ---- Elements ----
const areaInput = document.getElementById("areaInput");
const areaSuggestions = document.getElementById("areaSuggestions");
const destInput = document.getElementById("destInput");
const destSuggestions = document.getElementById("destSuggestions");
const busList = document.getElementById("busList");
const findBtn = document.getElementById("findBtn");
const busListStatus = document.getElementById("busListStatus");

//Step3: ---- Utilities ----
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

function setBusListStatus(msg) {
  if (busListStatus) {
    busListStatus.textContent = msg || "";
  }
}

// Build the URL for the dedicated map page. The bus_id read from THIS card is
// the route's tracking channel, so each card opens its own independent map and
// never reuses another bus's location.
function buildMapUrl(bus) {
  const params = new URLSearchParams({ busId: bus.bus_id });
  if (bus.route) params.set("route", bus.route);
  if (bus.time) params.set("time", bus.time);
  if (bus.destination) params.set("dest", bus.destination);
  return `map.html?${params.toString()}`;
}

function openBusMap(bus) {
  if (!bus || !bus.bus_id) {
    setBusListStatus("This bus is not configured for live tracking.");
    return;
  }
  window.location.href = buildMapUrl(bus);
}

//Step4: ---- Auto-suggest wiring ----
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

//Step5: ---- Find + render clickable bus cards ----
findBtn.onclick = () => {
  busList.innerHTML = "";
  setBusListStatus("");
  const area = areaInput.value;
  const dest = destInput.value;

  if (!data[area] || !data[area][dest]) {
    busList.innerHTML = "<li>No buses found</li>";
    return;
  }

  data[area][dest].forEach((bus) => {
    const li = document.createElement("li");
    const busId = bus.bus_id || "";
    li.innerHTML = `
      <div class="bus-card" data-bus-id="${busId}" role="button" tabindex="0" aria-label="View live location for Bus ${bus.route}">
        <div class="bus-item">
          <strong>Bus ${bus.route}</strong><br>
          Time: ${bus.time}<br>
          ${bus.destination}
        </div>
      </div>
    `;

    const card = li.querySelector(".bus-card");
    card.addEventListener("click", () => openBusMap(bus));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBusMap(bus);
      }
    });

    busList.appendChild(li);
  });
};
