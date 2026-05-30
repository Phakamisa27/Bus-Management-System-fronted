/**
 * Single Leaflet map instance + polling for live bus location.
 * Loads after Leaflet; exposes window.LiveBusTracking.
 *
 * Per-route tracking model
 * ------------------------
 * Each timetable card in data/timeTable.json carries its own `bus_id`.
 * That id is the "tracking channel" for one specific route:
 *
 *   - Sharer:  POST /buses/{bus_id}/location          (timeTable.js)
 *   - Viewer:  GET  /buses/{bus_id}/location every 5s (this file)
 *
 * Two cards with different bus_ids are completely independent — sharing
 * GPS for route A never shows up on route B, and vice versa.
 *
 * The bus id is NOT hard-coded here. Call:
 *   LiveBusTracking.setBusId("<uuid>")
 * to switch the channel. Switching clears the marker and restarts polling
 * so we never display a stale point from the previous route.
 *
 * Empty state: if the backend returns 404, or the latest fix is older than
 * STALE_THRESHOLD_MS, or the coords are (0, 0), we fire `livebus:no-location`
 * and timeTable.js shows "There is no one sharing location."
 */
(function () {
  "use strict";

  var BACKEND_URL = "https://bus-management-system-backend.onrender.com";
  var POLL_MS = 5000;
  // A bus is considered "currently shared" only if its latest fix is no older
  // than this. Anything older is treated the same as "no one is sharing".
  var STALE_THRESHOLD_MS = 2 * 60 * 1000;
  var DEFAULT_VIEW = [-29.88, 30.94];
  var DEFAULT_ZOOM = 12;
  var BUS_ZOOM = 14;

  var map = null;
  var busMarker = null;
  var pollTimer = null;
  var routeLabel = "Live bus";
  var currentBusId = null;

  function logError(context, err) {
    console.error("[LiveBusTracking]", context, err != null ? err : "");
  }

  window.addEventListener("error", function (e) {
    console.error(
      "[LiveBusTracking] script error:",
      e.message,
      e.filename,
      e.lineno,
    );
  });

  window.addEventListener("unhandledrejection", function (e) {
    console.error("[LiveBusTracking] unhandled rejection:", e.reason);
  });

  function smoothMove(marker, targetLatLng) {
    if (!marker) return;
    var start = marker.getLatLng();
    var duration = 1200;
    var startTime = performance.now();

    function animate(now) {
      var progress = Math.min((now - startTime) / duration, 1);
      var lat = start.lat + (targetLatLng.lat - start.lat) * progress;
      var lng = start.lng + (targetLatLng.lng - start.lng) * progress;
      marker.setLatLng([lat, lng]);
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }

  function fixDefaultMarkerIcon() {
    if (!window.L || !L.Icon || !L.Icon.Default) return;
    try {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
    } catch (e) {
      logError("Failed to patch default marker icon", e);
    }
  }

  function ensureMap() {
    if (!window.L) {
      logError("Leaflet is not loaded (window.L is missing).");
      return null;
    }
    if (map) return map;

    var el = document.getElementById("map");
    if (!el) {
      logError("Map container #map not found.");
      return null;
    }

    fixDefaultMarkerIcon();

    try {
      map = L.map("map").setView(DEFAULT_VIEW, DEFAULT_ZOOM);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      setTimeout(function () {
        try {
          map.invalidateSize();
        } catch (invErr) {
          logError("invalidateSize failed", invErr);
        }
      }, 200);
    } catch (e) {
      logError("Failed to create map", e);
      map = null;
      return null;
    }

    return map;
  }

  function setRouteLabel(label) {
    routeLabel = label || "Live bus";
    if (busMarker) {
      try {
        busMarker.setPopupContent(routeLabel);
      } catch (_) {}
    }
  }

  function clearBusMarker() {
    if (busMarker && map) {
      try {
        map.removeLayer(busMarker);
      } catch (_) {}
    }
    busMarker = null;
  }

  function emitNoLocation(busId, reason) {
    clearBusMarker();
    try {
      window.dispatchEvent(
        new CustomEvent("livebus:no-location", {
          detail: { busId: busId, reason: reason },
        }),
      );
    } catch (_) {}
  }

  function buildLocationUrl(busId) {
    return BACKEND_URL + "/buses/" + busId + "/location";
  }

  async function fetchOnce() {
    if (!currentBusId) {
      throw new Error("No bus id selected. Call LiveBusTracking.setBusId(id).");
    }
    var busIdAtRequest = currentBusId;
    var url = buildLocationUrl(busIdAtRequest);

    var res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "ngrok-skip-browser-warning": "true",
        Accept: "application/json",
      },
    });

    if (currentBusId !== busIdAtRequest) {
      return;
    }

    if (!res.ok) {
      throw new Error("HTTP " + res.status + " from " + url);
    }

    var data = await res.json();
    console.log("[LiveBusTracking] fetched location:", data);

    var lat = Number(data.latitude);
    var lng = Number(data.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn(
        "[LiveBusTracking] invalid lat/lng in response — treating as no-location.",
        data,
      );
      emitNoLocation(busIdAtRequest, "invalid-coords");
      return;
    }

    // (0, 0) is the conventional "no real fix" sentinel. Most real bus routes
    // are nowhere near it, so reject it as well.
    if (lat === 0 && lng === 0) {
      console.warn(
        "[LiveBusTracking] (0, 0) is not a real location — treating as no-location.",
      );
      emitNoLocation(busIdAtRequest, "zero-coords");
      return;
    }

    // Staleness: if the latest fix is older than our threshold, consider that
    // no one is currently sharing for this bus.
    var ts = data.timestamp ? new Date(data.timestamp).getTime() : NaN;
    if (Number.isFinite(ts)) {
      var ageMs = Date.now() - ts;
      if (ageMs > STALE_THRESHOLD_MS) {
        console.warn(
          "[LiveBusTracking] last fix is stale (",
          Math.round(ageMs / 1000),
          "s old) — treating as no-location.",
        );
        emitNoLocation(busIdAtRequest, "stale");
        return;
      }
    }

    var m = ensureMap();
    if (!m || !window.L) {
      logError("Map or Leaflet missing; cannot draw marker.");
      return;
    }

    var latLng = L.latLng(lat, lng);
    var detail = {
      busId: busIdAtRequest,
      latitude: lat,
      longitude: lng,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    try {
      if (!busMarker) {
        busMarker = L.marker(latLng).addTo(m).bindPopup(routeLabel);
        console.log(
          "[LiveBusTracking] marker created at",
          lat,
          lng,
          "for bus",
          busIdAtRequest,
        );
      } else {
        busMarker.setLatLng(latLng);
        busMarker.setPopupContent(routeLabel);
        console.log(
          "[LiveBusTracking] marker updated to",
          lat,
          lng,
          "for bus",
          busIdAtRequest,
        );
      }
      m.setView(latLng, BUS_ZOOM);
    } catch (markerErr) {
      logError("Failed to draw/update marker", markerErr);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("livebus:location", { detail: detail }),
    );
  }

  function tick() {
    if (!currentBusId) return;
    var busIdAtRequest = currentBusId;
    fetchOnce().catch(function (err) {
      logError("Location poll failed", err);
      var msg = String((err && err.message) || err || "");
      var statusMatch = msg.match(/HTTP\s+(\d+)/i);
      var status = statusMatch ? Number(statusMatch[1]) : null;

      // 404 from the backend means either the bus doesn't exist or no location
      // has been recorded for it yet. Treat that as "no one is sharing".
      if (status === 404) {
        emitNoLocation(busIdAtRequest, "404");
        return;
      }

      try {
        window.dispatchEvent(
          new CustomEvent("livebus:error", {
            detail: {
              busId: busIdAtRequest,
              status: status,
              message: msg,
            },
          }),
        );
      } catch (_) {}
    });
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    tick();
    pollTimer = setInterval(tick, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function setBusId(busId) {
    if (!busId) {
      logError("setBusId called with empty id; ignoring.");
      return;
    }
    if (busId === currentBusId) {
      console.log("[LiveBusTracking] re-tick for same bus id", busId);
      tick();
      return;
    }

    console.log("[LiveBusTracking] switching to bus id", busId);
    currentBusId = busId;
    clearBusMarker();
    ensureMap();
    startPolling();
  }

  function getBusId() {
    return currentBusId;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureMap);
  } else {
    ensureMap();
  }

  window.LiveBusTracking = {
    BACKEND_URL: BACKEND_URL,
    setBusId: setBusId,
    getBusId: getBusId,
    ensureMap: ensureMap,
    getMap: function () {
      return map;
    },
    getBusMarker: function () {
      return busMarker;
    },
    setRouteLabel: setRouteLabel,
    startPolling: startPolling,
    stopPolling: stopPolling,
    fetchOnce: fetchOnce,
  };
})();
