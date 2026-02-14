//Step1: Get HTML element
const regionSelect = document.getElementById("selectRegion");
const areaSelect = document.getElementById("areaSelect");
const destinationSelect = document.getElementById("selectDestination");
const output = document.getElementById("output");
const timeTable = document.getElementById("timetable");

//Step2: Empty box to keep data
let data = {};

//Step3: Get the JSON file
fetch("timeTable.json")
  .then((response) => response.json())
  .then((json) => {
    data = json;
    loadRegions();
  });

//Step4: load Region
function loadRegions() {
  regionSelect.innerHTML = "<option>Select Region</option>";

  for (let region in data) {
    let opt = document.createElement("option");
    opt.textContent = region;
    regionSelect.appendChild(opt);
  }
}

//Step5: when user clicks region
regionSelect.onchange = function () {
  areaSelect.innerHTML = "<option>Select Area</option>";
  destinationSelect.innerHTML = "";
  output.textContent = "";

  let region = this.value;

  for (let area in data[region]) {
    let opt = document.createElement("option");
    opt.textContent = area;
    areaSelect.appendChild(opt);
  }
};

//Step6: when user picks area
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

//Step 7: when click user choose destination
destinationSelect.onchange = function () {
  output.textContent = "";

  let region = regionSelect.value;
  let area = areaSelect.value;
  let dest = this.value;

  let buses = data[region][area][dest];
};

//Step 8: Making bus list clickable
timeTable.addEventListener("click", function (event) {
  timeTable.data[region][area][dest];

  buses.forEach((bus) => {});
});
