/**
 * app.js - UI controller, tidsrejse, afspilning, GPS, søgning og skyggeberegning for FotoSol
 */

(function () {
  'use strict';

  // App tilstand
  const state = {
    currentLoc: {
      name: 'København',
      sub: 'Nyhavn & Havnefronten',
      lat: 55.6761,
      lng: 12.5683,
      isGps: false,
      accuracy: null
    },
    selectedDate: new Date(),
    selectedMinutes: 0,
    isLive: true,
    isPlaying: false,
    playSpeed: 10,
    playTimer: null,
    subjectType: 'photographer',
    subjectHeight: 1.80,
    simMode: '3d',
    forecastData: null,
    sunTimes: null,
    searchDebounceTimer: null
  };

  // DOM elementer
  const el = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    btnRefresh: document.getElementById('btnRefresh'),
    btnGps: document.getElementById('btnGps'),
    btnSearchOpen: document.getElementById('btnSearchOpen'),
    locationPinIcon: document.getElementById('locationPinIcon'),
    locName: document.getElementById('locName'),
    locCoords: document.getElementById('locCoords'),
    locationCurrentWrap: document.getElementById('locationCurrentWrap'),
    searchDropdown: document.getElementById('searchDropdown'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    statusBanner: document.getElementById('statusBanner'),
    statusBannerText: document.getElementById('statusBannerText'),
    statusBannerTime: document.getElementById('statusBannerTime'),
    daysScroll: document.getElementById('daysScroll'),

    // Canvas, Kort & Sim
    canvasWrap: document.getElementById('canvasWrap'),
    mapWrap: document.getElementById('mapWrap'),
    simCanvas: document.getElementById('simCanvas'),
    tab3d: document.getElementById('tab3d'),
    tabCompass: document.getElementById('tabCompass'),
    tabMap: document.getElementById('tabMap'),
    simActions3d: document.getElementById('simActions3d'),
    btnCamReset: document.getElementById('btnCamReset'),
    btnCamRim: document.getElementById('btnCamRim'),
    btnCamShadow: document.getElementById('btnCamShadow'),

    // Telemetristribe
    telemetryElevation: document.getElementById('telemetryElevation'),
    telemetrySunAz: document.getElementById('telemetrySunAz'),
    telemetryShadowLen: document.getElementById('telemetryShadowLen'),
    telemetryShadowAz: document.getElementById('telemetryShadowAz'),

    // Motiv & højde
    subjectChips: document.querySelectorAll('.subject-chip'),
    subjectHeightSlider: document.getElementById('subjectHeightSlider'),
    subjectHeightVal: document.getElementById('subjectHeightVal'),
    customHeightWrap: document.getElementById('customHeightWrap'),

    // Tidsstyring
    timeDisplay: document.getElementById('timeDisplay'),
    phaseBadge: document.getElementById('phaseBadge'),
    btnLive: document.getElementById('btnLive'),
    btnSpeed: document.getElementById('btnSpeed'),
    btnPlay: document.getElementById('btnPlay'),
    playIcon: document.getElementById('playIcon'),
    playLabel: document.getElementById('playLabel'),
    timeSlider: document.getElementById('timeSlider'),

    // Hurtighop
    jumpNow: document.getElementById('jumpNow'),
    jumpDawn: document.getElementById('jumpDawn'),
    jumpSunrise: document.getElementById('jumpSunrise'),
    jumpGoldenMorning: document.getElementById('jumpGoldenMorning'),
    jumpNoon: document.getElementById('jumpNoon'),
    jumpGoldenEvening: document.getElementById('jumpGoldenEvening'),
    jumpSunset: document.getElementById('jumpSunset'),
    jumpDusk: document.getElementById('jumpDusk'),

    // Datakort
    cardSunAlt: document.getElementById('cardSunAlt'),
    cardSunAz: document.getElementById('cardSunAz'),
    cardSolarNoon: document.getElementById('cardSolarNoon'),
    cardKelvin: document.getElementById('cardKelvin'),
    cardShadowLen: document.getElementById('cardShadowLen'),
    cardShadowRatio: document.getElementById('cardShadowRatio'),
    cardShadowAz: document.getElementById('cardShadowAz'),
    cardShadowDiffusion: document.getElementById('cardShadowDiffusion'),

    // Råd & Ephemeris
    adviceDesc: document.getElementById('adviceDesc'),
    adviceTip: document.getElementById('adviceTip'),
    timeRowDawn: document.getElementById('timeRowDawn'),
    timeRowSunrise: document.getElementById('timeRowSunrise'),
    timeRowGoldenMorn: document.getElementById('timeRowGoldenMorn'),
    timeRowGoldenEve: document.getElementById('timeRowGoldenEve'),
    timeRowSunset: document.getElementById('timeRowSunset'),
    timeRowDusk: document.getElementById('timeRowDusk')
  };

  let simulator = null;

  /**
   * Initialisering
   */
  async function init() {
    loadPreferences();
    setupCanvas();
    setupMap();
    setupEvents();
    renderDaysBar();

    // Sæt starttid til nu
    syncToCurrentMinute();

    // Hent gemt lokation eller anmod om GPS
    await loadInitialLocation();

    // Start levende minut-opdatering
    setInterval(onClockTick, 10000);
  }

  /**
   * Indlæs gemte brugerindstillinger
   */
  function loadPreferences() {
    try {
      const savedLoc = localStorage.getItem('fotosol_last_loc');
      if (savedLoc) {
        state.currentLoc = JSON.parse(savedLoc);
      }
    } catch (e) {}
  }

  /**
   * Initialiser simulations-canvas
   */
  function setupCanvas() {
    simulator = ShadowSimulator.createSimulator(el.simCanvas, {
      mode: state.simMode,
      subjectType: state.subjectType,
      subjectHeight: state.subjectHeight
    });

    window.addEventListener('resize', () => {
      if (simulator) simulator.render();
    });
  }

  /**
   * Initialiser interaktivt fotokort
   */
  function setupMap() {
    if (window.PhotoMap) {
      PhotoMap.initMap('mapContainer', {
        lat: state.currentLoc.lat,
        lng: state.currentLoc.lng,
        onLocationChange: async (lat, lng) => {
          state.currentLoc.lat = lat;
          state.currentLoc.lng = lng;
          state.currentLoc.isGps = false;

          try {
            const geo = await WeatherEngine.reverseGeocode(lat, lng);
            state.currentLoc.name = geo.name || 'Valgt fotospot';
            state.currentLoc.sub = geo.sub || '';
          } catch (e) {
            state.currentLoc.name = 'Valgt fotospot';
            state.currentLoc.sub = lat.toFixed(3) + '°N, ' + lng.toFixed(3) + '°Ø';
          }

          try {
            localStorage.setItem('fotosol_last_loc', JSON.stringify(state.currentLoc));
          } catch (e) {}

          updateLocationDisplay();
          recalculateSunAndShadow();
          await updateWeatherAndForecast(false);
        }
      });
    }
  }

  /**
   * Opdater lokationsvisning
   */
  function updateLocationDisplay() {
    el.locName.textContent = state.currentLoc.name || 'Aktuel position';
    const latStr = Math.abs(state.currentLoc.lat).toFixed(3) + '°' + (state.currentLoc.lat >= 0 ? 'N' : 'S');
    const lngStr = Math.abs(state.currentLoc.lng).toFixed(3) + '°' + (state.currentLoc.lng >= 0 ? 'Ø' : 'V');

    if (state.currentLoc.isGps) {
      el.locationPinIcon.classList.add('gps-locked');
      const accText = state.currentLoc.accuracy ? ` (±${state.currentLoc.accuracy}m)` : '';
      const subText = state.currentLoc.sub ? `${state.currentLoc.sub} • ` : '';
      el.locCoords.innerHTML = `<span style="color:#10b981;">● GPS</span> • ${escapeHtml(subText)}${latStr}, ${lngStr}${accText}`;
    } else {
      el.locationPinIcon.classList.remove('gps-locked');
      const subText = state.currentLoc.sub ? `${state.currentLoc.sub} • ` : '';
      el.locCoords.textContent = `${subText}${latStr}, ${lngStr}`;
    }
  }

  /**
   * Henter startposition
   */
  async function loadInitialLocation() {
    updateLocationDisplay();
    if (window.PhotoMap) {
      PhotoMap.setLocation(state.currentLoc.lat, state.currentLoc.lng, false);
    }
    recalculateSunAndShadow();
    await updateWeatherAndForecast();
  }

  /**
   * Opdater GPS position
   */
  async function acquireGpsLocation() {
    if (!navigator.geolocation) {
      alert('GPS understøttes ikke af din browser.');
      return;
    }

    showLoading(true, 'Finder aktuel GPS position...');
    el.locName.textContent = 'Søger GPS satellitter...';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;

        el.locName.textContent = 'Navngiver lokation...';
        let geoInfo = { name: 'Aktuel position', sub: '' };
        try {
          geoInfo = await WeatherEngine.reverseGeocode(lat, lng);
        } catch (e) {
          console.warn('Reverse geocode fejl:', e);
        }

        state.currentLoc = {
          name: geoInfo.name || 'GPS position',
          sub: geoInfo.sub || '',
          lat: lat,
          lng: lng,
          accuracy: accuracy,
          isGps: true
        };

        try {
          localStorage.setItem('fotosol_last_loc', JSON.stringify(state.currentLoc));
        } catch (e) {}

        updateLocationDisplay();
        if (window.PhotoMap) {
          PhotoMap.setLocation(lat, lng, true);
        }
        recalculateSunAndShadow();
        await updateWeatherAndForecast(true);
        showLoading(false);
      },
      (err) => {
        showLoading(false);
        console.warn('GPS fejl:', err);
        alert('GPS kunne ikke findes. Kontroller at lokationstilladelse er slået til i browseren.');
        updateLocationDisplay();
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  }

  /**
   * Henter vejrdata for skydække og skyggekvalitet
   */
  async function updateWeatherAndForecast(forceRefresh = false) {
    try {
      const res = await WeatherEngine.fetchForecast(state.currentLoc.lat, state.currentLoc.lng, forceRefresh);
      state.forecastData = res.forecast;

      if (res.isCached) {
        el.statusBanner.classList.add('active');
        el.statusBannerText.textContent = 'Offline tilstand – gemte vejrdata';
        el.statusBannerTime.textContent = 'Hentet kl. ' + AstroCalc.formatTime(res.updatedAt);
      } else {
        el.statusBanner.classList.remove('active');
      }

      recalculateSunAndShadow();
    } catch (e) {
      console.warn('Vejrhentning fejlede:', e);
    }
  }

  /**
   * Synkroniser til nuværende minut
   */
  function syncToCurrentMinute() {
    const now = new Date();
    state.selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    state.selectedMinutes = now.getHours() * 60 + now.getMinutes();
    state.isLive = true;

    el.timeSlider.value = state.selectedMinutes;
    el.btnLive.classList.add('active');

    updateDayChipsSelection();
    recalculateSunAndShadow();
  }

  /**
   * Hvert 10. sekund: hvis LIVE er aktiv, følg uret
   */
  function onClockTick() {
    if (state.isLive && !state.isPlaying) {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      if (currentMin !== state.selectedMinutes) {
        state.selectedMinutes = currentMin;
        el.timeSlider.value = currentMin;
        recalculateSunAndShadow();
      }
    }
  }

  /**
   * Beregner aktuelt tidspunkt som Date-objekt
   */
  function getCalculatedTargetDate() {
    const d = new Date(state.selectedDate.getTime());
    const hours = Math.floor(state.selectedMinutes / 60);
    const mins = Math.floor(state.selectedMinutes % 60);
    d.setHours(hours, mins, 0, 0);
    return d;
  }

  /**
   * Hovedberegning for solens placering, højde og skygge
   */
  function recalculateSunAndShadow() {
    const targetDate = getCalculatedTargetDate();
    const lat = state.currentLoc.lat;
    const lng = state.currentLoc.lng;

    // 1. Solens tider for dagen (Ephemeris)
    state.sunTimes = AstroCalc.getSunTimes(targetDate, lat, lng);

    // 2. Solens position for det valgte minut
    const sunPos = AstroCalc.getSunPosition(targetDate, lat, lng);
    const altitude = sunPos.altitude;
    const azimuth = sunPos.azimuth;

    // 3. Skyggeberegning
    const shadow = AstroCalc.calculateShadow(altitude, azimuth, state.subjectHeight);

    // 4. Skydække og skyggekvalitet fra vejret
    const weatherEval = WeatherEngine.evaluateShadowDiffusion(state.forecastData, targetDate);

    // 5. Opdater canvas simulation
    if (simulator) {
      simulator.update(altitude, azimuth, state.subjectHeight, {
        subjectType: state.subjectType,
        diffusionFactor: weatherEval.diffusionFactor,
        sunTimes: state.sunTimes
      });
    }

    // 6. Opdater interaktivt fotokort
    if (window.PhotoMap) {
      PhotoMap.updateSunAndShadow(altitude, azimuth, shadow.shadowLength, state.sunTimes);
    }

    // 7. Opdater UI displays
    updateUIElements(targetDate, altitude, azimuth, shadow, weatherEval);
  }

  /**
   * Opdaterer alle tekst- og dataelementer i grænsefladen
   */
  function updateUIElements(targetDate, altitude, azimuth, shadow, weatherEval) {
    // Digitalt ur
    el.timeDisplay.textContent = AstroCalc.formatTime(targetDate);

    // Lysfase-badge
    const phase = shadow.lightPhase;
    el.phaseBadge.textContent = phase.badge;
    el.phaseBadge.style.color = phase.color;
    el.phaseBadge.style.borderColor = phase.color;

    // Telemetristribe under canvas
    el.telemetryElevation.textContent = AstroCalc.formatDegrees(altitude);
    el.telemetrySunAz.textContent = azimuth.toFixed(0) + '° ' + AstroCalc.getCompassDirection(azimuth);

    if (shadow.hasDirectShadow) {
      el.telemetryShadowLen.textContent = shadow.shadowLength < 100 ? shadow.shadowLength.toFixed(1) + ' m' : '> 100 m';
      el.telemetryShadowAz.textContent = shadow.shadowAzimuth.toFixed(0) + '° ' + shadow.shadowCompass;
    } else {
      el.telemetryShadowLen.textContent = 'Ingen';
      el.telemetryShadowAz.textContent = '--°';
    }

    // Solkort
    el.cardSunAlt.textContent = AstroCalc.formatDegrees(altitude);
    el.cardSunAz.textContent = azimuth.toFixed(1) + '° ' + AstroCalc.getCompassDirectionFullName(azimuth);

    if (state.sunTimes && state.sunTimes.solarNoon) {
      const noonTime = AstroCalc.formatTime(state.sunTimes.solarNoon);
      const noonAlt = state.sunTimes.maxAltitude ? AstroCalc.formatDegrees(state.sunTimes.maxAltitude) : '';
      el.cardSolarNoon.textContent = `${noonTime} (${noonAlt})`;
    } else {
      el.cardSolarNoon.textContent = '--:--';
    }

    const kelvinInfo = AstroCalc.getEstimatedKelvin(altitude);
    el.cardKelvin.textContent = `${kelvinInfo.kelvin} K (${kelvinInfo.label})`;

    // Skyggekort
    if (shadow.hasDirectShadow) {
      el.cardShadowLen.textContent = shadow.shadowLength < 100 ? `${shadow.shadowLength.toFixed(2)} m` : '> 100 m';
      el.cardShadowRatio.textContent = `${shadow.shadowRatio.toFixed(2)}× genstandshøjde`;
      el.cardShadowAz.textContent = `${shadow.shadowAzimuth.toFixed(1)}° ${shadow.shadowCompass}`;
    } else {
      el.cardShadowLen.textContent = 'Ingen direkte skygge';
      el.cardShadowRatio.textContent = 'Diffust spredt lys';
      el.cardShadowAz.textContent = '--';
    }
    el.cardShadowDiffusion.textContent = weatherEval.badge ? `${weatherEval.quality} (${weatherEval.badge})` : weatherEval.quality;

    // Råd og komposition
    el.adviceDesc.textContent = shadow.description;
    el.adviceTip.textContent = 'Fototilstand: ' + shadow.cameraTip;

    // Ephemeris soltider
    if (state.sunTimes) {
      const st = state.sunTimes;
      el.timeRowDawn.textContent = `${AstroCalc.formatTime(st.civilDawn)} – ${AstroCalc.formatTime(st.blueHourMorning.end)}`;
      el.timeRowSunrise.textContent = AstroCalc.formatTime(st.sunrise);
      el.timeRowGoldenMorn.textContent = `${AstroCalc.formatTime(st.goldenHourMorning.start)} – ${AstroCalc.formatTime(st.goldenHourMorning.end)}`;
      el.timeRowGoldenEve.textContent = `${AstroCalc.formatTime(st.goldenHourEvening.start)} – ${AstroCalc.formatTime(st.goldenHourEvening.end)}`;
      el.timeRowSunset.textContent = AstroCalc.formatTime(st.sunset);
      el.timeRowDusk.textContent = `${AstroCalc.formatTime(st.blueHourEvening.start)} – ${AstroCalc.formatTime(st.civilDusk)}`;
    }
  }

  /**
   * 7-dages horisontalbånd generering
   */
  function renderDaysBar() {
    el.daysScroll.innerHTML = '';
    const weekdays = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
    const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

    const baseDate = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i);
      const isToday = i === 0;

      const chip = document.createElement('button');
      chip.className = 'day-chip' + (i === 0 ? ' active' : '');
      chip.dataset.dayOffset = i;

      const dayName = isToday ? 'I DAG' : (i === 1 ? 'I MORGEN' : weekdays[d.getDay()]);
      const dateText = `${d.getDate()}. ${months[d.getMonth()]}`;

      chip.innerHTML = `
        <span class="day-chip-name">${dayName}</span>
        <span class="day-chip-date">${dateText}</span>
      `;

      chip.addEventListener('click', () => {
        state.selectedDate = d;
        updateDayChipsSelection();
        recalculateSunAndShadow();
      });

      el.daysScroll.appendChild(chip);
    }
  }

  function updateDayChipsSelection() {
    const chips = el.daysScroll.querySelectorAll('.day-chip');
    const curTime = state.selectedDate.getTime();

    chips.forEach((c) => {
      const offset = parseInt(c.dataset.dayOffset, 10);
      const d = new Date();
      d.setDate(d.getDate() + offset);
      if (d.toDateString() === state.selectedDate.toDateString()) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  /**
   * Tidsafspilning (Play / Pause animation)
   */
  function togglePlay() {
    if (state.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    state.isPlaying = true;
    state.isLive = false;
    el.btnLive.classList.remove('active');

    el.playLabel.textContent = 'Pause';
    el.playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    el.btnPlay.style.background = '#ef4444';

    let lastTime = performance.now();

    function loop(now) {
      if (!state.isPlaying) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Fremfør minutter baseret på hastighed (f.eks. speed 10 = 10 min pr. sekund)
      state.selectedMinutes = (state.selectedMinutes + dt * state.playSpeed) % 1440;
      el.timeSlider.value = Math.floor(state.selectedMinutes);

      recalculateSunAndShadow();
      state.playTimer = requestAnimationFrame(loop);
    }

    state.playTimer = requestAnimationFrame(loop);
  }

  function stopPlayback() {
    state.isPlaying = false;
    if (state.playTimer) cancelAnimationFrame(state.playTimer);
    el.playLabel.textContent = 'Spil';
    el.playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
    el.btnPlay.style.background = 'var(--golden-primary)';
  }

  /**
   * Skift afspilningshastighed
   */
  function cycleSpeed() {
    const speeds = [5, 10, 30, 60];
    const curIdx = speeds.indexOf(state.playSpeed);
    const nextIdx = (curIdx + 1) % speeds.length;
    state.playSpeed = speeds[nextIdx];
    el.btnSpeed.textContent = state.playSpeed + '×';
  }

  /**
   * Hurtighop til givet tidspunkt
   */
  function jumpToDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return;
    stopPlayback();
    state.isLive = false;
    el.btnLive.classList.remove('active');

    state.selectedMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
    el.timeSlider.value = state.selectedMinutes;
    recalculateSunAndShadow();
  }

  /**
   * Opsæt alle event listeners
   */
  function setupEvents() {
    // GPS & Refresh
    el.btnGps.addEventListener('click', () => acquireGpsLocation());
    el.btnRefresh.addEventListener('click', async () => {
      showLoading(true, 'Opdaterer beregninger...');
      await updateWeatherAndForecast(true);
      recalculateSunAndShadow();
      showLoading(false);
    });

    // Søgeboks åbn/luk
    el.btnSearchOpen.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSearchDropdown();
    });
    el.locationCurrentWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSearchDropdown();
    });

    // Søge input med debounce
    el.searchInput.addEventListener('input', (e) => {
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = setTimeout(() => {
        performSearch(e.target.value);
      }, 250);
    });

    // Luk søg ved klik udenfor
    document.addEventListener('click', (e) => {
      if (!el.searchDropdown.contains(e.target) && e.target !== el.btnSearchOpen) {
        el.searchDropdown.classList.remove('active');
      }
    });

    // Visnings-tabs for simulation (3D / Kompas / Kort)
    const tabs = [el.tab3d, el.tabCompass, el.tabMap];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.simMode = tab.dataset.mode;

        if (state.simMode === 'map') {
          el.canvasWrap.style.display = 'none';
          el.mapWrap.style.display = 'block';
          if (el.simActions3d) el.simActions3d.style.display = 'none';
          if (window.PhotoMap) {
            PhotoMap.resize();
            PhotoMap.setLocation(state.currentLoc.lat, state.currentLoc.lng, true);
            recalculateSunAndShadow();
          }
        } else {
          el.canvasWrap.style.display = 'block';
          el.mapWrap.style.display = 'none';
          if (el.simActions3d) el.simActions3d.style.display = state.simMode === '3d' ? 'flex' : 'none';
          if (simulator) {
            simulator.setMode(state.simMode);
            simulator.render();
          }
        }
      });
    });

    // Kameravinkel hurtigknapper
    el.btnCamReset.addEventListener('click', () => {
      if (simulator) simulator.resetCamera('default');
    });
    el.btnCamRim.addEventListener('click', () => {
      if (simulator) simulator.resetCamera('rim');
    });
    el.btnCamShadow.addEventListener('click', () => {
      if (simulator) simulator.resetCamera('shadow');
    });

    // Motiv chips & højde
    el.subjectChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        el.subjectChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const type = chip.dataset.type;
        const h = parseFloat(chip.dataset.h);
        state.subjectType = type;
        state.subjectHeight = h;

        el.subjectHeightSlider.value = h;
        el.subjectHeightVal.textContent = h.toFixed(1) + ' m';

        if (simulator) simulator.setSubjectType(type, h);
        recalculateSunAndShadow();
      });
    });

    // Højdeslider
    el.subjectHeightSlider.addEventListener('input', (e) => {
      const h = parseFloat(e.target.value);
      state.subjectHeight = h;
      el.subjectHeightVal.textContent = h.toFixed(1) + ' m';

      if (simulator) simulator.setSubjectType(state.subjectType, h);
      recalculateSunAndShadow();
    });

    // Tidslinje slider (Scrubber)
    el.timeSlider.addEventListener('input', (e) => {
      stopPlayback();
      state.isLive = false;
      el.btnLive.classList.remove('active');
      state.selectedMinutes = parseInt(e.target.value, 10);
      recalculateSunAndShadow();
    });

    // Play/Pause & Live & Speed
    el.btnPlay.addEventListener('click', togglePlay);
    el.btnSpeed.addEventListener('click', cycleSpeed);
    el.btnLive.addEventListener('click', () => {
      stopPlayback();
      syncToCurrentMinute();
    });

    // Hurtighop
    el.jumpNow.addEventListener('click', () => {
      stopPlayback();
      syncToCurrentMinute();
    });
    el.jumpDawn.addEventListener('click', () => {
      if (state.sunTimes && state.sunTimes.civilDawn) jumpToDate(state.sunTimes.civilDawn);
    });
    el.jumpSunrise.addEventListener('click', () => {
      if (state.sunTimes && state.sunTimes.sunrise) jumpToDate(state.sunTimes.sunrise);
    });
    el.jumpGoldenMorning.addEventListener('click', () => {
      if (state.sunTimes && state.sunTimes.goldenHourMorning && state.sunTimes.goldenHourMorning.start) {
        // Hop ca 25 min efter solopgang
        const t = new Date(state.sunTimes.goldenHourMorning.start.getTime() + 25 * 60000);
        jumpToDate(t);
      }
    });
    el.jumpNoon.addEventListener('click', () => {
      if (state.sunTimes && state.sunTimes.solarNoon) jumpToDate(state.sunTimes.solarNoon);
    });
    el.jumpGoldenEvening.addEventListener('click', () => {
      if (state.sunTimes && state.sunTimes.goldenHourEvening && state.sunTimes.goldenHourEvening.start) {
        jumpToDate(state.sunTimes.goldenHourEvening.start);
      }
    });
    el.jumpSunset.addEventListener('click', () => {
      if (state.sunTimes && state.sunTimes.sunset) jumpToDate(state.sunTimes.sunset);
    });
    el.jumpDusk.addEventListener('click', () => {
      if (state.sunTimes && state.sunTimes.blueHourEvening && state.sunTimes.blueHourEvening.start) {
        jumpToDate(state.sunTimes.blueHourEvening.start);
      }
    });
  }

  /**
   * Åbner / lukker søgedropdown og viser populære spots ved start
   */
  function toggleSearchDropdown() {
    const isActive = el.searchDropdown.classList.contains('active');
    if (isActive) {
      el.searchDropdown.classList.remove('active');
    } else {
      el.searchDropdown.classList.add('active');
      el.searchInput.value = '';
      el.searchInput.focus();
      performSearch('');
    }
  }

  /**
   * Udfører stedsøgning
   */
  async function performSearch(query) {
    const results = await WeatherEngine.searchLocation(query);
    renderSearchResults(results);
  }

  /**
   * Viser søgeresultater
   */
  function renderSearchResults(results) {
    el.searchResults.innerHTML = '';
    if (!results || results.length === 0) {
      el.searchResults.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-dim); text-align:center;">Ingen steder fundet</div>';
      return;
    }

    results.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'search-item';
      row.innerHTML = `
        <div>
          <div class="search-item-title">${escapeHtml(item.name)}</div>
          <div class="search-item-sub">${escapeHtml(item.sub || '')}</div>
        </div>
        <span class="search-item-tag">${escapeHtml(item.tag || 'SPOT')}</span>
      `;

      row.addEventListener('click', async () => {
        el.searchDropdown.classList.remove('active');
        state.currentLoc = {
          name: item.name,
          sub: item.sub || '',
          lat: item.lat,
          lng: item.lng,
          isGps: false,
          accuracy: null
        };

        try {
          localStorage.setItem('fotosol_last_loc', JSON.stringify(state.currentLoc));
        } catch (e) {}

        updateLocationDisplay();
        if (window.PhotoMap) {
          PhotoMap.setLocation(item.lat, item.lng, true);
        }
        recalculateSunAndShadow();
        showLoading(true, 'Henter vejr og solforhold for ' + item.name + '...');
        await updateWeatherAndForecast(true);
        showLoading(false);
      });

      el.searchResults.appendChild(row);
    });
  }

  function showLoading(show, text) {
    if (show) {
      el.loadingText.textContent = text || 'Beregner...';
      el.loadingOverlay.classList.add('active');
    } else {
      el.loadingOverlay.classList.remove('active');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // Start app når DOM er klar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
