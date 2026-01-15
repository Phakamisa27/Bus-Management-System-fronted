//Step1: Get HTML element
const regionSelect = document.getElementById("selectRegion");
const areaSelect = document.getElementById("areaSelect");
const destinationSelect = document.getElementsById("selectDestination");
const output = document.getElementById("output");

//Step2: Variable to store JSON data
let busData = {};

//Step3: Fetch the JSON file
fetch("js/timeTable.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! statu: ${response.status}`);
    }
    return response.json();
  })
  .then((data) => {
    busData = data;
    loadRegion();
  })
  .catch((error) => {
    console.error("Error fetching JSON:", error);
  });

//Step4: load Region function
function loadRegion() {
  regionSelect.innerHTML = `<option value="">-- Select Region --</option>`;
  for (let region in busData) {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    regionSelect.appendChild(option);
  }
}
//Step5: load Area
regionSelect.addEventListener("change", () => {
  areaSelect.innerHTML = `<option value="">-- Select Area --<option>`;
  destinationSelect.innerHTML = `<option value="">-- Select Destination --<option>`;
  output.textContent = "";

  const selectRegion = regionSelect.value;
  if (!selectRegion) return;

  const area = busData[selectRegion];

  for (let area in area) {
    const option = document.createElement("option");
    option.value = area;
    option.textContent = area;
    areaSelect.appendChild(option);
  }
});

//Step6: load destination
areaSelect.addEventListener("change", () => {
  destinationSelect.innerHTML = `<option value="">-- Select Destination --</option>`;
  output.textContent = "";

  const region = regionSelect.value;
  const area = areaSelect.value;
  if (!area) return;

  const destination = busData[region][area];

  for (let destination in destination) {
    const option = document.createElement("option");
    option.value = destination;
    option.textContent = destination;
    destinationSelect.appendChild(option);
  }
});

//Step7: load timetable
destinationSelect.addEventListener("change", () => {
  output.textContent = "";

  const region = regionSelect.value;
  const area = areaSelect.value;
  const destination = destination.value;
  if (!destination) return;

  const buses = busData[region][area][destination];

  let result = `Destination: ${destination}\n\n`;

  buses.forEach((bus) => {
    result += `Route: ${bus["Route No"]} | Time: ${bus.time}\n`;
  });
  output.textContent = result;
});
