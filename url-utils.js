(function initGbUrlUtils(global) {
  function clean(value) {
    return String(value || "").trim();
  }

  function toQuery(params) {
    return params.toString();
  }

  function makeDealerParams(dealerId) {
    var params = new URLSearchParams();
    var id = clean(dealerId);
    // Dealer pages should be resolved from a stable dealerId only.
    if (id) params.set("dealerId", id);
    return params;
  }

  function makeDetailParams(listingId, dealerId) {
    var params = new URLSearchParams();
    var lid = clean(listingId);
    var did = clean(dealerId);
    // Listing pages should carry only stable IDs, not mutable listing metadata.
    if (lid) params.set("listingId", lid);
    if (did) params.set("dealerId", did);
    return params;
  }

  function withQuery(path, query) {
    return query ? path + "?" + query : path;
  }

  function canonicalizeUrl(params) {
    var query = toQuery(params);
    if (!query) return;
    var nextSearch = "?" + query;
    if (window.location.search === nextSearch) return;
    // Replace without navigation so legacy shared links are normalized silently.
    var nextUrl = window.location.pathname + nextSearch + window.location.hash;
    window.history.replaceState(null, "", nextUrl);
  }

  // Shared URL contract used across pages to prevent query bloat regressions.
  global.GB_URLS = {
    detailQuery: function (listingId, dealerId) {
      return toQuery(makeDetailParams(listingId, dealerId));
    },
    dealerQuery: function (dealerId) {
      return toQuery(makeDealerParams(dealerId));
    },
    detailHref: function (listingId, dealerId) {
      return withQuery("car-detail.html", this.detailQuery(listingId, dealerId));
    },
    dealerHref: function (dealerId) {
      return withQuery("dealer-profile.html", this.dealerQuery(dealerId));
    },
    canonicalizeDetailUrl: function (listingId, dealerId) {
      canonicalizeUrl(makeDetailParams(listingId, dealerId));
    },
    canonicalizeDealerUrl: function (dealerId) {
      canonicalizeUrl(makeDealerParams(dealerId));
    }
  };
})(window);
