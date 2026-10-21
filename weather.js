/**
 * weather.js - Henter vejr- og skydækkedata for FotoSol samt stedsøgning & geocoding
 * Indeholder offline-cache og fotospot-katalog.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WeatherEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CACHE_PREFIX = 'fotosol_weather_cache_v1_';

  // Udvalgte populære danske fotospots til lynhurtigt valg
  var POPULAR_SPOTS = [
    { name: 'København', sub: 'Nyhavn & Havnefronten', lat: 55.6761, lng: 12.5683, tag: 'By & Vand' },
    { name: 'Møns Klint', sub: 'Kridtskrænter mod Øst (Solopgang)', lat: 54.9642, lng: 12.5533, tag: 'Dramatisk kyst' },
    { name: 'Rubjerg Knude Fyr', sub: 'Vandreklit mod Vest (Solnedgang)', lat: 57.4491, lng: 9.7744, tag: 'Sand & Solnedgang' },
    { name: 'Grenen, Skagen', sub: 'To have der mødes', lat: 57.7431, lng: 10.6305, tag: 'Nordspidsen' },
    { name: 'Silkeborg Søerne', sub: 'Skov & Morgendis', lat: 56.1685, lng: 9.5532, tag: 'Søer & Tåge' },
    { name: 'Dyrehaven', sub: 'Eremitagesletten & Gamle Ege', lat: 55.7892, lng: 12.5694, tag: 'Natur & Dyr' },
    { name: 'Stevns Klint', sub: 'Højerup Gamle Kirke (UNESCO)', lat: 55.2794, lng: 12.4431, tag: 'Klippekyst' },
    { name: 'Bornholm', sub: 'Hammerknuden & Klipper', lat: 55.2833, lng: 14.7722, tag: 'Granitkyst' },
    { name: 'Rømø Strand', sub: 'Vadehavet & Kæmpe vidder', lat: 55.1512, lng: 8.5481, tag: 'Vadehav' },
    { name: 'Himmelbjerget', sub: 'Julsø udsigtspunkt', lat: 56.1033, lng: 9.6844, tag: 'Indlandshøjder' }
  ];

  /**
   * Henter vejrdata for koordinater (med fallback til cache ved offline)
   */
  async function fetchForecast(lat, lng, forceRefresh) {
    var cacheKey = CACHE_PREFIX + lat.toFixed(4) + '_' + lng.toFixed(4);
    var cached = null;
    try {
      var raw = localStorage.getItem(cacheKey);
      if (raw) {
        cached = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Kunne ikke læse cache:', e);
    }

    if (navigator.onLine && (!cached || forceRefresh || Date.now() - cached.timestamp > 30 * 60 * 1000)) {
      try {
        var url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lng);
        url.searchParams.set('hourly', [
          'temperature_2m',
          'relative_humidity_2m',
          'cloud_cover',
          'cloud_cover_low',
          'cloud_cover_mid',
          'cloud_cover_high',
          'direct_normal_irradiance',
          'visibility',
          'wind_speed_10m'
        ].join(','));
        url.searchParams.set('daily', [
          'weather_code',
          'temperature_2m_max',
          'temperature_2m_min',
          'sunrise',
          'sunset',
          'uv_index_max'
        ].join(','));
        url.searchParams.set('timezone', 'auto');
        url.searchParams.set('forecast_days', '7');

        var res = await fetch(url.toString());
        if (!res.ok) throw new Error('Vejr-server svarede med status ' + res.status);
        var data = await res.json();

        var payload = {
          timestamp: Date.now(),
          data: data,
          lat: lat,
          lng: lng
        };
        try {
          localStorage.setItem(cacheKey, JSON.stringify(payload));
        } catch (err) {
          console.warn('Cachefejl:', err);
        }

        return {
          forecast: data,
          isCached: false,
          updatedAt: new Date()
        };
      } catch (err) {
        console.warn('Netværksfejl ved hentning af vejr, prøver cache:', err);
        if (cached) {
          return {
            forecast: cached.data,
            isCached: true,
            updatedAt: new Date(cached.timestamp),
            offlineReason: 'Netværksfejl - viser gemt vejrudsigt'
          };
        }
        return {
          forecast: null,
          isCached: false,
          updatedAt: new Date()
        };
      }
    }

    if (cached) {
      return {
        forecast: cached.data,
        isCached: true,
        updatedAt: new Date(cached.timestamp)
      };
    }

    return {
      forecast: null,
      isCached: false,
      updatedAt: new Date()
    };
  }

  /**
   * Beregner skygge-diffusion ud fra skydække for et specifikt tidspunkt
   */
  function evaluateShadowDiffusion(forecastData, targetDate) {
    if (!forecastData || !forecastData.hourly || !forecastData.hourly.time) {
      return {
        cloudCover: null,
        quality: 'Ukendt vejr',
        description: 'Vejrdata ikke tilgængelig – skygge beregnes som ideel klar himmel.',
        diffusionFactor: 1.0
      };
    }

    var hourlyTimes = forecastData.hourly.time;
    var targetIso = targetDate.toISOString().substring(0, 13); // f.eks. '2026-10-21T08'
    
    // Find nærmeste time
    var targetMs = targetDate.getTime();
    var bestIdx = 0;
    var minDiff = Infinity;

    for (var i = 0; i < hourlyTimes.length; i++) {
      var hDate = new Date(hourlyTimes[i]);
      var diff = Math.abs(hDate.getTime() - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = i;
      }
    }

    var clouds = forecastData.hourly.cloud_cover ? forecastData.hourly.cloud_cover[bestIdx] : 0;
    var temp = forecastData.hourly.temperature_2m ? forecastData.hourly.temperature_2m[bestIdx] : null;

    if (clouds <= 20) {
      return {
        cloudCover: clouds,
        temp: temp,
        quality: 'Skarpt lys',
        badge: 'KNIVSKARP',
        badgeClass: 'badge-sharp',
        description: 'Klar himmel (' + clouds + '% skyer). Hårde, mørke skygger med skarpe kanter.',
        diffusionFactor: 1.0
      };
    } else if (clouds <= 65) {
      return {
        cloudCover: clouds,
        temp: temp,
        quality: 'Filtreret sol',
        badge: 'MODERAT',
        badgeClass: 'badge-medium',
        description: 'Delvist overskyet (' + clouds + '% skyer). Bløde overgange og behagelig kontrast.',
        diffusionFactor: 0.65
      };
    } else if (clouds <= 85) {
      return {
        cloudCover: clouds,
        temp: temp,
        quality: 'Svag skygge',
        badge: 'DIFFUS',
        badgeClass: 'badge-diffuse',
        description: 'Tæt skydække (' + clouds + '% skyer). Svage, udviskede skyggekonturer.',
        diffusionFactor: 0.3
      };
    } else {
      return {
        cloudCover: clouds,
        temp: temp,
        quality: 'Overskyet',
        badge: 'INGEN HÅRD SKYGGE',
        badgeClass: 'badge-none',
        description: 'Fuldstændigt overskyet (' + clouds + '% skyer). Diffust himmellys uden direkte skygge.',
        diffusionFactor: 0.05
      };
    }
  }

  /**
   * Søg efter byer eller steder med Open-Meteo Geocoding
   */
  async function searchLocation(query) {
    if (!query || query.trim().length < 2) {
      return POPULAR_SPOTS;
    }

    var trimmed = query.trim().toLowerCase();
    // Først søg i vores populære fotospots for øjeblikkeligt offline svar
    var localMatches = POPULAR_SPOTS.filter(function (spot) {
      return spot.name.toLowerCase().includes(trimmed) ||
             spot.sub.toLowerCase().includes(trimmed) ||
             (spot.tag && spot.tag.toLowerCase().includes(trimmed));
    });

    if (!navigator.onLine) {
      return localMatches;
    }

    try {
      var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(query.trim()) + '&count=8&language=da&format=json';
      var res = await fetch(url);
      if (!res.ok) return localMatches;
      var data = await res.json();
      if (!data.results || data.results.length === 0) return localMatches;

      var apiResults = data.results.map(function (item) {
        var subParts = [];
        if (item.admin1 && item.admin1 !== item.name) subParts.push(item.admin1);
        if (item.country) subParts.push(item.country);

        return {
          name: item.name,
          sub: subParts.join(', '),
          lat: item.latitude,
          lng: item.longitude,
          tag: item.country_code ? item.country_code.toUpperCase() : 'BY'
        };
      });

      // Kombiner med eventuelle lokale matches først
      return localMatches.concat(apiResults);
    } catch (e) {
      console.warn('Geocoding fejl, bruger lokale matches:', e);
      return localMatches;
    }
  }

  /**
   * Reverse Geocoding (slår bynavn op ud fra koordinater)
   */
  async function reverseGeocode(lat, lng) {
    if (!navigator.onLine) {
      return { name: 'Valgt position', sub: lat.toFixed(3) + '°N, ' + lng.toFixed(3) + '°Ø' };
    }

    try {
      var bdcUrl = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
        encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lng) + '&localityLanguage=da';
      var res = await fetch(bdcUrl);
      if (res.ok) {
        var data = await res.json();
        var loc = data.locality || data.city || '';
        var sub = data.principalSubdivision || data.countryName || '';
        if (loc) {
          return {
            name: loc,
            sub: sub && sub !== loc ? sub : (data.countryName || '')
          };
        }
      }
    } catch (e) {
      console.warn('BigDataCloud reverse geocode fejl:', e);
    }

    try {
      var nomUrl = 'https://nominatim.openstreetmap.org/reverse?lat=' +
        encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng) + '&format=json&accept-language=da';
      var nomRes = await fetch(nomUrl);
      if (nomRes.ok) {
        var nomData = await nomRes.json();
        var addr = nomData.address || {};
        var localName = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city || addr.municipality || 'Valgt position';
        var county = addr.city || addr.municipality || addr.state || '';
        return {
          name: localName,
          sub: county !== localName ? county : ''
        };
      }
    } catch (e) {
      console.warn('Nominatim reverse geocode fejl:', e);
    }

    return {
      name: 'Koordinat',
      sub: lat.toFixed(3) + '°N, ' + lng.toFixed(3) + '°Ø'
    };
  }

  return {
    POPULAR_SPOTS: POPULAR_SPOTS,
    fetchForecast: fetchForecast,
    evaluateShadowDiffusion: evaluateShadowDiffusion,
    searchLocation: searchLocation,
    reverseGeocode: reverseGeocode
  };
});
