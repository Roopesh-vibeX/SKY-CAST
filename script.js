const $ = (id) => document.getElementById(id);
const form = $("search-form");
const cityInput = $("city-input");
const searchButton = $("search-button");
const statusText = $("status");
const content = $("weather-content");
const errorBox = $("error-box");
let unit = "celsius";
let lastWeather = null;

const weatherDescriptions = {
  0:["Clear sky","☀️"],1:["Mainly clear","🌤️"],2:["Partly cloudy","⛅"],3:["Overcast","☁️"],
  45:["Fog","🌫️"],48:["Depositing rime fog","🌫️"],51:["Light drizzle","🌦️"],53:["Drizzle","🌦️"],55:["Dense drizzle","🌧️"],
  56:["Freezing drizzle","🌧️"],57:["Freezing drizzle","🌧️"],61:["Slight rain","🌦️"],63:["Moderate rain","🌧️"],65:["Heavy rain","🌧️"],
  66:["Freezing rain","🌧️"],67:["Freezing rain","🌧️"],71:["Slight snow","🌨️"],73:["Moderate snow","🌨️"],75:["Heavy snow","❄️"],
  77:["Snow grains","🌨️"],80:["Rain showers","🌦️"],81:["Rain showers","🌧️"],82:["Violent rain showers","⛈️"],
  85:["Snow showers","🌨️"],86:["Heavy snow showers","❄️"],95:["Thunderstorm","⛈️"],96:["Thunderstorm with hail","⛈️"],99:["Thunderstorm with hail","⛈️"]
};
function describe(code){return weatherDescriptions[code] || ["Weather conditions unavailable","🌡️"];}
function temp(c){return Math.round(unit === "celsius" ? c : c * 9/5 + 32) + "°";}
function windSpeed(kmh){return unit === "celsius" ? `${Math.round(kmh)} km/h` : `${Math.round(kmh/1.60934)} mph`;}
function dateFromISO(iso, options){return new Date(iso).toLocaleString(undefined, options);}
function localTimeLabel(iso){return dateFromISO(iso,{hour:"numeric"});}
function setStatus(message){statusText.textContent = message;}
function setLoading(loading){
  searchButton.disabled = loading;
  searchButton.innerHTML = loading ? "Loading…" : 'Search <span aria-hidden="true">→</span>';
  cityInput.disabled = loading;
}
function showError(message){
  content.hidden = true; errorBox.hidden = false; $("error-message").textContent = message;
}

async function fetchJSON(url) {
  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      "Unable to connect to the weather service. Check your internet connection and try again."
    );
  }

  if (!response.ok) {
    throw new Error(
      `Weather service error (${response.status}). Please try again later.`
    );
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(
      "The weather service returned an invalid response. Please try again."
    );
  }
}


async function getCity(name) {
  const normalized = name.trim().toLowerCase();

  // States use a representative city for the forecast.
  const stateCapitals = {
    "goa": "Panaji",
    "goa, india": "Panaji",
    "kerala": "Thiruvananthapuram",
    "kerala, india": "Thiruvananthapuram"
  };

  const isStateSearch =
    Object.prototype.hasOwnProperty.call(stateCapitals, normalized);

  const searchName = isStateSearch
    ? stateCapitals[normalized]
    : name.trim();

  const params = new URLSearchParams({
    name: searchName,
    count: "10",
    language: "en",
    format: "json"
  });

  // Prevent a state search from matching another country.
  if (isStateSearch || /\bIndia\b/i.test(name)) {
    params.set("countryCode", "IN");
  }

  const url = new URL(
    "https://geocoding-api.open-meteo.com/v1/search"
  );
  url.search = params;

  const data = await fetchJSON(url);
  const results = data.results || [];

  if (results.length === 0) {
    throw new Error(
      `We couldn't find "${name}". Try a city and country, such as Jaipur, India.`
    );
  }

  // For Indian searches, never silently select another country.
  const city = (isStateSearch || /\bIndia\b/i.test(name))
    ? results.find(result => result.country_code === "IN")
    : results[0];

  if (!city) {
    throw new Error(
      `We couldn't find "${name}" in India. Please check the spelling or try a nearby city.`
    );
  }

  return city;
}

