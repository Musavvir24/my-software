// main.js
document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.getElementById("contentFrame");
  const loadingOverlay = document.getElementById("loadingOverlay");

  let showTime = Date.now();

  // Show overlay immediately
  loadingOverlay.classList.add("show");

  iframe.addEventListener("load", () => {
    const timeElapsed = Date.now() - showTime;
    const minVisibleTime = 500; // milliseconds

    setTimeout(() => {
      loadingOverlay.classList.remove("show");
    }, Math.max(0, minVisibleTime - timeElapsed));
  });

  const navLinks = document.querySelectorAll("nav a");
  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      showTime = Date.now();
      loadingOverlay.classList.add("show");
    });
  });
});
