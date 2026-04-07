// ---- Load JSON ----
let data = {};
fetch("data/timeTable.json")
  .then((res) => res.json())
  .then((json) => (data = json));

// ---- Elements ----
const areaInput = document.getElementById("areaInput");
const areaSuggestions = document.getElementById("areaSuggestions");

const destInput = document.getElementById("destInput");
const destSuggestions = document.getElementById("destSuggestions");

const busList = document.getElementById("busList");

// ---- Auto Suggest Function ----
function showSuggestions(input, list, suggestionsDiv) {
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
        if (input === areaInput.value) {
          areaInput.value = item;
        } else {
          destInput.value = item;
        }
      };

      suggestionsDiv.appendChild(div);
    });
}
// AREA Input
areaInput.addEventListener("input", () => {
  let areas = Object.keys(data);

  showSuggestions(areaInput.value, areas, areaSuggestions, areaInput);

  // Enable destination input after selecting area
  destInput.disabled = false;
});

// ---- DEST Input ----
destInput.addEventListener("input", () => {
  let area = areaInput.value;
  if (!data[area]) return;

  let destinations = Object.keys(data[area]);
  showSuggestions(destInput.value, destinations, destSuggestions);
});

// ---- Find Buses ----
document.getElementById("findBtn").onclick = () => {
  busList.innerHTML = "";

  const area = areaInput.value;
  const dest = destInput.value;

  if (!data[area] || !data[area][dest]) {
    busList.innerHTML = "<li>No buses found</li>";
    return;
  }

  data[area][dest].forEach((bus) => {
    const li = document.createElement("li");
    li.innerHTML = `
  <div class="bus-card">
    <div class="bus-item">
      <strong>Bus ${bus.route}</strong><br>
      Time: ${bus.time}<br>
      ${bus.destination}
    <div>
     <button class="timetable-btn">View Location</button>
  </div>
    `;
    busList.appendChild(li);
  });
};
