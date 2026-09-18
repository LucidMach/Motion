/**
 * NOAA Solar Calculation Engine
 * Implementation based on NOAA ESRL Astronomical Algorithms (Jean Meeus).
 * Computes exact sunrise, sunset, civil twilight (dawn/dusk), solar noon,
 * sun azimuth, polar angle, and elevation for any coordinates and date.
 */

export interface SolarTimes {
  sunriseMinutes: number; // minutes from local midnight (0..1440)
  sunsetMinutes: number;
  dawnMinutes: number; // Civil twilight begin
  duskMinutes: number; // Civil twilight end
  solarNoonMinutes: number;
  isPolarNight: boolean;
  isMidnightSun: boolean;
}

export interface SolarPosition {
  azimuth: number; // 0..360° clockwise from True North
  elevation: number; // -90..90° above horizon
  polar: number; // 0..90° from zenith (for Mapbox 3D lighting)
  isNight: boolean;
  shadowDirectionAngle: number; // angle shadows point towards (azimuth + 180°)
}

const deg2rad = (deg: number) => (deg * Math.PI) / 180.0;
const rad2deg = (rad: number) => (rad * 180.0) / Math.PI;

function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function normalizeMinutes(mins: number): number {
  return ((mins % 1440) + 1440) % 1440;
}

/**
 * Computes Julian Day from a standard JavaScript Date.
 */
export function getJulianDay(date: Date): number {
  return date.getTime() / 86400000.0 + 2440587.5;
}

/**
 * Calculates solar geometry parameters for a given date.
 */
function getSolarGeometry(date: Date) {
  const jd = getJulianDay(date);
  const t = (jd - 2451545.0) / 36525.0; // Julian Century

  // Geometric mean longitude of the sun (degrees)
  const l0 = normalizeDegrees(280.46646 + t * (36000.76983 + 0.0003032 * t));

  // Geometric mean anomaly of the sun (degrees)
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const mRad = deg2rad(m);

  // Eccentricity of Earth's orbit
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  // Sun's equation of the center (degrees)
  const c =
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289;

  // True longitude of the sun (degrees)
  const trueLong = l0 + c;

  // Apparent longitude of the sun (degrees)
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(deg2rad(omega));

  // Mean obliquity of the ecliptic (degrees)
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const eps0 = 23.0 + (26.0 + seconds / 60.0) / 60.0;

  // Corrected obliquity (degrees)
  const eps = eps0 + 0.00256 * Math.cos(deg2rad(omega));
  const epsRad = deg2rad(eps);
  const lambdaRad = deg2rad(lambda);

  // Sun's declination (degrees)
  const sinDelta = Math.sin(epsRad) * Math.sin(lambdaRad);
  const delta = rad2deg(Math.asin(sinDelta));

  // Equation of time (minutes)
  const y = Math.tan(epsRad / 2.0) ** 2;
  const l0Rad = deg2rad(l0);
  const eqTime =
    4.0 *
    rad2deg(
      y * Math.sin(2.0 * l0Rad) -
        2.0 * e * Math.sin(mRad) +
        4.0 * e * y * Math.sin(mRad) * Math.cos(2.0 * l0Rad) -
        0.5 * y * y * Math.sin(4.0 * l0Rad) -
        1.25 * e * e * Math.sin(2.0 * mRad)
    );

  return { delta, eqTime, eps };
}

/**
 * Calculates exact astronomical sunrise, sunset, dawn, and dusk times
 * for any latitude, longitude, and date using NOAA equations.
 */