async function getWeather(city){
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: city.latitude, longitude: city.longitude, timezone:"auto",
    current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
    hourly:"temperature_2m,precipitation_probability,weather_code",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max",
    forecast_days:"7"
  });
  return fetchJSON(url);
}
async function loadCity(name){
  setLoading(true); errorBox.hidden = true; setStatus("Finding location and fetching forecast…");
  try{
    const city = await getCity(name.trim());
    const weather = await getWeather(city);
    lastWeather = {city, weather};
    content.hidden = false;
    render();
    setStatus("Forecast loaded · Times shown in local time for this location");
  }catch(error){
    showError(error.message || "Something went wrong. Please try again.");
    setStatus("Weather unavailable");
  }finally{setLoading(false);}
}
function findCurrentHourIndex(times, currentTime) {
  const currentHour = currentTime.slice(0, 13);

  // First, look for an exact hour match.
  let index = times.findIndex(
    time => time.slice(0, 13) === currentHour
  );

  // If there is no match, find the next available hour.
  if (index < 0) {
    index = times.findIndex(time => time >= currentTime);
  }

  return index;
}

function render(){
  if(!lastWeather) return;
  const {city,weather:w} = lastWeather;
  const current = w.current, daily = w.daily, hourly = w.hourly;
  const [description,icon] = describe(current.weather_code);
  $("place-name").textContent = [city.name,city.admin1,city.country].filter((v,i,a)=>v && a.indexOf(v)===i).join(", ");
  $("condition").textContent = description;
  $("weather-icon").textContent = icon;
  $("temperature").textContent = temp(current.temperature_2m);
  $("feels-like").textContent = temp(current.apparent_temperature);
  $("today-high").textContent = temp(daily.temperature_2m_max[0]);
  $("today-low").textContent = temp(daily.temperature_2m_min[0]);
  $("humidity").textContent = `${current.relative_humidity_2m}%`;
  $("wind").textContent = windSpeed(current.wind_speed_10m);
  const currentHourIndex = hourly.time.findIndex(t => t.slice(0,13) === current.time.slice(0,13));
  const nextHourIndex = Math.max(0,currentHourIndex);
  $("rain").textContent = `${hourly.precipitation_probability[nextHourIndex] ?? "—"}%`;
  $("uv").textContent = daily.uv_index_max[0] == null ? "—" : Number(daily.uv_index_max[0]).toFixed(1);
  $("local-date").textContent = dateFromISO(current.time,{weekday:"long",month:"long",day:"numeric"}).toUpperCase();
  $("updated-at").textContent = `Weather data time: ${dateFromISO(current.time,{hour:"numeric",minute:"2-digit"})} · ${w.timezone || "Local time"}`;
  renderHourly(hourly,current.time);
  renderDaily(daily);
}
function renderHourly(hourly,currentTime){
  const container = $("hourly-list"); container.replaceChildren();
  let start = hourly.time.findIndex(t => t.slice(0,13) === currentTime.slice(0,13));
  if(start < 0) start = 0;
  for(let i=start;i<Math.min(start+24,hourly.time.length);i++){
    const [label,icon] = describe(hourly.weather_code[i]);
    const card = document.createElement("article"); card.className = "hour";
    card.innerHTML = `<div class="hour-time">${i===start?"Now":localTimeLabel(hourly.time[i])}</div><div class="hour-icon" title="${label}">${icon}</div><div class="hour-temp">${temp(hourly.temperature_2m[i])}</div><div class="hour-rain">💧 ${hourly.precipitation_probability[i] ?? 0}%</div>`;
    container.append(card);
  }
}
function renderDaily(daily){
  const container = $("daily-list"); container.replaceChildren();
  daily.time.forEach((date,i)=>{
    const [label,icon] = describe(daily.weather_code[i]);
    const day = new Date(`${date}T12:00:00`);
    const dayName = i===0 ? "Today" : day.toLocaleDateString(undefined,{weekday:"short"});
    const row = document.createElement("div"); row.className = "day-row";
    row.innerHTML = `<div class="day-name">${dayName}</div><div class="day-weather"><span title="${label}">${icon}</span><span>${label}</span></div><div class="day-rain">💧 ${daily.precipitation_probability_max[i] ?? 0}%</div><div class="day-temps"><strong>${temp(daily.temperature_2m_max[i])}</strong>${temp(daily.temperature_2m_min[i])}</div>`;
    container.append(row);
  });
}
form.addEventListener("submit",event=>{event.preventDefault();const city=cityInput.value.trim();if(city)loadCity(city);});
document.querySelectorAll(".unit").forEach(button=>{
  button.addEventListener("click",()=>{
    unit=button.dataset.unit;
    document.querySelectorAll(".unit").forEach(b=>{const active=b===button;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    render();
  });
});
loadCity("Jaipur");
