/**
 * map-view.js - Interaktivt fotokort for FotoSol (baseret på Leaflet)
 * Viser solens indfaldsvinkel, skyggens retning og længde direkte på et satellit- eller gadekort.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PhotoMap = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var map = null;
  var marker = null;
  var sunLine = null;
  var shadowPoly = null;
  var sunriseLine = null;
  var sunsetLine = null;
  var shadowDistLabel = null;
  var onLocationChangeCallback = null;

  var currentLat = 55.6761;
  var currentLng = 12.5683;

  /**
   * Beregner destination (lat, lng) ud fra startpunkt, afstand i meter og kompasbæring i grader
   */
  function destinationPoint(lat, lng, distanceMeters, bearingDegrees) {
    var R = 6371000; // Jordens radius i meter
    var rad = Math.PI / 180;
    var deg = 180 / Math.PI;

    var d = distanceMeters / R;
    var theta = bearingDegrees * rad;
    var phi1 = lat * rad;
    var lambda1 = lng * rad;

    var phi2 = Math.asin(Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(theta));
    var lambda2 = lambda1 + Math.atan2(
      Math.sin(theta) * Math.sin(d) * Math.cos(phi1),
      Math.cos(d) - Math.sin(phi1) * Math.sin(phi2)
    );

    return [phi2 * deg, lambda2 * deg];
  }

  function initMap(containerId, options) {
    options = options || {};
    var container = document.getElementById(containerId);
    if (!container || !window.L) return null;

    currentLat = options.lat || 55.6761;
    currentLng = options.lng || 12.5683;
    onLocationChangeCallback = options.onLocationChange || null;

    // Opret Leaflet kort
    map = L.map(containerId, {
      center: [currentLat, currentLng],
      zoom: 16,
      zoomControl: false
    });

    // Zoom kontrol i nederste højre hjørne
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Kortlag: Minimalistisk gadekort (default) og Satellit hvis man vælger det
    var streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    });

    var satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri World Imagery'
    });

    // Minimalistisk gadekort er standard
    streetLayer.addTo(map);

    var baseMaps = {
      "🗺️ Gadekort": streetLayer,
      "🛰️ Satellit": satLayer
    };
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

    // Fotograf / Kamera markør ikon
    var cameraIcon = L.divIcon({
      className: 'map-camera-marker',
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #0f172a;
          border: 2px solid #f59e0b;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 14px rgba(245, 158, 11, 0.6);
          color: #fbbf24;
          font-size: 15px;
        ">📷</div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    marker = L.marker([currentLat, currentLng], {
      icon: cameraIcon,
      draggable: true
    }).addTo(map);

    marker.on('dragend', function (e) {
      var pos = e.target.getLatLng();
      currentLat = pos.lat;
      currentLng = pos.lng;
      if (onLocationChangeCallback) {
        onLocationChangeCallback(pos.lat, pos.lng);
      }
    });

    // Klik på kortet for at flytte fotospot
    map.on('click', function (e) {
      currentLat = e.latlng.lat;
      currentLng = e.latlng.lng;
      marker.setLatLng(e.latlng);
      if (onLocationChangeCallback) {
        onLocationChangeCallback(e.latlng.lat, e.latlng.lng);
      }
    });

    return map;
  }

  function setLocation(lat, lng, panTo) {
    currentLat = lat;
    currentLng = lng;
    if (marker) marker.setLatLng([lat, lng]);
    if (map && panTo) map.panTo([lat, lng]);
  }

  /**
   * Opdaterer sol- og skyggevektorer på kortet
   */
  function updateSunAndShadow(sunAltDeg, sunAzDeg, shadowLengthMeters, sunTimes) {
    if (!map) return;

    var origin = [currentLat, currentLng];

    // 1. SOLVEKTOR (Gylden lysstråle mod solens azimut)
    if (sunLine) map.removeLayer(sunLine);

    if (sunAltDeg > -6) {
      // Tegn en 400m lang gylden stråle mod solen
      var sunRayLen = 450;
      var sunDest = destinationPoint(currentLat, currentLng, sunRayLen, sunAzDeg);
      sunLine = L.polyline([origin, sunDest], {
        color: '#f59e0b',
        weight: 3.5,
        opacity: 0.9,
        dashArray: '6, 6'
      }).addTo(map);
    }

    // 2. SKYGGEKEGLE / SKYGGEVEKTOR (Modsat solen)
    if (shadowPoly) map.removeLayer(shadowPoly);
    if (shadowDistLabel) map.removeLayer(shadowDistLabel);

    if (sunAltDeg > 0) {
      var shadowAz = (sunAzDeg + 180) % 360;
      // Visuel længde på kortet: reelt antal meter, men mindst 20m for synlighed
      var displayLen = Math.max(18, Math.min(shadowLengthMeters, 2000));

      var tipCenter = destinationPoint(currentLat, currentLng, displayLen, shadowAz);
      // Keglebredde: 4 grader spredning
      var tipLeft = destinationPoint(currentLat, currentLng, displayLen, (shadowAz - 4 + 360) % 360);
      var tipRight = destinationPoint(currentLat, currentLng, displayLen, (shadowAz + 4) % 360);

      shadowPoly = L.polygon([origin, tipLeft, tipCenter, tipRight], {
        color: '#38bdf8',
        fillColor: '#020617',
        fillOpacity: 0.75,
        weight: 2
      }).addTo(map);

      // Skyggetekst-etiket for enden af skyggen
      var lenText = shadowLengthMeters < 1000
        ? shadowLengthMeters.toFixed(1) + ' m'
        : (shadowLengthMeters / 1000).toFixed(2) + ' km';

      var labelIcon = L.divIcon({
        className: 'map-shadow-label',
        html: `
          <div style="
            background: rgba(2, 6, 23, 0.9);
            border: 1px solid #38bdf8;
            color: #38bdf8;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-family: ui-monospace, monospace;
            font-weight: bold;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
          ">👤 Skygge: ${lenText}</div>
        `,
        iconSize: [80, 20],
        iconAnchor: [40, 10]
      });

      shadowDistLabel = L.marker(tipCenter, { icon: labelIcon, interactive: false }).addTo(map);
    }

    // 3. DAGENS SOLBUE (Solopgang & solnedgang retninger)
    if (sunriseLine) map.removeLayer(sunriseLine);
    if (sunsetLine) map.removeLayer(sunsetLine);

    if (sunTimes && sunTimes.sunrise && sunTimes.sunset && AstroCalc) {
      var risePos = AstroCalc.getSunPosition(sunTimes.sunrise, currentLat, currentLng);
      var setPos = AstroCalc.getSunPosition(sunTimes.sunset, currentLat, currentLng);

      var riseDest = destinationPoint(currentLat, currentLng, 300, risePos.azimuth);
      var setDest = destinationPoint(currentLat, currentLng, 300, setPos.azimuth);

      sunriseLine = L.polyline([origin, riseDest], {
        color: '#fbbf24',
        weight: 1.5,
        opacity: 0.6,
        dashArray: '3, 6'
      }).addTo(map);

      sunsetLine = L.polyline([origin, setDest], {
        color: '#f97316',
        weight: 1.5,
        opacity: 0.6,
        dashArray: '3, 6'
      }).addTo(map);
    }
  }

  function resize() {
    if (map) {
      setTimeout(function () {
        map.invalidateSize();
      }, 100);
    }
  }

  return {
    initMap: initMap,
    setLocation: setLocation,
    updateSunAndShadow: updateSunAndShadow,
    resize: resize
  };
});