export function calculateNOAASolarTimes(
  lat: number,
  lng: number,
  date: Date = new Date()
): SolarTimes {
  const { delta, eqTime } = getSolarGeometry(date);
  const latRad = deg2rad(lat);
  const deltaRad = deg2rad(delta);

  // Local timezone offset in minutes (e.g. Melbourne UTC+10 is +600)
  const tzOffsetMinutes = -date.getTimezoneOffset();

  // Solar noon in minutes from local midnight
  const solarNoonMinutes = normalizeMinutes(720 - 4.0 * lng - eqTime + tzOffsetMinutes);

  // Official sunrise/sunset zenith = 90.8333° (90°50' for refraction & diameter)
  const cosZenithOfficial = Math.cos(deg2rad(90.8333));
  // Civil twilight zenith = 96.0°
  const cosZenithCivil = Math.cos(deg2rad(96.0));

  const denominator = Math.cos(latRad) * Math.cos(deltaRad);

  let isPolarNight = false;
  let isMidnightSun = false;

  // 1. Official Sunrise / Sunset
  let haOfficial = 0;
  if (denominator !== 0) {
    const cosHA = (cosZenithOfficial - Math.sin(latRad) * Math.sin(deltaRad)) / denominator;
    if (cosHA > 1.0) {
      isPolarNight = true;
      haOfficial = 0;
    } else if (cosHA < -1.0) {
      isMidnightSun = true;
      haOfficial = 180;
    } else {
      haOfficial = rad2deg(Math.acos(cosHA));
    }
  }

  // 2. Civil Twilight (Dawn / Dusk)
  let haCivil = haOfficial;
  if (denominator !== 0) {
    const cosHACivil = (cosZenithCivil - Math.sin(latRad) * Math.sin(deltaRad)) / denominator;
    if (cosHACivil <= 1.0 && cosHACivil >= -1.0) {
      haCivil = rad2deg(Math.acos(cosHACivil));
    } else if (cosHACivil > 1.0) {
      haCivil = 0;
    } else {
      haCivil = 180;
    }
  }

  const sunriseMinutes = normalizeMinutes(solarNoonMinutes - haOfficial * 4.0);
  const sunsetMinutes = normalizeMinutes(solarNoonMinutes + haOfficial * 4.0);
  const dawnMinutes = normalizeMinutes(solarNoonMinutes - haCivil * 4.0);
  const duskMinutes = normalizeMinutes(solarNoonMinutes + haCivil * 4.0);

  return {
    sunriseMinutes: Math.round(sunriseMinutes),
    sunsetMinutes: Math.round(sunsetMinutes),
    dawnMinutes: Math.round(dawnMinutes),
    duskMinutes: Math.round(duskMinutes),
    solarNoonMinutes: Math.round(solarNoonMinutes),
    isPolarNight,
    isMidnightSun
  };
}

/**
 * Calculates exact real-time Solar Azimuth and Elevation / Polar angle
 * for a specific minute of the day using NOAA equations.
 */
export function calculateNOAASolarPosition(
  lat: number,
  lng: number,
  timeMinutes: number,
  date: Date = new Date()
): SolarPosition {
  const { delta, eqTime } = getSolarGeometry(date);
  const latRad = deg2rad(lat);
  const deltaRad = deg2rad(delta);
  const tzOffsetMinutes = -date.getTimezoneOffset();

  // True Solar Time (minutes)
  const trueSolarTime = normalizeMinutes(timeMinutes + eqTime + 4.0 * lng - tzOffsetMinutes);

  // Solar hour angle (degrees)
  let hourAngle = trueSolarTime / 4.0 - 180.0;
  if (hourAngle < -180.0) hourAngle += 360.0;
  const haRad = deg2rad(hourAngle);

  // Solar Zenith Angle (degrees)
  const cosZenith = Math.sin(latRad) * Math.sin(deltaRad) + Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(haRad);
  const zenithRad = Math.acos(Math.max(-1.0, Math.min(1.0, cosZenith)));
  const zenith = rad2deg(zenithRad);
  const elevation = 90.0 - zenith;

  // Solar Azimuth Angle (degrees from North clockwise)
  let azimuth = 0;
  const sinZenith = Math.sin(zenithRad);
  if (sinZenith > 0.0001) {
    const cosAzimuth = (Math.sin(latRad) * Math.cos(zenithRad) - Math.sin(deltaRad)) / (Math.cos(latRad) * sinZenith);
    const azRad = Math.acos(Math.max(-1.0, Math.min(1.0, cosAzimuth)));
    azimuth = hourAngle > 0 ? normalizeDegrees(360.0 - rad2deg(azRad)) : normalizeDegrees(rad2deg(azRad));
    // Correct for Northern vs Southern hemisphere orientation convention
    azimuth = normalizeDegrees(azimuth + 180.0);
  }

  // Polar angle from zenith for 3D lighting (clamped 0° at zenith, 90° at horizon)
  const polar = Math.max(0, Math.min(90, Math.round(zenith * 10) / 10));
  const isNight = elevation < -0.833; // below horizon
  const shadowDirectionAngle = Math.round((azimuth + 180.0) % 360);

  return {
    azimuth: Math.round(azimuth * 10) / 10,
    elevation: Math.round(elevation * 10) / 10,
    polar,
    isNight,
    shadowDirectionAngle
  };
}
