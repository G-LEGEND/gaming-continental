// ================== HELPER ==================
async function postJson(url, data, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = "Bearer " + token;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(data)
  });
  return res;
}

async function getJson(url, auth = false) {
  const headers = {};
  if (auth) {
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = "Bearer " + token;
  }

  const res = await fetch(url, { headers });
  return res;
}

// ================== LOGIN ==================
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const res = await postJson("/auth/login", { email, password });
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("loginMessage").textContent =
        data.error || "Login failed";
      return;
    }

    // Save auth
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // Redirect
    if (data.user.isAdmin) {
      window.location.href = "/admin-dashboard.html";
    } else {
      window.location.href = "/dashboard.html";
    }
  });
}

// ================== REGISTER ==================
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nickname = document.getElementById("nickname").value.trim(); // ✅ use nickname
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value.trim();
    const confirmPassword = document.getElementById("regConfirm").value.trim(); // ✅ send confirmPassword

    const msg = document.getElementById("registerMessage");
    if (password !== confirmPassword) {
      msg.textContent = "Passwords do not match";
      return;
    }

    const res = await postJson("/auth/register", { nickname, email, password, confirmPassword });
    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "Registration failed";
      return;
    }

    // Save auth
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // Redirect
    window.location.href = "/dashboard.html";
  });
}

// ================== LOGOUT ==================
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/index.html";
}