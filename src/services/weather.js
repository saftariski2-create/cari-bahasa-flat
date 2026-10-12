const { fetchJson } = require('../lib/http');
const cache = require('../lib/cache');

const WEATHER_CODES = {
  0: { label: 'Cerah', icon: '☀️' },
  1: { label: 'Cerah berawan', icon: '🌤️' },
  2: { label: 'Berawan', icon: '⛅' },
  3: { label: 'Mendung', icon: '☁️' },
  45: { label: 'Berkabut', icon: '🌫️' },
  48: { label: 'Kabut tebal', icon: '🌫️' },
  51: { label: 'Gerimis ringan', icon: '🌦️' },
  53: { label: 'Gerimis', icon: '🌦️' },
  55: { label: 'Gerimis lebat', icon: '🌧️' },
  56: { label: 'Gerimis beku', icon: '🌨️' },
  57: { label: 'Gerimis beku lebat', icon: '🌨️' },
  61: { label: 'Hujan ringan', icon: '🌦️' },
  63: { label: 'Hujan sedang', icon: '🌧️' },
  65: { label: 'Hujan lebat', icon: '🌧️' },
  66: { label: 'Hujan beku', icon: '🌨️' },
  67: { label: 'Hujan beku lebat', icon: '🌨️' },
  71: { label: 'Salju ringan', icon: '🌨️' },
  73: { label: 'Salju sedang', icon: '❄️' },
  75: { label: 'Salju lebat', icon: '❄️' },
  77: { label: 'Butiran salju', icon: '❄️' },
  80: { label: 'Hujan rintik', icon: '🌦️' },
  81: { label: 'Hujan rintik lebat', icon: '🌧️' },
  82: { label: 'Hujan sangat lebat', icon: '⛈️' },
  85: { label: 'Salju rintik', icon: '🌨️' },
  86: { label: 'Salju rintik lebat', icon: '❄️' },
  95: { label: 'Badai petir', icon: '⛈️' },
  96: { label: 'Badai petir + hujan es', icon: '⛈️' },
  99: { label: 'Badai petir hebat', icon: '⛈️' }
};

const NOISE = /\b(cuaca|weather|prakiraan|ramalan|forecast|hari ini|besok|hari|di|kota|kabupaten|untuk|suhu|udara|sekarang|saat ini|gimana|bagaimana|berapa)\b/g;

function extractCity(query) {
  return String(query || '')
    .toLowerCase()
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function hariIndonesia(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? isoDate : HARI[d.getDay()];
}

async function geocode(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=id&format=json`;
  const data = await fetchJson(url, { timeout: 8000 });
  return (data.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    countryCode: r.country_code,
    admin1: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    population: r.population
  }));
}

async function getWeather(query) {
  const cityQuery = extractCity(query);
  const target = cityQuery || 'Jakarta';
  const key = `weather:${target.toLowerCase()}`;

  return cache.wrap(key, 300, async () => {
    const places = await geocode(target);
    if (!places.length) {
      return { error: `Kota "${target}" tidak ditemukan. Coba nama kota lain, misalnya: Jakarta, Bandung, Tokyo.`, query: target };
    }
    const place = places.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,surface_pressure` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max` +
      `&hourly=temperature_2m,weather_code&forecast_days=5&timezone=auto`;
    const data = await fetchJson(url, { timeout: 9000 });

    const current = data.current || {};
    const code = WEATHER_CODES[current.weather_code] || { label: 'Tidak diketahui', icon: '🌡️' };
    const daily = data.daily || {};

    // Ambil 12 jam ke depan mulai jam sekarang
    const hourly = [];
    const times = data.hourly?.time || [];
    const temps = data.hourly?.temperature_2m || [];
    const codes = data.hourly?.weather_code || [];
    const nowHour = new Date(current.time || Date.now()).getHours();
    for (let i = 0; i < times.length && hourly.length < 12; i++) {
      const h = new Date(times[i]);
      if (h.getHours() === nowHour) {
        for (let j = i; j < times.length && hourly.length < 12; j++) {
          hourly.push({
            time: times[j].slice(11, 16),
            temperature: temps[j],
            icon: (WEATHER_CODES[codes[j]] || {}).icon || '🌡️'
          });
        }
        break;
      }
    }

    const forecast = (daily.time || []).map((date, i) => ({
      date,
      day: hariIndonesia(date),
      code: daily.weather_code?.[i],
      label: (WEATHER_CODES[daily.weather_code?.[i]] || {}).label || '-',
      icon: (WEATHER_CODES[daily.weather_code?.[i]] || {}).icon || '🌡️',
      max: daily.temperature_2m_max?.[i],
      min: daily.temperature_2m_min?.[i],
      precipitation: daily.precipitation_sum?.[i],
      uv: daily.uv_index_max?.[i]
    }));

    return {
      source: 'Open-Meteo',
      query: target,
      place: {
        name: place.name,
        region: place.admin1,
        country: place.country,
        countryCode: place.countryCode,
        timezone: place.timezone,
        latitude: place.latitude,
        longitude: place.longitude
      },
      alternatives: places.slice(1, 4).map((p) => `${p.name}${p.admin1 ? ', ' + p.admin1 : ''}, ${p.country}`),
      current: {
        temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        precipitation: current.precipitation,
        cloudCover: current.cloud_cover,
        pressure: current.surface_pressure,
        isDay: current.is_day === 1,
        code: current.weather_code,
        condition: code.label,
        icon: code.icon,
        time: current.time
      },
      hourly,
      forecast,
      updatedAt: new Date().toISOString()
    };
  });
}

module.exports = { getWeather, extractCity, WEATHER_CODES };
