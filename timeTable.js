fetch("timeTable.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! statu: ${response.statu}`);
    }
    return response.json();
  })
  .then((data) => {
    console.log(data);
  })
  .catch((error) => {
    console.error("Error fetching JSON:", error);
  });
