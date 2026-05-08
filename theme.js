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

(function () {
  var sentryStateKey = "__gb_sentry_booted__";
  // Guard against double initialization when scripts are loaded multiple times.
  if (window[sentryStateKey]) return;
  window[sentryStateKey] = true;

  function compactPath(value) {
    return String(value || "").replace(/[?#].*$/, "");
  }

  function normalizeSampleRate(value, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
    return n;
  }

  function initSentryWithConfig(config) {
    var cfg = config || {};
    var dsn = String(cfg.dsn || "").trim();
    // Empty DSN means monitoring is intentionally disabled.
    if (!dsn) return;

    var script = document.createElement("script");
    script.src = "https://browser.sentry-cdn.com/8.33.0/bundle.tracing.replay.min.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = function () {
      if (!window.Sentry || typeof window.Sentry.init !== "function") return;
      window.Sentry.init({
        dsn: dsn,
        environment: String(cfg.environment || window.location.hostname || "production"),
        tracesSampleRate: normalizeSampleRate(cfg.tracesSampleRate, 0.1),
        replaysSessionSampleRate: normalizeSampleRate(cfg.replaysSessionSampleRate, 0),
        replaysOnErrorSampleRate: normalizeSampleRate(cfg.replaysOnErrorSampleRate, 1.0),
        integrations: [window.Sentry.browserTracingIntegration(), window.Sentry.replayIntegration()],
        beforeSend: function (event) {
          // Avoid noisy browser extension errors.
          var stack = JSON.stringify(event && event.exception || {});
          if (/chrome-extension|moz-extension|safari-extension/i.test(stack)) return null;
          return event;
        }
      });
      window.Sentry.setTag("app", "gari-bazaar");
      // Tag route (without query/hash) for easier grouping in Sentry dashboards.
      window.Sentry.setTag("page", compactPath(window.location.pathname));
    };
    document.head.appendChild(script);
  }

  // Runtime config keeps DSN and sampling settings editable without JS rebuilds.
  fetch("sentry-config.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (cfg) {
      initSentryWithConfig(cfg || {});
    })
    .catch(function () {
      // Keep the app fully functional if config fetch fails.
    });
})();
