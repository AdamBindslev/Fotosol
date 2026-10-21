/**
 * shadow-sim.js - Grafisk simulationsmotor for FotoSol
 * Renderes på HTML5 Canvas med Retina-understøttelse.
 * Understøtter 2 visningsformer:
 * 1. 3D Perspektiv (interaktiv, roterbar EVF-scene med markant og tydelig skygge)
 * 2. 2D Kompas / Top-down solur
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShadowSimulator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PI = Math.PI,
    sin = Math.sin,
    cos = Math.cos,
    tan = Math.tan,
    rad = PI / 180,
    deg = 180 / PI;

  function createSimulator(canvas, options) {
    options = options || {};

    var ctx = canvas.getContext('2d');
    var currentMode = options.mode || '3d'; // '3d', 'compass'
    var subjectType = options.subjectType || 'photographer'; // 'photographer', 'person', 'tree', 'building', 'custom'
    var subjectHeight = options.subjectHeight || 1.80; // i meter

    // Kamera/visningsvinkler for 3D-visning
    var camera = {
      azimuth: 220, // rotation omkring vertikal akse (grader)
      pitch: 35,    // vinkel over jorden (grader, 15 til 85)
      zoom: 1.0,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0
    };

    // Aktuelle simulationsdata
    var simData = {
      sunAzimuth: 180,
      sunAltitude: 30,
      shadowAzimuth: 0,
      shadowLength: 3.12,
      shadowRatio: 1.73,
      hasDirectShadow: true,
      diffusionFactor: 1.0,
      sunTimes: null
    };

    setupInteraction();

    function setupInteraction() {
      function onStart(x, y) {
        if (currentMode !== '3d') return;
        camera.isDragging = true;
        camera.lastMouseX = x;
        camera.lastMouseY = y;
      }

      function onMove(x, y) {
        if (!camera.isDragging || currentMode !== '3d') return;
        var dx = x - camera.lastMouseX;
        var dy = y - camera.lastMouseY;

        camera.azimuth = (camera.azimuth - dx * 0.5) % 360;
        camera.pitch = Math.max(12, Math.min(85, camera.pitch + dy * 0.4));

        camera.lastMouseX = x;
        camera.lastMouseY = y;
        render();
      }

      function onEnd() {
        camera.isDragging = false;
      }

      canvas.addEventListener('mousedown', function (e) {
        onStart(e.clientX, e.clientY);
      });
      window.addEventListener('mousemove', function (e) {
        onMove(e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', onEnd);

      // Touch events for mobil
      canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
          onStart(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchmove', function (e) {
        if (camera.isDragging && e.touches.length === 1) {
          onMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchend', onEnd);
    }

    /**
     * Opdaterer simulationsparametre
     */
    function update(altitudeDeg, azimuthDeg, heightMeters, opt) {
      opt = opt || {};
      subjectHeight = (typeof heightMeters === 'number' && heightMeters > 0) ? heightMeters : subjectHeight;
      if (opt.subjectType) subjectType = opt.subjectType;
      if (typeof opt.diffusionFactor === 'number') simData.diffusionFactor = opt.diffusionFactor;
      if (opt.sunTimes) simData.sunTimes = opt.sunTimes;

      simData.sunAzimuth = azimuthDeg;
      simData.sunAltitude = altitudeDeg;
      simData.shadowAzimuth = (azimuthDeg + 180) % 360;

      if (altitudeDeg > 0) {
        var altRad = altitudeDeg * rad;
        simData.hasDirectShadow = true;
        simData.shadowRatio = 1 / tan(altRad);
        simData.shadowLength = subjectHeight * simData.shadowRatio;
      } else {
        simData.hasDirectShadow = false;
        simData.shadowRatio = Infinity;
        simData.shadowLength = Infinity;
      }

      render();
    }

    function setMode(mode) {
      currentMode = mode;
      render();
    }

    function setSubjectType(type, height) {
      subjectType = type;
      if (height) subjectHeight = height;
      render();
    }

    function resetCamera(preset) {
      if (preset === 'top') {
        camera.pitch = 85;
      } else if (preset === 'rim') {
        camera.azimuth = simData.sunAzimuth;
        camera.pitch = 22;
      } else if (preset === 'shadow') {
        camera.azimuth = simData.shadowAzimuth;
        camera.pitch = 28;
      } else {
        camera.azimuth = 220;
        camera.pitch = 35;
      }
      camera.zoom = 1.0;
      render();
    }

    /**
     * Hoved-renderfunktion med Retina-opløsning
     */
    function render() {
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var width = rect.width || canvas.width || 360;
      var height = rect.height || canvas.height || 360;

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      if (currentMode === '3d') {
        render3DView(width, height);
      } else if (currentMode === 'compass') {
        renderCompassView(width, height);
      }

      ctx.restore();
    }

    /* -------------------------------------------------------------
       1. 3D PERSPEKTIV SCENE (Med tydelig, kontrastrig skygge)
       ------------------------------------------------------------- */
    function render3DView(w, h) {
      var cx = w * 0.5;
      var cy = h * 0.58;

      var alt = simData.sunAltitude;
      var az = simData.sunAzimuth;
      var shadowAz = simData.shadowAzimuth;

      // 1. Baggrundshimmel
      drawSkyDome(w, h, alt);

      // 2. Skala (pixels pr. meter på jorden)
      var maxExpectedShadow = Math.min(simData.shadowLength, 30);
      var scale = Math.max(9, Math.min(35, (w * 0.38) / Math.max(subjectHeight * 2.2, maxExpectedShadow * 0.72)));

      var camAzRad = camera.azimuth * rad;
      var camPitchRad = camera.pitch * rad;

      // 3D projektionshjælper
      function project(wx, wy, wz) {
        var rx = wx * cos(camAzRad) - wy * sin(camAzRad);
        var ry = wx * sin(camAzRad) + wy * cos(camAzRad);
        var rz = wz;

        var screenX = cx + rx * scale;
        var groundY = cy + ry * scale * sin(camPitchRad);
        var screenY = groundY - rz * scale * cos(camPitchRad);

        return { x: screenX, y: screenY, depth: ry };
      }

      // 3. Oplyst terræn / fotoplatform (skaber kontrast så skyggen træder klart frem!)
      drawIlluminatedGroundPlane(project, scale, alt);

      // 4. Målecirkler og koordinatgitter
      drawGroundGrid(project, scale);

      // 5. Kompasretninger på jorden
      drawGroundCompass(project);

      // 6. TYDELIG, BRED OG KONTRASTRIG SKYGGE (hvis solen er oppe)
      if (simData.hasDirectShadow) {
        drawCastShadow(project, shadowAz, simData.shadowLength, scale);
      }

      // 7. Motiv (Fotograf, person, træ, bygning)
      drawSubject3D(project, scale);

      // 8. Sol på himlen og solstråle-hypotenuse
      drawSunInSky(w, h, cx, cy, alt, az, project);

      // 9. EVF søgermærker
      drawEvfOverlay(w, h);
    }

    /**
     * Himmelbaggrund med varm horisontglød
     */
    function drawSkyDome(w, h, alt) {
      var grad = ctx.createLinearGradient(0, 0, 0, h);

      if (alt > 20) {
        // Høj sol
        grad.addColorStop(0, '#0c1322');
        grad.addColorStop(0.55, '#19243a');
        grad.addColorStop(0.85, '#22324e');
        grad.addColorStop(1, '#111827');
      } else if (alt > 6) {
        // Mellem/eftermiddag
        grad.addColorStop(0, '#0d1322');
        grad.addColorStop(0.55, '#1e283d');
        grad.addColorStop(0.82, '#313247');
        grad.addColorStop(1, '#141824');
      } else if (alt > 0) {
        // Gylden time (varm glød i horisonten)
        grad.addColorStop(0, '#0f1424');
        grad.addColorStop(0.45, '#261b2e');
        grad.addColorStop(0.72, '#5c2c1a');
        grad.addColorStop(0.88, '#8c4815');
        grad.addColorStop(1, '#211822');
      } else if (alt > -6) {
        // Blå time
        grad.addColorStop(0, '#060a17');
        grad.addColorStop(0.55, '#111833');
        grad.addColorStop(0.85, '#1b2247');
        grad.addColorStop(1, '#0b0f1c');
      } else {
        // Daggry / tusmørke
        grad.addColorStop(0, '#04060c');
        grad.addColorStop(0.65, '#070b17');
        grad.addColorStop(1, '#03050a');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    /**
     * Oplyst terræn / platform på jorden:
     * Giver jorden en synlig, lysere overflade, så skyggen fremstår i markant, dyb kontrast!
     */
    function drawIlluminatedGroundPlane(project, scale, alt) {
      var radius = 24; // meter
      var segments = 64;

      ctx.save();
      ctx.beginPath();
      for (var i = 0; i <= segments; i++) {
        var a = (i / segments) * PI * 2;
        var pt = project(sin(a) * radius, cos(a) * radius, 0);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();

      // Soloplyst jordoverflade gradient
      var centerPt = project(0, 0, 0);
      var groundGrad = ctx.createRadialGradient(centerPt.x, centerPt.y, 5, centerPt.x, centerPt.y, radius * scale * 1.1);

      if (alt > 6) {
        // Dagslys: Lysere skifergrå/sandfarvet jordflade
        groundGrad.addColorStop(0, '#243048');
        groundGrad.addColorStop(0.6, '#182030');
        groundGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else if (alt > 0) {
        // Gylden time: Varmt rav/guldtonet oplyst jordflade
        groundGrad.addColorStop(0, '#3a2920');
        groundGrad.addColorStop(0.55, '#241a22');
        groundGrad.addColorStop(1, 'rgba(17, 24, 39, 0)');
      } else {
        // Tusmørke
        groundGrad.addColorStop(0, '#151d2f');
        groundGrad.addColorStop(0.7, '#0f1522');
        groundGrad.addColorStop(1, 'rgba(10, 15, 25, 0)');
      }

      ctx.fillStyle = groundGrad;
      ctx.fill();

      // Diskret platformkant
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    }

    /**
     * Målecirkler og gitter på jorden
     */
    function drawGroundGrid(project, scale) {
      var rings = [1, 2, 5, 10, 20];

      ctx.save();
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (var r = 0; r < rings.length; r++) {
        var dist = rings[r];
        ctx.beginPath();
        var segments = 48;
        for (var i = 0; i <= segments; i++) {
          var a = (i / segments) * PI * 2;
          var pt = project(sin(a) * dist, cos(a) * dist, 0);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = dist === 5 || dist === 10 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = dist === 5 || dist === 10 ? 1.5 : 1;
        ctx.stroke();

        // Målemærke
        var labelPt = project(dist, 0, 0);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
        ctx.fillText(dist + 'm', labelPt.x, labelPt.y - 5);
      }

      ctx.restore();
    }

    /**
     * Kompasretninger på jorden (Nord, Øst, Syd, Vest)
     */
    function drawGroundCompass(project) {
      var dist = 14;

      ctx.save();
      ctx.font = 'bold 12px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      var pN = project(0, dist, 0);
      var pS = project(0, -dist, 0);
      var pE = project(dist, 0, 0);
      var pW = project(-dist, 0, 0);

      // Akser
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);

      ctx.beginPath();
      ctx.moveTo(pS.x, pS.y);
      ctx.lineTo(pN.x, pN.y);
      ctx.moveTo(pW.x, pW.y);
      ctx.lineTo(pE.x, pE.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Nord pil i rød/orange for klar navigation
      ctx.fillStyle = '#ef4444';
      ctx.fillText('N', pN.x, pN.y);

      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Ø', pE.x, pE.y);
      ctx.fillText('S', pS.x, pS.y);
      ctx.fillText('V', pW.x, pW.y);

      ctx.restore();
    }

    /**
     * MEGET TYDELIG OG KONTRASTRIG SKYGGEPROJEKTION:
     * - Bred, markant geometrisk form svarende til motivet
     * - Dyb, solid kerneskygge (umbra) med synlig cyan/hvid markeringskant
     * - Længdestribe med metriske afstandsmærker og highlight-badge ved spidsen
     */
    function drawCastShadow(project, shadowAzDeg, lengthMeters, scale) {
      if (lengthMeters <= 0.05) return;

      var radAz = shadowAzDeg * rad;
      var dirX = sin(radAz);
      var dirY = cos(radAz);
      var perpX = -dirY;
      var perpY = dirX;

      var pBase = project(0, 0, 0);
      var pTip = project(dirX * lengthMeters, dirY * lengthMeters, 0);

      // Skaler skyggebredde markant op så den er let at se
      var baseWidth = Math.max(0.7, subjectHeight * 0.45);
      if (subjectType === 'tree') baseWidth = Math.max(2.5, subjectHeight * 0.7);
      if (subjectType === 'building') baseWidth = Math.max(4.0, subjectHeight * 0.8);

      var tipWidth = baseWidth * (1 + Math.min(lengthMeters * 0.06, 1.4));

      var pL1 = project(perpX * (baseWidth * 0.5), perpY * (baseWidth * 0.5), 0);
      var pR1 = project(-perpX * (baseWidth * 0.5), -perpY * (baseWidth * 0.5), 0);
      var pL2 = project(dirX * lengthMeters + perpX * (tipWidth * 0.5), dirY * lengthMeters + perpY * (tipWidth * 0.5), 0);
      var pR2 = project(dirX * lengthMeters - perpX * (tipWidth * 0.5), dirY * lengthMeters - perpY * (tipWidth * 0.5), 0);

      ctx.save();

      // 1. Dyb, solid skyggeflade med kontrast
      var shadowGrad = ctx.createLinearGradient(pBase.x, pBase.y, pTip.x, pTip.y);
      var diffFactor = simData.diffusionFactor || 1.0;

      // Meget mørk, markant uigennemsigtig skygge
      shadowGrad.addColorStop(0, 'rgba(0, 0, 0, ' + (0.95 * diffFactor) + ')');
      shadowGrad.addColorStop(0.7, 'rgba(2, 6, 18, ' + (0.85 * diffFactor) + ')');
      shadowGrad.addColorStop(1, 'rgba(10, 16, 28, ' + (0.45 * diffFactor) + ')');

      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.moveTo(pL1.x, pL1.y);
      ctx.lineTo(pL2.x, pL2.y);
      // Afrundet spids
      ctx.quadraticCurveTo(pTip.x + dirX * 6, pTip.y + dirY * 6, pR2.x, pR2.y);
      ctx.lineTo(pR1.x, pR1.y);
      ctx.closePath();
      ctx.fill();

      // 2. Tydelig markeringskant rundt om skyggen (gør den knivskarp mod jorden)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 3. Central måle-vektorstribe ned gennem skyggen
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pBase.x, pBase.y);
      ctx.lineTo(pTip.x, pTip.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Målemærker langs skyggen (hvis skyggen er lang nok)
      if (lengthMeters >= 4) {
        var steps = Math.min(5, Math.floor(lengthMeters / 3));
        for (var s = 1; s <= steps; s++) {
          var stepDist = (s / (steps + 1)) * lengthMeters;
          var ptStep = project(dirX * stepDist, dirY * stepDist, 0);
          ctx.beginPath();
          ctx.arc(ptStep.x, ptStep.y, 2.5, 0, PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
        }
      }

      // 5. Fremhævet telemetri-badge ved skyggespidsen
      var lenText = lengthMeters < 100 ? lengthMeters.toFixed(1) + ' m' : '> 100 m';
      var badgeW = 74;
      var badgeH = 22;
      var badgeX = pTip.x - badgeW * 0.5;
      var badgeY = pTip.y - 28;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👤 ' + lenText, pTip.x, badgeY + badgeH * 0.5);

      ctx.restore();
    }

    /**
     * 3D motiv (Fotograf m. stativ, person, træ eller bygning)
     */
    function drawSubject3D(project, scale) {
      var h = subjectHeight;
      var pBase = project(0, 0, 0);
      var pTop = project(0, 0, h);

      ctx.save();

      if (subjectType === 'photographer') {
        // Fotograf med kamera & stativ
        var legSpread = 0.5;
        var leg1 = project(-legSpread * 0.8, -legSpread * 0.5, 0);
        var leg2 = project(legSpread * 0.8, -legSpread * 0.5, 0);
        var leg3 = project(0, legSpread * 0.7, 0);
        var tripApex = project(0, 0, h * 0.75);

        // Stativben
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(tripApex.x, tripApex.y); ctx.lineTo(leg1.x, leg1.y);
        ctx.moveTo(tripApex.x, tripApex.y); ctx.lineTo(leg2.x, leg2.y);
        ctx.moveTo(tripApex.x, tripApex.y); ctx.lineTo(leg3.x, leg3.y);
        ctx.stroke();

        // Kamera på toppen
        ctx.fillStyle = '#f59e0b';
        var camW = 14, camH = 9;
        ctx.fillRect(tripApex.x - camW * 0.5, tripApex.y - camH, camW, camH);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(tripApex.x + camW * 0.25, tripApex.y - camH * 0.8, 6, 6);

        // Fotograf silhuet
        var pHead = project(0, -0.45, h * 0.95);
        var pBody = project(0, -0.45, h * 0.4);
        var pFoot1 = project(-0.2, -0.6, 0);
        var pFoot2 = project(0.2, -0.6, 0);

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pBody.x, pBody.y); ctx.lineTo(pFoot1.x, pFoot1.y);
        ctx.moveTo(pBody.x, pBody.y); ctx.lineTo(pFoot2.x, pFoot2.y);
        ctx.moveTo(pBody.x, pBody.y); ctx.lineTo(pHead.x, pHead.y);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(pHead.x, pHead.y - 6, 6, 0, PI * 2);
        ctx.fill();

      } else if (subjectType === 'tree') {
        // Enkeltstående træ
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = Math.max(4, scale * 0.25);
        ctx.beginPath();
        ctx.moveTo(pBase.x, pBase.y);
        ctx.lineTo(pTop.x, pTop.y + (pBase.y - pTop.y) * 0.4);
        ctx.stroke();

        var crownCenter = project(0, 0, h * 0.7);
        var crownRadius = (pBase.y - pTop.y) * 0.45;
        var crownGrad = ctx.createRadialGradient(crownCenter.x, crownCenter.y, crownRadius * 0.1, crownCenter.x, crownCenter.y, crownRadius);
        crownGrad.addColorStop(0, '#4ade80');
        crownGrad.addColorStop(0.7, '#16a34a');
        crownGrad.addColorStop(1, '#14532d');

        ctx.fillStyle = crownGrad;
        ctx.beginPath();
        ctx.arc(crownCenter.x, crownCenter.y, crownRadius, 0, PI * 2);
        ctx.fill();

      } else if (subjectType === 'building') {
        // Bygning
        var bW = h * 0.6;
        var c1 = project(-bW * 0.5, -bW * 0.5, 0);
        var c2 = project(bW * 0.5, -bW * 0.5, 0);
        var c3 = project(bW * 0.5, bW * 0.5, 0);

        var t1 = project(-bW * 0.5, -bW * 0.5, h);
        var t2 = project(bW * 0.5, -bW * 0.5, h);
        var t3 = project(bW * 0.5, bW * 0.5, h);
        var t4 = project(-bW * 0.5, bW * 0.5, h);

        ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t1.x, t1.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(t2.x, t2.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.fillStyle = 'rgba(71, 85, 105, 0.95)';
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();

      } else {
        // Person
        var headY = pTop.y;
        var footY = pBase.y;
        var personH = footY - headY;

        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.arc(pBase.x, headY + 5, 5.5, 0, PI * 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(pBase.x, headY + 11);
        ctx.lineTo(pBase.x, footY - personH * 0.4);
        ctx.lineTo(pBase.x - 6, footY);
        ctx.moveTo(pBase.x, footY - personH * 0.4);
        ctx.lineTo(pBase.x + 6, footY);
        ctx.moveTo(pBase.x - 8, headY + 18);
        ctx.lineTo(pBase.x + 8, headY + 18);
        ctx.stroke();
      }

      // Højdemarkør
      var markX = pBase.x + 20;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(markX, pBase.y); ctx.lineTo(markX, pTop.y);
      ctx.moveTo(markX - 3, pBase.y); ctx.lineTo(markX + 3, pBase.y);
      ctx.moveTo(markX - 3, pTop.y); ctx.lineTo(markX + 3, pTop.y);
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(subjectHeight.toFixed(1) + 'm', markX + 6, (pBase.y + pTop.y) * 0.5 + 3);

      ctx.restore();
    }

    /**
     * Solen på himlen og den direkte solstråle-hypotenuse
     */
    function drawSunInSky(w, h, cx, cy, altDeg, azDeg, project) {
      if (altDeg <= -0.833) {
        drawSubHorizonIndicator(w, h, altDeg);
        return;
      }

      var relAzRad = (azDeg - camera.azimuth) * rad;
      var sunDist = Math.min(w, h) * 0.42;

      var sunScreenX = cx + sin(relAzRad) * sunDist * 1.1;
      var altFactor = Math.sin(Math.max(0, altDeg) * rad);
      var sunScreenY = cy - 25 - altFactor * (h * 0.45);

      sunScreenX = Math.max(30, Math.min(w - 30, sunScreenX));
      sunScreenY = Math.max(28, Math.min(h * 0.65, sunScreenY));

      ctx.save();

      // Solkorona
      var glowRadius = 40;
      var sunGlow = ctx.createRadialGradient(sunScreenX, sunScreenY, 4, sunScreenX, sunScreenY, glowRadius);

      if (altDeg < 6) {
        sunGlow.addColorStop(0, '#fbbf24');
        sunGlow.addColorStop(0.35, 'rgba(245, 158, 11, 0.6)');
        sunGlow.addColorStop(1, 'rgba(180, 83, 9, 0)');
      } else {
        sunGlow.addColorStop(0, '#ffffff');
        sunGlow.addColorStop(0.3, 'rgba(253, 224, 71, 0.7)');
        sunGlow.addColorStop(0.7, 'rgba(245, 158, 11, 0.3)');
        sunGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      }

      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunScreenX, sunScreenY, glowRadius, 0, PI * 2);
      ctx.fill();

      // Solskive
      ctx.fillStyle = altDeg < 6 ? '#fef08a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(sunScreenX, sunScreenY, 11, 0, PI * 2);
      ctx.fill();

      // Solstråle der forbinder solen med toppen af motivet og skyggespidsen
      var pTop = project(0, 0, subjectHeight);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sunScreenX, sunScreenY);
      ctx.lineTo(pTop.x, pTop.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Soletiket
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = sunScreenX > cx ? 'left' : 'right';
      var textX = sunScreenX > cx ? sunScreenX + 16 : sunScreenX - 16;
      ctx.fillText('SOL ' + (altDeg >= 0 ? '+' : '') + altDeg.toFixed(1) + '°', textX, sunScreenY - 4);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(azDeg.toFixed(0) + '° ' + AstroCalc.getCompassDirection(azDeg), textX, sunScreenY + 10);

      ctx.restore();
    }

    function drawSubHorizonIndicator(w, h, altDeg) {
      ctx.save();
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 12px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      var badgeText = altDeg < -18 ? 'ASTRONOMISK NAT' : (altDeg < -6 ? 'TUSMØRKE' : 'BLÅ TIME');
      ctx.fillText('☾ ' + badgeText + ' (SOL ' + altDeg.toFixed(1) + '° UNDER HORISONTEN)', w * 0.5, 34);
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('Ingen hårde direkte skygger – diffus belysning', w * 0.5, 50);
      ctx.restore();
    }

    function drawEvfOverlay(w, h) {
      var reticleColor = 'rgba(255, 255, 255, 0.2)';
      var rLen = 14;

      ctx.save();
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1.5;

      var pad = 12;
      ctx.beginPath();
      ctx.moveTo(pad, pad + rLen); ctx.lineTo(pad, pad); ctx.lineTo(pad + rLen, pad);
      ctx.moveTo(w - pad - rLen, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + rLen);
      ctx.moveTo(pad, h - pad - rLen); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + rLen, h - pad);
      ctx.moveTo(w - pad - rLen, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - rLen);
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TRÆK FOR AT ROTERE 3D-SØGER', w * 0.5, h - 16);

      ctx.restore();
    }

    /* -------------------------------------------------------------
       2. 2D TOP-DOWN KOMPAS & SOLUR (Radar)
       ------------------------------------------------------------- */
    function renderCompassView(w, h) {
      var cx = w * 0.5;
      var cy = h * 0.5;
      var r = Math.min(w, h) * 0.42;

      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, w, h);

      ctx.save();

      // Kompasskive
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gradmærker
      for (var degStep = 0; degStep < 360; degStep += 10) {
        var a = (degStep - 90) * rad;
        var isMajor = degStep % 30 === 0;
        var isCardinal = degStep % 90 === 0;
        var tickLen = isCardinal ? 12 : (isMajor ? 8 : 4);

        var x1 = cx + cos(a) * r;
        var y1 = cy + sin(a) * r;
        var x2 = cx + cos(a) * (r - tickLen);
        var y2 = cy + sin(a) * (r - tickLen);

        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = isCardinal ? '#38bdf8' : 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = isCardinal ? 2 : 1;
        ctx.stroke();

        if (isMajor) {
          var labelX = cx + cos(a) * (r - 20);
          var labelY = cy + sin(a) * (r - 20);
          ctx.font = isCardinal ? 'bold 12px ui-monospace, monospace' : '9px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isCardinal ? (degStep === 0 ? '#f43f5e' : '#38bdf8') : '#64748b';

          var cardinalName = degStep === 0 ? 'N' : (degStep === 90 ? 'Ø' : (degStep === 180 ? 'S' : (degStep === 270 ? 'V' : degStep + '°')));
          ctx.fillText(cardinalName, labelX, labelY);
        }
      }

      // Solbue
      if (simData.sunTimes && simData.sunTimes.sunrise && simData.sunTimes.sunset) {
        var risePos = AstroCalc.getSunPosition(simData.sunTimes.sunrise, 55.67, 12.56);
        var setPos = AstroCalc.getSunPosition(simData.sunTimes.sunset, 55.67, 12.56);

        ctx.beginPath();
        var startAngle = (risePos.azimuth - 90) * rad;
        var endAngle = (setPos.azimuth - 90) * rad;
        ctx.arc(cx, cy, r * 0.75, startAngle, endAngle, false);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Solvektor
      var sunAngle = (simData.sunAzimuth - 90) * rad;
      var sunX = cx + cos(sunAngle) * (r * 0.92);
      var sunY = cy + sin(sunAngle) * (r * 0.92);

      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(sunX, sunY);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 7, 0, PI * 2);
      ctx.fill();

      // Skyggekegle modsat solen
      var shadowAngle = (simData.shadowAzimuth - 90) * rad;
      var shadowR = simData.hasDirectShadow ? Math.min(r * 0.85, Math.max(30, simData.shadowLength * 5)) : 10;
      var shadowX = cx + cos(shadowAngle) * shadowR;
      var shadowY = cy + sin(shadowAngle) * shadowR;

      if (simData.hasDirectShadow) {
        var coneWidth = 0.16;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, shadowR, shadowAngle - coneWidth, shadowAngle + coneWidth);
        ctx.closePath();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(simData.shadowLength.toFixed(1) + 'm (' + AstroCalc.getCompassDirection(simData.shadowAzimuth) + ')', shadowX, shadowY - 8);
      }

      // Centrum (motivet)
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('KOMPAS & SOLUR (RADAR)', 14, 22);

      ctx.restore();
    }

    return {
      update: update,
      setMode: setMode,
      setSubjectType: setSubjectType,
      resetCamera: resetCamera,
      render: render
    };
  }

  return {
    createSimulator: createSimulator
  };
});
