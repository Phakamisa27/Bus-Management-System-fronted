//Step1: Get HTML element
const regionSelect = document.getElementById("selectRegion");
const areaSelect = document.getElementById("areaSelect");
const destinationSelect = document.getElementById("selectDestination");
const output = document.getElementById("output");
const timeTable = document.getElementById("timetable");

//Step2: Empty box to keep data
let data = {};
let currentBuses = [];

//Step3: Get the JSON Data
fetch("data/timeTable.json")
  .then((response) => response.json())
  .then((json) => {
    data = json;
    loadRegions();
  });

//Step4: load Region
function loadRegions() {
  regionSelect.innerHTML = "<option> Select Region </option>";

  for (let region in data) {
    let opt = document.createElement("option");
    opt.textContent = region;
    regionSelect.appendChild(opt);
  }
}

//Step5: when user choose region
regionSelect.onchange = function () {
  areaSelect.innerHTML = "<option> Select Area </option>";
  destinationSelect.innerHTML = "";
  output.textContent = "";

  let region = this.value;

  for (let area in data[region]) {
    let opt = document.createElement("option");
    opt.textContent = area;
    areaSelect.appendChild(opt);
  }
};

//Step6: when user choose area
areaSelect.onchange = function () {
  destinationSelect.innerHTML = "";
  output.textContent = "";

  let region = regionSelect.value;
  let area = this.value;

  for (let dest in data[region][area]) {
    let opt = document.createElement("option");
    opt.textContent = dest;
    destinationSelect.appendChild(opt);
  }
};

//when the use choose destination, show the buses of that destination
destinationSelect.onchange = function () {
  output.innerHTML = "";

  let region = regionSelect.value;
  let area = areaSelect.value;
  let dest = this.value;

  let buses = data[region][area][dest];
  currentBuses = buses;

  buses.forEach((bus) => {
    const li = document.createElement("li");

    li.classList.add("bus-item");

    li.innerHTML = `
    <div class="bus-card">
     
     <div class="bus-top">
      <strong>Bus${bus["Route No"]}</strong>
     <div>
      
     <div class="bus-route">
      ${area} -> ${dest}
     </div>
     
     <div class="bus-times">
      <span>Departure: ${bus.time}</span>
      <span>Arrival: ${bus.time}</span>
     </div>

     <div class="bus-status ${bus.status === "Delayed" ? "delayed" : "ontime"}">
      <strong>${bus.status}</strong><br>
      Reason: ${bus.reason || "On Shcedule"}<br>
      Extar-Time: ${bus.extarTime || "0 minutes"}
     </div>
    </div>
    `;

    output.appendChild(li);
  });
};
