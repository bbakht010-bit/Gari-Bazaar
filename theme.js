(function () {
  var storageKey = "gb_theme";
  var root = document.documentElement;

  function getTheme() {
    var stored = localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light") return stored;
    return "light";
  }

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(storageKey, theme);
    updateButton(theme);
  }

  function updateButton(theme) {
    var button = document.getElementById("gb-theme-toggle");
    if (!button) return;
    button.textContent = theme === "dark" ? "☀" : "🌙";
    button.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    button.title = theme === "dark" ? "Light theme" : "Dark theme";
  }

  function ensureButton() {
    if (document.getElementById("gb-theme-toggle")) return;
    var button = document.createElement("button");
    button.id = "gb-theme-toggle";
    button.type = "button";
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      setTheme(next);
    });
    document.body.appendChild(button);
    updateButton(getTheme());
  }

  setTheme(getTheme());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureButton);
  } else {
    ensureButton();
  }
})();
