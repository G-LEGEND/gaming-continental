function loadFooter() {
  fetch("footer.html")
    .then(res => res.text())
    .then(html => {
      const container = document.getElementById("footerContainer");
      container.innerHTML = html;

      // ✅ Re-select inside the injected footer
      const items = container.querySelectorAll(".footer-item");
      items.forEach(item => {
        item.addEventListener("click", () => {
          const page = item.getAttribute("data-page");
          if (page) {
            console.log("Navigating to:", page); // debug
            window.location.href = page;
          }
        });
      });
    })
    .catch(err => console.error("Footer load failed:", err));
}

document.addEventListener("DOMContentLoaded", loadFooter);