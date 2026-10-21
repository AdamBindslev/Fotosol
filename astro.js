/**
 * astro.js - Astronomisk beregningsmotor for FotoSol
 * Beregner solens nøjagtige azimut, højde, skyggelængde, kompasretning og fototider.
 * Kører 100% offline i browseren uden eksterne biblioteker.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AstroCalc = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PI = Math.PI,
    sin = Math.sin,
    cos = Math.cos,
    tan = Math.tan,
    asin = Math.asin,
    atan2 = Math.atan2,
    acos = Math.acos,
    rad = PI / 180,
    deg = 180 / PI;

  var dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

  function toJulian(date) {
    return date.valueOf() / dayMs - 0.5 + J1970;
  }
  function fromJulian(j) {
    return new Date((j + 0.5 - J1970) * dayMs);
  }
  function toDays(date) {
    return toJulian(date) - J2000;
  }

  // Jordens skråning (obliquity)
  var e = rad * 23.4397;

  function safeAcos(x) {
    return acos(Math.max(-1, Math.min(1, x)));
  }
  function safeAsin(x) {
    return asin(Math.max(-1, Math.min(1, x)));
  }

  function rightAscension(l, b) {
    return atan2(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
  }
  function declination(l, b) {
    return safeAsin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
  }
  function azimuth(H, phi, dec) {
    return atan2(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi));
  }
  function altitude(H, phi, dec) {
    return safeAsin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
  }
  function siderealTime(d, lw) {
    return rad * (280.16 + 360.9856235 * d) - lw;
  }

  function solarMeanAnomaly(d) {
    return rad * (357.5291 + 0.98560028 * d);
  }
  function eclipticLongitude(M) {
    var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)),
      P = rad * 102.9372;
    return M + C + P + PI;
  }

  function sunCoords(d) {
    var M = solarMeanAnomaly(d),
      L = eclipticLongitude(M);
    return {
      dec: declination(L, 0),
      ra: rightAscension(L, 0)
    };
  }

  var J0 = 0.0009;

  function julianCycle(d, lw) {
    return Math.round(d - J0 - lw / (2 * PI));
  }
  function approxTransit(Ht, lw, n) {
    return J0 + (Ht + lw) / (2 * PI) + n;
  }
  function solarTransitJ(ds, M, L) {
    return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
  }
  function hourAngle(h, phi, dec) {
    var val = (sin(h) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec));
    if (val > 1.0001 || val < -1.0001) return NaN;
    return safeAcos(val);
  }

  // Vinkeldefinitioner for fotografiske lysfaser
  var angleDefs = [
    [-0.833 * rad, 'sunrise', 'sunset'],                 // Standard geometrisk solopgang/nedgang
    [-0.3 * rad, 'sunriseEnd', 'sunsetStart'],           // Solens øvre rand
    [-4 * rad, 'blueHourDawnEnd', 'blueHourDuskStart'],  // Blå time grænse
    [-6 * rad, 'civilDawn', 'civilDusk'],                // Borgerligt tusmørke
    [-12 * rad, 'nauticalDawn', 'nauticalDusk'],         // Nautisk tusmørke
    [-18 * rad, 'astronomicalDawn', 'astronomicalDusk'], // Astronomisk tusmørke (stjerneklart mørke)
    [6 * rad, 'goldenHourDawnEnd', 'goldenHourDuskStart']// Gylden time grænse opad (+6°)
  ];

  /**
   * Beregner alle solens nøgletider for en given dato og lokation
   */
  function getSunTimes(date, lat, lng) {
    var lw = rad * -lng,
      phi = rad * lat,
      d = toDays(date),
      n = julianCycle(d, lw),
      ds = approxTransit(0, lw, n),
      M = solarMeanAnomaly(ds),
      L = eclipticLongitude(M),
      dec = declination(L, 0),
      Jnoon = solarTransitJ(ds, M, L),
      i, len, time, h0, Jset, Jrise;

    var result = {
      solarNoon: fromJulian(Jnoon),
      nadir: fromJulian(Jnoon - 0.5)
    };

    for (i = 0, len = angleDefs.length; i < len; i += 1) {
      time = angleDefs[i];
      h0 = time[0];

      var w0 = hourAngle(h0, phi, dec);
      if (isNaN(w0)) {
        result[time[1]] = null;
        result[time[2]] = null;
        continue;
      }

      var a = approxTransit(w0, lw, n);
      Jset = solarTransitJ(a, M, L);
      Jrise = Jnoon - (Jset - Jnoon);

      result[time[1]] = fromJulian(Jrise);
      result[time[2]] = fromJulian(Jset);
    }

    // Grupperede fotofaser
    result.goldenHourMorning = {
      start: result.sunrise || result.civilDawn,
      end: result.goldenHourDawnEnd
    };
    result.goldenHourEvening = {
      start: result.goldenHourDuskStart,
      end: result.sunset || result.civilDusk
    };
    result.blueHourMorning = {
      start: result.civilDawn,
      end: result.blueHourDawnEnd || result.sunrise
    };
    result.blueHourEvening = {
      start: result.blueHourDuskStart || result.sunset,
      end: result.civilDusk
    };
    result.nightSky = {
      start: result.astronomicalDusk,
      end: result.astronomicalDawn
    };

    // Solhøjde ved solmiddag (maksimal højde på dagen)
    if (result.solarNoon) {
      var maxPos = getSunPosition(result.solarNoon, lat, lng);
      result.maxAltitude = maxPos.altitude;
    } else {
      result.maxAltitude = null;
    }

    return result;
  }

  /**
   * Beregner solens azimut og højde (elevation) for et præcist tidspunkt
   * Returnerer:
   * - azimuth: 0° - 360° (0° = Nord, 90° = Øst, 180° = Syd, 270° = Vest)
   * - altitude: -90° til +90° over horisonten
   */
  function getSunPosition(date, lat, lng) {
    var lw = rad * -lng,
      phi = rad * lat,
      d = toDays(date),
      c = sunCoords(d),
      H = siderealTime(d, lw) - c.ra;

    var az = azimuth(H, phi, c.dec);
    var alt = altitude(H, phi, c.dec);

    var compassAz = (az * deg + 180) % 360;
    if (compassAz < 0) compassAz += 360;

    return {
      azimuth: compassAz,
      altitude: alt * deg
    };
  }

  /**
   * Beregner skyggen for en given solplacering og genstandshøjde:
   * Formel: Skyggelængde L = H / tan(altitude)
   * Skyggeretning = (azimuth + 180°) % 360°
   */
  function calculateShadow(altitudeDeg, azimuthDeg, objectHeightMeters) {
    var height = (typeof objectHeightMeters === 'number' && objectHeightMeters > 0) ? objectHeightMeters : 1.80;
    var shadowAzimuth = (azimuthDeg + 180) % 360;
    var compassDir = getCompassDirection(shadowAzimuth);

    // Hvis solen er på eller under horisonten
    if (altitudeDeg <= 0) {
      return {
        hasDirectShadow: false,
        shadowLength: Infinity,
        shadowRatio: Infinity,
        shadowAzimuth: shadowAzimuth,
        shadowCompass: compassDir,
        objectHeight: height,
        lightPhase: getLightPhase(altitudeDeg),
        description: 'Solen er under horisonten. Diffust tusmørke – ingen direkte skygger.',
        cameraTip: 'Brug stativ og lange lukkertider. Blødt ambient lys uden hårde kontraster.'
      };
    }

    var altRad = altitudeDeg * rad;
    var ratio = 1 / tan(altRad);
    var length = height * ratio;

    var phase = getLightPhase(altitudeDeg);
    var qualityDesc = '';
    var cameraTip = '';

    if (altitudeDeg < 3) {
      qualityDesc = 'Ekstremt lange og bløde skygger med diffus kant.';
      cameraTip = 'Fantastisk til modlysbilleder (rim light) og dramatisk relief i jorden.';
    } else if (altitudeDeg < 6) {
      qualityDesc = 'Klassisk gylden time. Skulpturelle, varme skygger.';
      cameraTip = 'Udnyt skyggerne som stærke ledende linjer. Varm farvetemperatur (3000K-3500K).';
    } else if (altitudeDeg < 15) {
      qualityDesc = 'Lav morgensol / sensommereftermiddag. Fremragende struktur og dybde.';
      cameraTip = 'Flot kontrast i arkitektur og landskaber. Skyggen er ca. 4–9× genstandens højde.';
    } else if (altitudeDeg < 30) {
      qualityDesc = 'Mellemhøj sol. Behagelig 3D-modellering af motiver.';
      cameraTip = 'Gode arbejdsforhold. Skyggelængde er 1.7–3.7× genstandens højde.';
    } else if (altitudeDeg < 45) {
      qualityDesc = 'Moderat høj sol. Skygger begynder at blive mere kompakte end genstanden.';
      cameraTip = 'Hold øje med skyggernes hårdhed. Overvej polarisationsfilter for at dæmpe reflekser.';
    } else {
      qualityDesc = 'Høj sol. Meget korte og hårde skygger direkte under motivet.';
      cameraTip = 'Pas på hårde øjenskygger i portrætter. Brug udfyldningslys eller modlysblænde.';
    }

    return {
      hasDirectShadow: true,
      shadowLength: length,
      shadowRatio: ratio,
      shadowAzimuth: shadowAzimuth,
      shadowCompass: compassDir,
      objectHeight: height,
      lightPhase: phase,
      description: qualityDesc,
      cameraTip: cameraTip
    };
  }

  /**
   * Returnerer navn og kategori for den fotografiske lysfase
   */
  function getLightPhase(altitudeDeg) {
    if (altitudeDeg < -18) {
      return { id: 'night', name: 'Astronomisk nat', badge: 'MØRKE', color: '#6366f1' };
    } else if (altitudeDeg < -12) {
      return { id: 'astro-twilight', name: 'Astronomisk daggry/skumring', badge: 'ASTRO', color: '#818cf8' };
    } else if (altitudeDeg < -6) {
      return { id: 'nautical', name: 'Nautisk tusmørke', badge: 'TUSMØRKE', color: '#38bdf8' };
    } else if (altitudeDeg < -4) {
      return { id: 'blue-hour', name: 'Den Blå Time', badge: 'BLÅ TIME', color: '#0ea5e9' };
    } else if (altitudeDeg < 0) {
      return { id: 'twilight-edge', name: 'Overgang til Gylden Time', badge: 'DAGGRI/SKUMRING', color: '#f59e0b' };
    } else if (altitudeDeg < 6) {
      return { id: 'golden-hour', name: 'Den Gyldne Time', badge: 'GYLDEN TIME', color: '#f59e0b' };
    } else if (altitudeDeg < 15) {
      return { id: 'low-sun', name: 'Lav sol (tekstur-lys)', badge: 'LAV SOL', color: '#fbbf24' };
    } else if (altitudeDeg < 30) {
      return { id: 'mid-sun', name: 'Mellem sol', badge: 'MODERAT SOL', color: '#fde047' };
    } else {
      return { id: 'high-sun', name: 'Høj sol', badge: 'HØJ SOL', color: '#ffffff' };
    }
  }

  /**
   * Estimerer sollysets farvetemperatur i Kelvin baseret på solhøjde
   */
  function getEstimatedKelvin(altitudeDeg) {
    if (altitudeDeg <= -6) return { kelvin: 12000, label: 'Kølig natsort / stjernehimmel' };
    if (altitudeDeg <= -2) return { kelvin: 9000, label: 'Kølig dybblå (blå time)' };
    if (altitudeDeg <= 0) return { kelvin: 2200, label: 'Dyb rav / rødglødende horisont' };
    if (altitudeDeg <= 3) return { kelvin: 2800, label: 'Varm rødgylden sol' };
    if (altitudeDeg <= 6) return { kelvin: 3300, label: 'Klassisk gyldent lys (golden hour)' };
    if (altitudeDeg <= 12) return { kelvin: 4000, label: 'Varm dagslys' };
    if (altitudeDeg <= 25) return { kelvin: 4800, label: 'Naturligt dagslys' };
    return { kelvin: 5500, label: 'Standard dagslys (5500K)' };
  }

  /**
   * Hjælper til kompasretning i tekst (f.eks. N, NØ, Ø, SØ...)
   */
  function getCompassDirection(azimuthDegrees) {
    var directions = [
      'N', 'NNØ', 'NØ', 'ØNØ',
      'Ø', 'ØSØ', 'SØ', 'SSØ',
      'S', 'SSV', 'SV', 'VSV',
      'V', 'VNV', 'NV', 'NNV'
    ];
    var norm = ((azimuthDegrees % 360) + 360) % 360;
    var val = Math.floor((norm / 22.5) + 0.5);
    return directions[val % 16];
  }

  /**
   * Fuld dansk tekst for kompasretning
   */
  function getCompassDirectionFullName(azimuthDegrees) {
    var directions = [
      'Nord', 'Nord-nordøst', 'Nordøst', 'Øst-nordøst',
      'Øst', 'Øst-sydøst', 'Sydøst', 'Syd-sydøst',
      'Syd', 'Syd-sydvest', 'Sydvest', 'Vest-sydvest',
      'Vest', 'Vest-nordvest', 'Nordvest', 'Nord-nordvest'
    ];
    var norm = ((azimuthDegrees % 360) + 360) % 360;
    var val = Math.floor((norm / 22.5) + 0.5);
    return directions[val % 16];
  }

  function formatTime(date) {
    if (!date || isNaN(date.getTime())) return '--:--';
    var h = date.getHours().toString().padStart(2, '0');
    var m = date.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  }

  function formatDegrees(degVal) {
    if (degVal === null || degVal === undefined || isNaN(degVal)) return '--°';
    var sign = degVal >= 0 ? '+' : '';
    return sign + degVal.toFixed(1) + '°';
  }

  return {
    getSunTimes: getSunTimes,
    getSunPosition: getSunPosition,
    calculateShadow: calculateShadow,
    getLightPhase: getLightPhase,
    getEstimatedKelvin: getEstimatedKelvin,
    getCompassDirection: getCompassDirection,
    getCompassDirectionFullName: getCompassDirectionFullName,
    formatTime: formatTime,
    formatDegrees: formatDegrees
  };
});
