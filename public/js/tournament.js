async function getJson(url, auth = false) {
  const headers = {};
  if (auth) {
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = "Bearer " + token;
  }
  const res = await fetch(url, { headers });
  return res.json();
}

async function loadTournaments() {
  const container = document.getElementById("tournaments");
  const adminContainer = document.getElementById("adminTournaments");
  const list = await getJson("/tournament");

  // --------- USER VIEW ----------
  if (container) {
    container.innerHTML = "";
    list.forEach(t => {
      const div = document.createElement("div");
      div.className = "tournament-card";
      div.innerHTML = `
        <img src="${t.image}" alt="${t.title}" />
        <div class="info">
          <h4>${t.title}</h4>
          <div class="meta">Min: ${t.minAmount} | Max: ${t.maxAmount}</div>
          <button data-id="${t._id}" class="registerBtn">Register now</button>
        </div>
      `;
      container.appendChild(div);
    });

    // Attach register handlers
    document.querySelectorAll(".registerBtn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const tId = e.target.dataset.id;
        const amount = prompt("Enter amount to register with:");
        if (!amount) return;

        const token = localStorage.getItem("token");
        if (!token) {
          alert("Please login first");
          window.location.href = "/index.html";
          return;
        }

        const res = await fetch(`/tournament/register/${tId}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify({ amount })
        });

        const data = await res.json();
        if (!res.ok) return alert(data.error || "Registration failed");

        alert(data.message || "Registered successfully!");
        window.location.reload();
      });
    });
  }

  // --------- ADMIN VIEW ----------
  if (adminContainer) {
    adminContainer.innerHTML = "";
    list.forEach(t => {
      const div = document.createElement("div");
      div.className = "tournament-card";
      div.innerHTML = `
        <img src="${t.image}" alt="${t.title}" />
        <div class="info">
          <h4>${t.title}</h4>
          <div class="meta">Min: ${t.minAmount} | Max: ${t.maxAmount}</div>
          <button data-id="${t._id}" class="deleteBtn">Delete</button>
        </div>
      `;
      adminContainer.appendChild(div);
    });

    document.querySelectorAll(".deleteBtn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        if (!confirm("Delete this tournament?")) return;
        const id = e.target.dataset.id;
        const token = localStorage.getItem("token");
        if (!token) return alert("Admin login required");

        const res = await fetch("/tournament/" + id, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token }
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || "Delete failed");
        alert("Deleted");
        loadTournaments();
      });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadTournaments();

  // --------- ADMIN ADD TOURNAMENT ----------
  const addForm = document.getElementById("addTourForm");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("tTitle").value;
      const image = document.getElementById("tImage").value;
      const minAmount = Number(document.getElementById("tMin").value);
      const maxAmount = Number(document.getElementById("tMax").value);
      const maxPlayers = Number(document.getElementById("tPlayers").value);

      const token = localStorage.getItem("token");
      if (!token) return alert("Admin login required");

      const res = await fetch("/tournament/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ title, image, minAmount, maxAmount, maxPlayers })
      });

      const data = await res.json();
      if (!res.ok) return alert(data.error || "Add failed");

      alert("Tournament added");
      loadTournaments();
      addForm.reset();
    });
  }
});