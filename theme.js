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
  function normalizePageKey(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (!raw) return "index.html";
    if (raw === "index" || raw === "/") return "index.html";
    if (raw.endsWith(".html")) return raw;
    return raw + ".html";
  }

  function pageName() {
    var pathNorm = window.location.pathname.replace(/\\/g, "/");
    var segs = pathNorm.split("/").filter(Boolean);
    return normalizePageKey(segs.length ? segs[segs.length - 1] : "index");
  }

  var sharedHeaderPages = {
    "404.html": { activeHref: "", injectNav: true },
    "about.html": { activeHref: "about.html" },
    "admin.html": { activeHref: "admin.html", menuContext: "admin", authMode: "admin" },
    "admin-login.html": { activeHref: "admin-login.html", menuContext: "admin", authMode: "admin" },
    "auth-choice.html": { activeHref: "" },
    "buyer-login.html": { activeHref: "" },
    "buyer-profile.html": { activeHref: "buyer-profile.html", profileContext: "buyer" },
    "buyer-signup.html": { activeHref: "" },
    "car-detail.html": { activeHref: "listings.html" },
    "contact.html": { activeHref: "contact.html" },
    "dealer-application-pending.html": { activeHref: "dealer-dashboard.html", profileContext: "dealer", menuContext: "dealer" },
    "dealer-dashboard.html": { activeHref: "dealer-dashboard.html", profileContext: "dealer", menuContext: "dealer" },
    "dealer-login.html": { activeHref: "", profileContext: "dealer", menuContext: "dealer" },
    "dealer-onboarding.html": { activeHref: "register.html", injectNav: true, profileContext: "dealer", menuContext: "dealer" },
    "dealer-profile.html": { activeHref: "dealer-profile.html", profileContext: "dealer", menuContext: "dealer" },
    "dealers.html": { activeHref: "dealers.html" },
    "index.html": { activeHref: "" },
    "listings.html": { activeHref: "listings.html" },
    "privacy.html": { activeHref: "privacy.html" },
    "register.html": { activeHref: "register.html", profileContext: "dealer", menuContext: "dealer" },
    "terms.html": { activeHref: "terms.html" },
    "verify-email.html": { activeHref: "" }
  };

  var currentPage = pageName();
  var pageConfig = sharedHeaderPages[currentPage];
  if (!pageConfig) return;

  var nav = document.querySelector("nav");
  if (!nav && pageConfig.injectNav && document.body) {
    nav = document.createElement("nav");
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add("site-shared-header-injected");
  }
  if (!nav) return;

  function menuLinkHtml(item) {
    if (!item) return "";
    if (item.type === "divider") {
      return '<div class="nav-menu-divider" role="separator" aria-hidden="true"></div>';
    }
    return '<a href="' + item.href + '">' + item.label + "</a>";
  }

  function buildMenuItems() {
    var items = [
      { href: "listings.html", label: "Browse Cars" },
      { href: "dealers.html", label: "Browse Dealers" },
      { href: "about.html", label: "About Us" },
      { href: "contact.html", label: "Contact" },
      { href: "privacy.html", label: "Privacy Policy" },
      { href: "terms.html", label: "Dealer Terms" }
    ];

    if (pageConfig.menuContext === "dealer") {
      items = items.concat([
        { type: "divider" },
        { href: "dealer-dashboard.html", label: "Dealer Dashboard" },
        { href: "dealer-profile.html", label: "Dealer Profile" },
        { href: "register.html", label: "Dealer Setup" }
      ]);
    }

    if (pageConfig.menuContext === "admin") {
      items = items.concat([
        { type: "divider" },
        { href: "admin.html", label: "Admin Panel" },
        { href: "admin-login.html", label: "Admin Login" }
      ]);
    }

    return items;
  }

  function buildRightCtaHtml() {
    if (pageConfig.authMode === "admin") {
      return (
        '<div id="navCta" class="nav-cta nav-static-cta">' +
          '<a class="nav-profile-link nav-static-link" href="' +
          (currentPage === "admin.html" ? "admin.html" : "admin-login.html") +
          '">' +
          (currentPage === "admin.html" ? "Admin Panel" : "Admin Access") +
          "</a>" +
        "</div>"
      );
    }

    return (
      '<div id="navCta" class="nav-cta is-auth-pending">' +
        '<span id="navAuthPending" class="nav-auth-pending" aria-hidden="true" title=""></span>' +
        '<div id="navBuyerLinks" class="nav-buyer-links">' +
          '<a id="navBuyerSignIn" href="auth-choice.html?mode=signin">Sign In</a>' +
          '<a id="navBuyerSignUp" class="nav-signup-link" href="auth-choice.html?mode=signup">Sign Up</a>' +
        "</div>" +
        '<a id="navProfileLink" class="nav-profile-link" href="buyer-profile.html">My Profile</a>' +
      "</div>"
    );
  }

  function buildMenuFooterHtml() {
    if (pageConfig.authMode === "admin") {
      return (
        '<div class="nav-menu-divider" role="separator" aria-hidden="true"></div>' +
        '<a href="admin-login.html">Admin Access</a>'
      );
    }

    return (
      '<div class="nav-menu-divider" role="separator" aria-hidden="true"></div>' +
      '<a id="navMenuSignIn" href="auth-choice.html?mode=signin">Sign In</a>' +
      '<a id="navMenuSignUp" href="auth-choice.html?mode=signup">Sign Up</a>' +
      '<a id="navMenuProfileLink" href="buyer-profile.html" hidden>My Profile</a>' +
      '<a href="dealer-login.html?mode=signup">Join as Dealer</a>' +
      '<button id="navMenuLogoutBtn" class="nav-menu-logout" type="button" hidden>Log out</button>'
    );
  }

  var isHomePage = currentPage === "index.html";
  var menuItems = buildMenuItems();

  nav.classList.add("home-nav", "site-shared-nav");
  if (isHomePage) nav.classList.add("is-home-page");
  nav.innerHTML =
    '<div class="nav-left-tools">' +
      '<button id="navMenuToggle" class="menu-toggle" type="button" aria-expanded="false" aria-controls="navMenuPanel" aria-label="Open navigation menu">' +
        '<span class="menu-toggle-icon" aria-hidden="true">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="3" y1="6" x2="21" y2="6"></line>' +
            '<line x1="3" y1="12" x2="21" y2="12"></line>' +
            '<line x1="3" y1="18" x2="21" y2="18"></line>' +
          "</svg>" +
        "</span>" +
        '<span class="menu-toggle-label">Menu</span>' +
      "</button>" +
      (isHomePage ? "" : '<button id="navBackBtn" class="nav-left-link" type="button">Back</button><a href="index.html" class="nav-left-link nav-left-home">Home</a>') +
    "</div>" +
    '<a href="index.html" class="logo">Gari<span class="logo-dot">Bazaar</span></a>' +
    buildRightCtaHtml() +
    '<div id="navMenuPanel" class="nav-menu-panel" hidden>' +
      menuItems.map(menuLinkHtml).join("") +
      buildMenuFooterHtml() +
    "</div>";

  var menuToggle = document.getElementById("navMenuToggle");
  var backButton = document.getElementById("navBackBtn");
  var menuPanel = document.getElementById("navMenuPanel");
  var authWrap = document.getElementById("navCta");
  var authPending = document.getElementById("navAuthPending");
  var authLinks = document.getElementById("navBuyerLinks");
  var profileLink = document.getElementById("navProfileLink");
  var menuSignIn = document.getElementById("navMenuSignIn");
  var menuSignUp = document.getElementById("navMenuSignUp");
  var menuProfile = document.getElementById("navMenuProfileLink");
  var panelLogout = document.getElementById("navMenuLogoutBtn");

  function preferredProfileHref() {
    return pageConfig.profileContext === "dealer" ? "dealer-profile.html" : "buyer-profile.html";
  }

  function setProfileHref(href) {
    var nextHref = href || preferredProfileHref();
    if (profileLink) profileLink.href = nextHref;
    if (menuProfile) menuProfile.href = nextHref;
  }

  function resolveProfileHref(client, record) {
    if (record && String(record.role || "").toLowerCase() === "admin") return "";
    var hasDealer = !!(client && typeof client.userHasDealerAccess === "function" && client.userHasDealerAccess(record));
    var hasBuyer = !!(client && typeof client.userHasBuyerAccess === "function" && client.userHasBuyerAccess(record));
    if (hasDealer && hasBuyer) return pageConfig.profileContext === "dealer" ? "dealer-profile.html" : "buyer-profile.html";
    if (hasDealer) return "dealer-profile.html";
    if (hasBuyer) return "buyer-profile.html";
    return preferredProfileHref();
  }

  setProfileHref(preferredProfileHref());

  function closeMenu() {
    if (!menuToggle || !menuPanel) return;
    menuToggle.setAttribute("aria-expanded", "false");
    menuPanel.hidden = true;
  }

  if (backButton) {
    backButton.addEventListener("click", function () {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "index.html";
    });
  }

  if (menuToggle && menuPanel) {
    menuToggle.addEventListener("click", function () {
      var isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
      menuPanel.hidden = isOpen;
    });
    menuPanel.querySelectorAll("a, button").forEach(function (node) {
      node.addEventListener("click", closeMenu);
    });
    document.addEventListener("click", function (event) {
      if (menuPanel.hidden) return;
      if (menuPanel.contains(event.target) || menuToggle.contains(event.target)) return;
      closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });
  }

  if (menuPanel) {
    var activeHref = pageConfig.activeHref || "";
    menuPanel.querySelectorAll("a[href]").forEach(function (link) {
      var href = String(link.getAttribute("href") || "");
      if (activeHref && href === activeHref) link.setAttribute("aria-current", "page");
    });
  }

  if (pageConfig.authMode === "admin") return;

  function setSignedInUi(isSignedIn) {
    if (authWrap) authWrap.classList.remove("is-auth-pending");
    if (authPending) authPending.style.display = "none";
    if (authLinks) authLinks.style.display = isSignedIn ? "none" : "flex";
    if (profileLink) profileLink.style.display = isSignedIn ? "inline-flex" : "none";
    if (menuSignIn) menuSignIn.hidden = isSignedIn;
    if (menuSignUp) menuSignUp.hidden = isSignedIn;
    if (menuProfile) menuProfile.hidden = !isSignedIn;
    if (panelLogout) panelLogout.hidden = !isSignedIn;
  }

  function setSignedOutFallback() {
    setProfileHref(preferredProfileHref());
    setSignedInUi(false);
  }

  Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
    import("./firebase-client.js")
  ])
    .then(function (mods) {
      var firebaseAuth = mods[0];
      var client = mods[1];

      function signOutAndGoHome() {
        return firebaseAuth.signOut(client.auth)
          .catch(function () {})
          .then(function () {
            window.location.href = "index.html";
          });
      }

      if (panelLogout) {
        panelLogout.addEventListener("click", function () {
          signOutAndGoHome();
        });
      }

      firebaseAuth.onAuthStateChanged(client.auth, function (user) {
        if (user) {
          localStorage.setItem("gb_last_signed_in_uid", user.uid);
          localStorage.setItem("gb_last_signed_in_email", user.email || "");
          Promise.resolve(typeof client.getUserRecord === "function" ? client.getUserRecord(user.uid) : null)
            .catch(function () {
              return null;
            })
            .then(function (record) {
              var profileHref = resolveProfileHref(client, record);
              if (!profileHref && profileLink) profileLink.style.display = "none";
              if (!profileHref && menuProfile) menuProfile.hidden = true;
              if (profileHref) setProfileHref(profileHref);
              setSignedInUi(!!profileHref || !(record && String(record.role || "").toLowerCase() === "admin"));
            });
        } else {
          localStorage.removeItem("gb_last_signed_in_uid");
          localStorage.removeItem("gb_last_signed_in_email");
          setProfileHref(preferredProfileHref());
          setSignedInUi(false);
        }
      });
    })
    .catch(function () {
      setSignedOutFallback();
    });
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
