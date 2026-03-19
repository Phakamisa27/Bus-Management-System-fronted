//load bus companies from
fetch("data/companies.json")
  .then((response) => response.json())
  .then((companies) => {
    const grid = document.getElementById("companyGrid");
    companies.forEach((company) => {
      const card = document.createElement("div");
      card.classList.add("company-card");

      card.innerHTML = `<h3>${company.name}</h3>
              <p>${company.tagline}</p>`;

      //when user select company
      card.onclick = () => {
        localStorage.setItem("selectCompany", company.name);
        window.location.href = "dashbroad.html";
      };
      grid.appendChild(card);
    });
  })
  .catch((error) => console.error("Error loading companies:", error));
