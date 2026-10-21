/**
 * shadow-sim.js - Grafisk simulationsmotor for FotoSol
 * Renderes på HTML5 Canvas med Retina-understøttelse og Astro Rød-nattilstand.
 * Understøtter 3 visningsformer:
 * 1. 3D Perspektiv (interaktiv, roterbar EVF-scene med sol, motiv og dynamisk skygge)
 * 2. 2D Kompas / Top-down solur
 * 3. Profil / Tværsnit med trigonometrisk vinkelmåler
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
    var currentMode = options.mode || '3d'; // '3d', 'compass', 'profile'
    var subjectType = options.subjectType || 'photographer'; // 'photographer', 'person', 'tree', 'building', 'custom'
    var subjectHeight = options.subjectHeight || 1.80; // i meter

    // Kamera/visningsvinkler for 3D-visning
    var camera = {
      azimuth: 220, // rotation omkring vertikal akse (grader)
      pitch: 35,    // vinkel over jorden (grader, 15 til 85)
      zoom: 1.0,    // zoomfaktor
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
      isNightRed: false,
      sunTimes: null
    };

    // Opsæt touch & mus interaktion til 3D-rotation
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
      if (typeof opt.isNightRed === 'boolean') simData.isNightRed = opt.isNightRed;
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

    /**
     * Vælg visningsmode ('3d', 'compass', 'profile')
     */
    function setMode(mode) {
      currentMode = mode;
      render();
    }

    /**
     * Vælg motiv/objekttype
     */
    function setSubjectType(type, height) {
      subjectType = type;
      if (height) subjectHeight = height;
      render();
    }

    /**
     * Nulstil kameravinkel
     */
    function resetCamera(preset) {
      if (preset === 'top') {
        camera.pitch = 85;
      } else if (preset === 'rim') {
        // Se mod solen (modlys)
        camera.azimuth = simData.sunAzimuth;
        camera.pitch = 25;
      } else if (preset === 'shadow') {
        // Se i skyggens retning (medlys)
        camera.azimuth = simData.shadowAzimuth;
        camera.pitch = 30;
      } else {
        // Standard perspektiv
        camera.azimuth = 220;
        camera.pitch = 35;
      }
      camera.zoom = 1.0;
      render();
    }

    /**
     * Hoved-renderfunktion med håndtering af Retina-opløsning
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

      var isRed = simData.isNightRed;

      if (currentMode === '3d') {
        render3DView(width, height, isRed);
      } else if (currentMode === 'compass') {
        renderCompassView(width, height, isRed);
      } else if (currentMode === 'profile') {
        renderProfileView(width, height, isRed);
      }

      ctx.restore();
    }

    /* -------------------------------------------------------------
       1. 3D PERSPEKTIV SCENE (Isometrisk/Projektion)
       ------------------------------------------------------------- */
    function render3DView(w, h, isRed) {
      var cx = w * 0.5;
      var cy = h * 0.58; // Lidt forskudt nedad for plads til sol i himlen

      var alt = simData.sunAltitude;
      var az = simData.sunAzimuth;
      var shadowAz = simData.shadowAzimuth;

      // Baggrundshimmel
      drawSkyDome(w, h, alt, isRed);

      // Beregn skala (pixels pr. meter på jorden)
      // Skaler dynamisk så lange skygger ikke forsvinder ud af skærmen
      var maxExpectedShadow = Math.min(simData.shadowLength, 35);
      var scale = Math.max(7, Math.min(32, (w * 0.38) / Math.max(subjectHeight * 2.5, maxExpectedShadow * 0.75)));

      var camAzRad = camera.azimuth * rad;
      var camPitchRad = camera.pitch * rad;

      // 3D projektionshjælper:
      // Verdenskoordinater (x = Øst/Vest, y = Nord/Syd, z = op)
      function project(wx, wy, wz) {
        // Roter i forhold til kamera-azimut
        var rx = wx * cos(camAzRad) - wy * sin(camAzRad);
        var ry = wx * sin(camAzRad) + wy * cos(camAzRad);
        var rz = wz;

        // Roter i forhold til kamera-pitch
        var screenX = cx + rx * scale;
        var groundY = cy + ry * scale * sin(camPitchRad);
        var screenY = groundY - rz * scale * cos(camPitchRad);

        return { x: screenX, y: screenY, depth: ry };
      }

      // 1. Tegn målecirkler og jordgitter
      drawGroundGrid(project, isRed, scale);

      // 2. Tegn kompas-nord og akser på jorden
      drawGroundCompass(project, isRed);

      // 3. Tegn skyggen på jorden (hvis solen er oppe)
      if (simData.hasDirectShadow) {
        drawCastShadow(project, shadowAz, simData.shadowLength, scale, isRed);
      }

      // 4. Tegn motivet (Fotograf / person / træ / bygning)
      drawSubject3D(project, isRed, scale);

      // 5. Tegn solen på himlen og solstrålen
      drawSunInSky(w, h, cx, cy, alt, az, isRed);

      // 6. Overlejret EVF telemetri-overlay i hjørnerne
      drawEvfOverlay(w, h, isRed);
    }

    /**
     * Baggrundshimmel baseret på solhøjde
     */
    function drawSkyDome(w, h, alt, isRed) {
      var grad = ctx.createLinearGradient(0, 0, 0, h);

      if (isRed) {
        grad.addColorStop(0, '#100202');
        grad.addColorStop(0.65, '#220404');
        grad.addColorStop(1, '#080101');
      } else {
        if (alt > 20) {
          // Høj dag
          grad.addColorStop(0, '#0f172a');
          grad.addColorStop(0.55, '#1e293b');
          grad.addColorStop(1, '#0b0f19');
        } else if (alt > 6) {
          // Eftermiddag / formiddag
          grad.addColorStop(0, '#111827');
          grad.addColorStop(0.55, '#1f293d');
          grad.addColorStop(0.8, '#26283b');
          grad.addColorStop(1, '#0f121a');
        } else if (alt > 0) {
          // Gylden time (varm glød i horisonten)
          grad.addColorStop(0, '#131525');
          grad.addColorStop(0.5, '#2d1b2e');
          grad.addColorStop(0.78, '#582b1c');
          grad.addColorStop(0.9, '#7c3f15');
          grad.addColorStop(1, '#1a131b');
        } else if (alt > -6) {
          // Blå time
          grad.addColorStop(0, '#090e1f');
          grad.addColorStop(0.6, '#151e3d');
          grad.addColorStop(0.85, '#212048');
          grad.addColorStop(1, '#090c17');
        } else {
          // Nat
          grad.addColorStop(0, '#05070d');
          grad.addColorStop(0.6, '#080d1a');
          grad.addColorStop(1, '#04060a');
        }
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Diskret stjernedrys hvis mørkt
      if (alt < -2 && !isRed) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        var stars = [
          [w * 0.15, h * 0.12, 1.2],
          [w * 0.28, h * 0.2, 1.0],
          [w * 0.72, h * 0.14, 1.4],
          [w * 0.85, h * 0.25, 0.9],
          [w * 0.45, h * 0.08, 1.1]
        ];
        for (var s = 0; s < stars.length; s++) {
          ctx.beginPath();
          ctx.arc(stars[s][0], stars[s][1], stars[s][2], 0, PI * 2);
          ctx.fill();
        }
      }
    }

    /**
     * Målegitter på jorden med afstandscirkler (1m, 2m, 5m, 10m, 20m)
     */
    function drawGroundGrid(project, isRed, scale) {
      var rings = [1, 2, 5, 10, 20, 30];
      var ringColor = isRed ? 'rgba(255, 50, 50, 0.14)' : 'rgba(255, 255, 255, 0.09)';
      var labelColor = isRed ? 'rgba(255, 80, 80, 0.5)' : 'rgba(148, 163, 184, 0.45)';

      ctx.save();
      ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Tegn elliptiske afstandscirkler på jorden
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
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Afstandsmærke langs øst-vest
        var labelPt = project(dist, 0, 0);
        ctx.fillStyle = labelColor;
        ctx.fillText(dist + 'm', labelPt.x, labelPt.y - 4);
      }

      ctx.restore();
    }

    /**
     * Kompasretninger på jorden (Nord, Øst, Syd, Vest)
     */
    function drawGroundCompass(project, isRed) {
      var dist = 12; // Radius for kompasmarkeringer
      var axisColor = isRed ? 'rgba(255, 60, 60, 0.25)' : 'rgba(255, 255, 255, 0.15)';
      var northColor = isRed ? '#ff4d4d' : '#38bdf8';
      var txtColor = isRed ? '#ff8888' : '#94a3b8';

      ctx.save();
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Akser (Nord-Syd, Øst-Vest)
      var pN = project(0, dist, 0);
      var pS = project(0, -dist, 0);
      var pE = project(dist, 0, 0);
      var pW = project(-dist, 0, 0);
      var pCenter = project(0, 0, 0);

      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      ctx.beginPath();
      ctx.moveTo(pS.x, pS.y);
      ctx.lineTo(pN.x, pN.y);
      ctx.moveTo(pW.x, pW.y);
      ctx.lineTo(pE.x, pE.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Nord pil og tekst
      ctx.fillStyle = northColor;
      ctx.fillText('N', pN.x, pN.y);

      ctx.fillStyle = txtColor;
      ctx.fillText('Ø', pE.x, pE.y);
      ctx.fillText('S', pS.x, pS.y);
      ctx.fillText('V', pW.x, pW.y);

      ctx.restore();
    }

    /**
     * Realistisk skyggeprojektion med penumbra (blødgøring i spidsen)
     */
    function drawCastShadow(project, shadowAzDeg, lengthMeters, scale, isRed) {
      if (lengthMeters <= 0.05) return;

      var radAz = shadowAzDeg * rad;
      // Skyggeretning i x, y på jorden (0° = Nord = y+, 90° = Øst = x+)
      var dirX = sin(radAz);
      var dirY = cos(radAz);
      var perpX = -dirY;
      var perpY = dirX;

      var pBase = project(0, 0, 0);
      var pTip = project(dirX * lengthMeters, dirY * lengthMeters, 0);

      // Skyggens bredde ved motivet og spredning (penumbra) ved spidsen
      var baseWidth = Math.max(0.3, subjectHeight * 0.22);
      // Længere skygger spredes blødere i horisonten
      var tipWidth = baseWidth * (1 + Math.min(lengthMeters * 0.08, 1.8));

      var pL1 = project(perpX * (baseWidth * 0.5), perpY * (baseWidth * 0.5), 0);
      var pR1 = project(-perpX * (baseWidth * 0.5), -perpY * (baseWidth * 0.5), 0);
      var pL2 = project(dirX * lengthMeters + perpX * (tipWidth * 0.5), dirY * lengthMeters + perpY * (tipWidth * 0.5), 0);
      var pR2 = project(dirX * lengthMeters - perpX * (tipWidth * 0.5), dirY * lengthMeters - perpY * (tipWidth * 0.5), 0);

      ctx.save();

      // Opret gradient for realistisk blød skygge
      var shadowGrad = ctx.createLinearGradient(pBase.x, pBase.y, pTip.x, pTip.y);
      var diffFactor = simData.diffusionFactor || 1.0;

      if (isRed) {
        shadowGrad.addColorStop(0, 'rgba(40, 2, 2, ' + (0.95 * diffFactor) + ')');
        shadowGrad.addColorStop(0.7, 'rgba(30, 2, 2, ' + (0.75 * diffFactor) + ')');
        shadowGrad.addColorStop(1, 'rgba(20, 1, 1, ' + (0.35 * diffFactor) + ')');
      } else {
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, ' + (0.85 * diffFactor) + ')');
        shadowGrad.addColorStop(0.75, 'rgba(5, 7, 12, ' + (0.65 * diffFactor) + ')');
        shadowGrad.addColorStop(1, 'rgba(10, 14, 22, ' + (0.25 * diffFactor) + ')');
      }

      // Tegn skyggepolygon
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.moveTo(pL1.x, pL1.y);
      ctx.lineTo(pL2.x, pL2.y);
      // Rund spids på skyggen
      ctx.quadraticCurveTo(pTip.x + dirX * 4, pTip.y + dirY * 4, pR2.x, pR2.y);
      ctx.lineTo(pR1.x, pR1.y);
      ctx.closePath();
      ctx.fill();

      // Skyggevinkel & længde markør ved spidsen
      ctx.strokeStyle = isRed ? 'rgba(255, 80, 80, 0.4)' : 'rgba(245, 158, 11, 0.45)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pBase.x, pBase.y);
      ctx.lineTo(pTip.x, pTip.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Længde etiket ved spidsen
      ctx.fillStyle = isRed ? '#ff6666' : '#fbbf24';
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      var textOffset = 14;
      var lenText = lengthMeters < 100 ? lengthMeters.toFixed(1) + 'm' : '> 100m';
      ctx.fillText(lenText, pTip.x, pTip.y - textOffset);

      ctx.restore();
    }

    /**
     * 3D motiv (Fotograf med stativ, person, træ eller bygning)
     */
    function drawSubject3D(project, isRed, scale) {
      var h = subjectHeight;
      var pBase = project(0, 0, 0);
      var pTop = project(0, 0, h);

      var mainColor = isRed ? '#ff4d4d' : '#f8fafc';
      var subColor = isRed ? '#a82222' : '#94a3b8';
      var accentColor = isRed ? '#ff7777' : '#38bdf8';

      ctx.save();

      if (subjectType === 'photographer') {
        // Fotograf med kamera på stativ
        // Stativ-ben (3 ben mod jorden)
        var legSpread = 0.45;
        var leg1 = project(-legSpread * 0.8, -legSpread * 0.5, 0);
        var leg2 = project(legSpread * 0.8, -legSpread * 0.5, 0);
        var leg3 = project(0, legSpread * 0.7, 0);
        var tripApex = project(0, 0, h * 0.75);

        ctx.strokeStyle = subColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tripApex.x, tripApex.y);
        ctx.lineTo(leg1.x, leg1.y);
        ctx.moveTo(tripApex.x, tripApex.y);
        ctx.lineTo(leg2.x, leg2.y);
        ctx.moveTo(tripApex.x, tripApex.y);
        ctx.lineTo(leg3.x, leg3.y);
        ctx.stroke();

        // Kamera hus på stativtop
        ctx.fillStyle = mainColor;
        var camW = 12, camH = 8;
        ctx.fillRect(tripApex.x - camW * 0.5, tripApex.y - camH, camW, camH);
        // Objektiv
        ctx.fillStyle = accentColor;
        ctx.fillRect(tripApex.x + camW * 0.3, tripApex.y - camH * 0.8, 5, 5);

        // Fotograf der står bagved og kigger i søgeren
        var pHead = project(0, -0.45, h * 0.95);
        var pBody = project(0, -0.45, h * 0.4);
        var pFoot1 = project(-0.2, -0.6, 0);
        var pFoot2 = project(0.2, -0.6, 0);

        ctx.strokeStyle = subColor;
        ctx.lineWidth = 2.5;
        // Ben
        ctx.beginPath();
        ctx.moveTo(pBody.x, pBody.y);
        ctx.lineTo(pFoot1.x, pFoot1.y);
        ctx.moveTo(pBody.x, pBody.y);
        ctx.lineTo(pFoot2.x, pFoot2.y);
        // Krop
        ctx.moveTo(pBody.x, pBody.y);
        ctx.lineTo(pHead.x, pHead.y);
        ctx.stroke();

        // Hoved med kasket
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(pHead.x, pHead.y - 6, 5, 0, PI * 2);
        ctx.fill();

      } else if (subjectType === 'tree') {
        // Enkeltstående træ
        // Stamme
        ctx.strokeStyle = isRed ? '#8b1e1e' : '#92400e';
        ctx.lineWidth = Math.max(3, scale * 0.25);
        ctx.beginPath();
        ctx.moveTo(pBase.x, pBase.y);
        ctx.lineTo(pTop.x, pTop.y + (pBase.y - pTop.y) * 0.45);
        ctx.stroke();

        // Trækrone
        var crownCenter = project(0, 0, h * 0.7);
        var crownRadius = (pBase.y - pTop.y) * 0.42;
        var crownGrad = ctx.createRadialGradient(crownCenter.x, crownCenter.y, crownRadius * 0.2, crownCenter.x, crownCenter.y, crownRadius);
        if (isRed) {
          crownGrad.addColorStop(0, '#ff3333');
          crownGrad.addColorStop(1, '#660505');
        } else {
          crownGrad.addColorStop(0, '#22c55e');
          crownGrad.addColorStop(1, '#14532d');
        }
        ctx.fillStyle = crownGrad;
        ctx.beginPath();
        ctx.arc(crownCenter.x, crownCenter.y, crownRadius, 0, PI * 2);
        ctx.fill();

      } else if (subjectType === 'building') {
        // Bygning / mur
        var bW = h * 0.6;
        var c1 = project(-bW * 0.5, -bW * 0.5, 0);
        var c2 = project(bW * 0.5, -bW * 0.5, 0);
        var c3 = project(bW * 0.5, bW * 0.5, 0);
        var c4 = project(-bW * 0.5, bW * 0.5, 0);

        var t1 = project(-bW * 0.5, -bW * 0.5, h);
        var t2 = project(bW * 0.5, -bW * 0.5, h);
        var t3 = project(bW * 0.5, bW * 0.5, h);
        var t4 = project(-bW * 0.5, bW * 0.5, h);

        ctx.fillStyle = isRed ? 'rgba(120, 20, 20, 0.7)' : 'rgba(51, 65, 85, 0.85)';
        ctx.strokeStyle = isRed ? '#ff4d4d' : '#94a3b8';
        ctx.lineWidth = 1.5;

        // Facader
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t1.x, t1.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(t2.x, t2.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // Tag
        ctx.fillStyle = isRed ? 'rgba(180, 30, 30, 0.6)' : 'rgba(71, 85, 105, 0.9)';
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();

      } else {
        // Standard person
        var headY = pTop.y;
        var footY = pBase.y;
        var personH = footY - headY;

        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.5;

        // Hoved
        ctx.beginPath();
        ctx.arc(pBase.x, headY + 5, 5, 0, PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();

        // Krop og lemmer
        ctx.beginPath();
        ctx.moveTo(pBase.x, headY + 10);
        ctx.lineTo(pBase.x, footY - personH * 0.4);
        ctx.lineTo(pBase.x - 5, footY);
        ctx.moveTo(pBase.x, footY - personH * 0.4);
        ctx.lineTo(pBase.x + 5, footY);
        // Arme
        ctx.moveTo(pBase.x - 7, headY + 18);
        ctx.lineTo(pBase.x + 7, headY + 18);
        ctx.stroke();
      }

      // Højdemarkør ved siden af motivet
      var markX = pBase.x + 18;
      ctx.strokeStyle = isRed ? 'rgba(255, 60, 60, 0.4)' : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(markX, pBase.y);
      ctx.lineTo(markX, pTop.y);
      ctx.moveTo(markX - 3, pBase.y);
      ctx.lineTo(markX + 3, pBase.y);
      ctx.moveTo(markX - 3, pTop.y);
      ctx.lineTo(markX + 3, pTop.y);
      ctx.stroke();

      ctx.fillStyle = isRed ? '#ff8888' : '#cbd5e1';
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(subjectHeight.toFixed(1) + 'm', markX + 6, (pBase.y + pTop.y) * 0.5 + 3);

      ctx.restore();
    }

    /**
     * Solen placeret på himlen med lysstråle mod motiv og skyggespids
     */
    function drawSunInSky(w, h, cx, cy, altDeg, azDeg, isRed) {
      if (altDeg <= -0.833) {
        // Solen er under horisonten
        drawSubHorizonIndicator(w, h, altDeg, isRed);
        return;
      }

      // Vinkel relativt til kamera
      var relAzRad = (azDeg - camera.azimuth) * rad;
      var sunDist = Math.min(w, h) * 0.42;

      // Solens skærmposition
      var sunScreenX = cx + sin(relAzRad) * sunDist * 1.1;
      // Højde over midterlinje
      var altFactor = Math.sin(Math.max(0, altDeg) * rad);
      var sunScreenY = cy - 25 - altFactor * (h * 0.45);

      // Sørg for at solen forbliver pænt synlig på lærredet
      sunScreenX = Math.max(28, Math.min(w - 28, sunScreenX));
      sunScreenY = Math.max(26, Math.min(h * 0.65, sunScreenY));

      ctx.save();

      // Solkorona / glød
      var glowRadius = 38;
      var sunGlow = ctx.createRadialGradient(sunScreenX, sunScreenY, 4, sunScreenX, sunScreenY, glowRadius);

      if (isRed) {
        sunGlow.addColorStop(0, 'rgba(255, 100, 100, 0.9)');
        sunGlow.addColorStop(0.35, 'rgba(255, 30, 30, 0.45)');
        sunGlow.addColorStop(1, 'rgba(150, 0, 0, 0)');
      } else {
        if (altDeg < 6) {
          // Gylden time glød
          sunGlow.addColorStop(0, '#fbbf24');
          sunGlow.addColorStop(0.3, 'rgba(245, 158, 11, 0.55)');
          sunGlow.addColorStop(0.7, 'rgba(217, 119, 6, 0.25)');
          sunGlow.addColorStop(1, 'rgba(180, 83, 9, 0)');
        } else {
          // Neutral høj sol glød
          sunGlow.addColorStop(0, '#ffffff');
          sunGlow.addColorStop(0.25, 'rgba(253, 224, 71, 0.7)');
          sunGlow.addColorStop(0.65, 'rgba(245, 158, 11, 0.25)');
          sunGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
        }
      }

      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunScreenX, sunScreenY, glowRadius, 0, PI * 2);
      ctx.fill();

      // Selve solskiven
      ctx.fillStyle = isRed ? '#ffffff' : (altDeg < 6 ? '#fef08a' : '#ffffff');
      ctx.beginPath();
      ctx.arc(sunScreenX, sunScreenY, 10, 0, PI * 2);
      ctx.fill();

      // Diskret solstråle-linje mod jorden
      ctx.strokeStyle = isRed ? 'rgba(255, 80, 80, 0.15)' : 'rgba(251, 191, 36, 0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(sunScreenX, sunScreenY);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Solens vinkeletiket ved siden af solen
      ctx.fillStyle = isRed ? '#ff8888' : '#fbbf24';
      ctx.font = 'bold 10px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = sunScreenX > cx ? 'left' : 'right';
      var textX = sunScreenX > cx ? sunScreenX + 16 : sunScreenX - 16;
      ctx.fillText('SOL ' + (altDeg >= 0 ? '+' : '') + altDeg.toFixed(1) + '°', textX, sunScreenY - 4);
      ctx.fillStyle = isRed ? '#cc5555' : '#94a3b8';
      ctx.fillText(azDeg.toFixed(0) + '° ' + AstroCalc.getCompassDirection(azDeg), textX, sunScreenY + 8);

      ctx.restore();
    }

    /**
     * Viser status hvis solen er under horisonten
     */
    function drawSubHorizonIndicator(w, h, altDeg, isRed) {
      ctx.save();
      ctx.fillStyle = isRed ? '#ff4d4d' : '#818cf8';
      ctx.font = 'bold 12px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      var badgeText = altDeg < -18 ? 'ASTRONOMISK NAT' : (altDeg < -6 ? 'TUSMØRKE' : 'BLÅ TIME');
      ctx.fillText('☾ ' + badgeText + ' (SOL ' + altDeg.toFixed(1) + '° UNDER HORISONTEN)', w * 0.5, 34);
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = isRed ? '#aa3333' : '#64748b';
      ctx.fillText('Ingen hårde direkte skygger – brug stativ til langtidseksponering', w * 0.5, 50);
      ctx.restore();
    }

    /**
     * EVF kamera-hjørnemærker og status
     */
    function drawEvfOverlay(w, h, isRed) {
      var reticleColor = isRed ? 'rgba(255, 60, 60, 0.35)' : 'rgba(255, 255, 255, 0.2)';
      var rLen = 14;

      ctx.save();
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1.5;

      // EVF Hjørneramme [ ]
      var pad = 12;
      // Top-venstre
      ctx.beginPath();
      ctx.moveTo(pad, pad + rLen); ctx.lineTo(pad, pad); ctx.lineTo(pad + rLen, pad);
      // Top-højre
      ctx.moveTo(w - pad - rLen, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + rLen);
      // Bund-venstre
      ctx.moveTo(pad, h - pad - rLen); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + rLen, h - pad);
      // Bund-højre
      ctx.moveTo(w - pad - rLen, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - rLen);
      ctx.stroke();

      // Kamera-navigationshint i bunden
      ctx.fillStyle = isRed ? 'rgba(255, 60, 60, 0.45)' : 'rgba(148, 163, 184, 0.45)';
      ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TRÆK FOR AT ROTERE 3D-SØGER', w * 0.5, h - 16);

      ctx.restore();
    }

    /* -------------------------------------------------------------
       2. 2D TOP-DOWN KOMPAS & SOLUR (Radar)
       ------------------------------------------------------------- */
    function renderCompassView(w, h, isRed) {
      var cx = w * 0.5;
      var cy = h * 0.5;
      var r = Math.min(w, h) * 0.42;

      // Baggrund
      ctx.fillStyle = isRed ? '#0d0101' : '#070a12';
      ctx.fillRect(0, 0, w, h);

      ctx.save();

      // Kompasskive
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, PI * 2);
      ctx.fillStyle = isRed ? '#190303' : '#0f172a';
      ctx.fill();
      ctx.strokeStyle = isRed ? 'rgba(255, 60, 60, 0.35)' : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gradmærker hver 30°
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
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isCardinal ? (isRed ? '#ff4d4d' : '#38bdf8') : (isRed ? 'rgba(255, 60, 60, 0.25)' : 'rgba(255, 255, 255, 0.12)');
        ctx.lineWidth = isCardinal ? 2 : 1;
        ctx.stroke();

        if (isMajor) {
          var labelX = cx + cos(a) * (r - 20);
          var labelY = cy + sin(a) * (r - 20);
          ctx.font = isCardinal ? 'bold 12px ui-monospace, monospace' : '9px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isCardinal ? (degStep === 0 ? (isRed ? '#ff4d4d' : '#f43f5e') : (isRed ? '#ff8888' : '#38bdf8')) : (isRed ? '#aa3333' : '#64748b');

          var cardinalName = degStep === 0 ? 'N' : (degStep === 90 ? 'Ø' : (degStep === 180 ? 'S' : (degStep === 270 ? 'V' : degStep + '°')));
          ctx.fillText(cardinalName, labelX, labelY);
        }
      }

      // Solbue for dagens forløb hvis solopgang og solnedgang haves
      if (simData.sunTimes && simData.sunTimes.sunrise && simData.sunTimes.sunset) {
        var risePos = AstroCalc.getSunPosition(simData.sunTimes.sunrise, 55.67, 12.56);
        var setPos = AstroCalc.getSunPosition(simData.sunTimes.sunset, 55.67, 12.56);

        // Bue for dagens solsti
        ctx.beginPath();
        var startAngle = (risePos.azimuth - 90) * rad;
        var endAngle = (setPos.azimuth - 90) * rad;
        ctx.arc(cx, cy, r * 0.75, startAngle, endAngle, false);
        ctx.strokeStyle = isRed ? 'rgba(255, 100, 100, 0.35)' : 'rgba(245, 158, 11, 0.35)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Mærker for solopgang og solnedgang
        var riseX = cx + cos(startAngle) * (r * 0.75);
        var riseY = cy + sin(startAngle) * (r * 0.75);
        var setX = cx + cos(endAngle) * (r * 0.75);
        var setY = cy + sin(endAngle) * (r * 0.75);

        ctx.fillStyle = isRed ? '#ff4d4d' : '#fbbf24';
        ctx.beginPath(); ctx.arc(riseX, riseY, 4, 0, PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(setX, setY, 4, 0, PI * 2); ctx.fill();
      }

      // Solens aktuelle retning (solstråle-vektor)
      var sunAngle = (simData.sunAzimuth - 90) * rad;
      var sunX = cx + cos(sunAngle) * (r * 0.92);
      var sunY = cy + sin(sunAngle) * (r * 0.92);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sunX, sunY);
      ctx.strokeStyle = isRed ? '#ff4d4d' : '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Solmarkør
      ctx.fillStyle = isRed ? '#ffffff' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 7, 0, PI * 2);
      ctx.fill();

      // Skyggens retning (modsat sol)
      var shadowAngle = (simData.shadowAzimuth - 90) * rad;
      // Visuel længde afkortes pænt inden for skiven
      var shadowR = simData.hasDirectShadow ? Math.min(r * 0.85, Math.max(25, simData.shadowLength * 5)) : 10;
      var shadowX = cx + cos(shadowAngle) * shadowR;
      var shadowY = cy + sin(shadowAngle) * shadowR;

      if (simData.hasDirectShadow) {
        // Skyggekegle
        var coneWidth = 0.16; // ca. 10 grader
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, shadowR, shadowAngle - coneWidth, shadowAngle + coneWidth);
        ctx.closePath();
        ctx.fillStyle = isRed ? 'rgba(50, 2, 2, 0.85)' : 'rgba(15, 23, 42, 0.85)';
        ctx.fill();
        ctx.strokeStyle = isRed ? '#ff3333' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Skyggetekst ved spidsen
        ctx.fillStyle = isRed ? '#ff6666' : '#38bdf8';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(simData.shadowLength.toFixed(1) + 'm (' + AstroCalc.getCompassDirection(simData.shadowAzimuth) + ')', shadowX, shadowY - 8);
      }

      // Centrum (motivet)
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, PI * 2);
      ctx.fillStyle = isRed ? '#ff4d4d' : '#f8fafc';
      ctx.fill();

      // Header tekst
      ctx.fillStyle = isRed ? '#ff8888' : '#e2e8f0';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('KOMPAS & SOLUR (RADAR)', 14, 22);

      ctx.restore();
    }

    /* -------------------------------------------------------------
       3. PROFIL & HØJDEVINKEL (Tværsnit)
       ------------------------------------------------------------- */
    function renderProfileView(w, h, isRed) {
      // Baggrund
      ctx.fillStyle = isRed ? '#0d0101' : '#070a12';
      ctx.fillRect(0, 0, w, h);

      var groundY = h * 0.76;
      var originX = w * 0.22;

      ctx.save();

      // Jordlinje
      ctx.strokeStyle = isRed ? '#661111' : '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, groundY);
      ctx.lineTo(w - 15, groundY);
      ctx.stroke();

      // Skala for motivhøjde i profil
      var pxH = h * 0.38; // motivhøjde i pixels
      var topY = groundY - pxH;

      // Vertikal genstand
      ctx.strokeStyle = isRed ? '#ff4d4d' : '#f8fafc';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(originX, groundY);
      ctx.lineTo(originX, topY);
      ctx.stroke();

      // Højdetekst
      ctx.fillStyle = isRed ? '#ff8888' : '#cbd5e1';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('H = ' + subjectHeight.toFixed(2) + 'm', originX - 10, (groundY + topY) * 0.5);

      if (simData.hasDirectShadow && simData.sunAltitude > 0) {
        var altRad = simData.sunAltitude * rad;
        var pxShadowLen = pxH / tan(altRad);
        var shadowTipX = Math.min(w - 20, originX + pxShadowLen);

        // Skygge på jorden
        ctx.strokeStyle = isRed ? '#ff2222' : '#f59e0b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(originX, groundY);
        ctx.lineTo(shadowTipX, groundY);
        ctx.stroke();

        // Solstråle (hypotenuse)
        ctx.strokeStyle = isRed ? 'rgba(255, 80, 80, 0.45)' : 'rgba(251, 191, 36, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(originX, topY);
        ctx.lineTo(shadowTipX, groundY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vinkelbue ved jorden eller toppen
        var arcR = 30;
        ctx.beginPath();
        ctx.arc(shadowTipX, groundY, arcR, PI, PI + altRad, false);
        ctx.strokeStyle = isRed ? '#ff6666' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Solvinkel tekst
        ctx.fillStyle = isRed ? '#ff8888' : '#38bdf8';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('θ = ' + simData.sunAltitude.toFixed(1) + '°', shadowTipX - arcR - 6, groundY - 8);

        // Skyggelængde tekst under jordlinje
        ctx.fillStyle = isRed ? '#ff4d4d' : '#f59e0b';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center';
        var midX = (originX + shadowTipX) * 0.5;
        ctx.fillText('Skygge L = ' + simData.shadowLength.toFixed(2) + ' m (' + simData.shadowRatio.toFixed(1) + '× H)', midX, groundY + 22);

        // Matematisk formel forklaring
        ctx.fillStyle = isRed ? '#aa3333' : '#64748b';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText('L = H / tan(' + simData.sunAltitude.toFixed(1) + '°)', midX, groundY + 38);
      } else {
        // Sol under horisont
        ctx.fillStyle = isRed ? '#ff6666' : '#818cf8';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Solen er under horisonten (θ ≤ 0°) – Ingen geometrisk skygge', w * 0.5, groundY + 30);
      }

      // Titel
      ctx.fillStyle = isRed ? '#ff8888' : '#e2e8f0';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('ELEVATIONSPROFIL & SKYGGEGEOMETRI', 14, 22);

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
