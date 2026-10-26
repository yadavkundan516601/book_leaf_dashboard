// Runs before first paint so the page never flashes the wrong theme.
// Kept as a same-origin file (not inline) because the CSP forbids inline scripts.
(function () {
  var t = null;
  try {
    t = localStorage.getItem("bl-theme");
  } catch (e) {}
  if (t !== "light" && t !== "dark") {
    t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", t);
})();
