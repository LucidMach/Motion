// Live PTV service alert fetching, ported from ptv_realtime.py's
// get_raw_service_alerts()/fetch_live_service_alerts(). Trip-update/delay
// checking and resolve_route_name_from_id's SQLite lookup were the only
// other things in that file - the former has no remaining callers (it
// belonged to the removed point-to-point routing engine), and the latter
// is replaced with a static routes.json lookup below.
import { decodeFeedMessage } from './gtfsRealtime';
import { getRoutes } from './staticData';

function getApiKey(): string {
  return (
    (import.meta.env.PTV_API_KEY as string) ||
    (import.meta.env.PTVOpenDataAPIKey as string) ||
    process.env.PTV_API_KEY ||
    process.env.PTVOpenDataAPIKey ||
    ''
  );
}

const SERVICE_ALERT_URLS: Record<string, string> = {
  metro_train:
    'https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/66dfd529-65a4-44b2-a4f6-8fa82b535d88/download/gtfsr_metro_train_service_alerts.pb',
  metro_tram:
    'https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/c444007d-5a82-4217-a068-07b9a5dd5b2d/download/gtfsr_metro_tram_service_alerts.pb',
  metro_bus:
    'https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/82a7a4c7-1a06-444f-a42e-836f6d2f33f9/download/gtfsr_metro_bus_service_alerts.pb',
  regional_train:
    'https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/f67e4526-728b-4c5a-b620-6d04e389e9f9/download/gtfsr_regional_train_service_alerts.pb',
};

const KNOWN_LINE_NAMES = [
  'Alamein', 'Belgrave', 'Craigieburn', 'Cranbourne', 'Frankston', 'Glen Waverley',
  'Hurstbridge', 'Lilydale', 'Mernda', 'Pakenham', 'Sandringham', 'Stony Point',
  'Sunbury', 'Upfield', 'Werribee', 'Williamstown',
];

export interface RawAlert {
  route_name: string;
  effect: 'NO_SERVICE' | 'DELAYED';
  replacement_bus_available: boolean;
  description: string;
  active_periods: { start: number; end: number }[];
  delay_mins: number;
}

async function resolveRouteNameFromId(origin: string, routeId: string): Promise<string> {
  if (!routeId) return routeId;
  const routes = await getRoutes(origin);
  const match = routes.find(([id]) => id === routeId);
  if (match) {
    const [, shortName, longName] = match;
    return shortName || longName || routeId;
  }
  return routeId;
}

interface RawAlertsCache {
  timestamp: number;
  alerts: RawAlert[];
}
let rawAlertsCache: RawAlertsCache | null = null;
const TTL_SECS = 60;

async function fetchFeed(url: string): Promise<ArrayBuffer | null> {
  const apiKey = getApiKey();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, {
      headers: apiKey ? { KeyID: apiKey } : {},
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 15)).toLowerCase();
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) return null;
    return buffer;
  } catch {
    return null;
  }
}

export async function getRawServiceAlerts(origin: string): Promise<RawAlert[]> {
  const now = Date.now() / 1000;
  if (rawAlertsCache && now - rawAlertsCache.timestamp < TTL_SECS) {
    return rawAlertsCache.alerts;
  }

  const rawAlerts: RawAlert[] = [];

  for (const url of Object.values(SERVICE_ALERT_URLS)) {
    const buffer = await fetchFeed(url);
    if (!buffer) continue;

    let decoded;
    try {
      decoded = decodeFeedMessage(new Uint8Array(buffer));
    } catch {
      continue;
    }

    for (const alert of decoded.alerts) {
      const combinedText = `${alert.headerText} ${alert.descriptionText}`.trim();
      const effectStr: 'NO_SERVICE' | 'DELAYED' = alert.effect === 3 ? 'DELAYED' : 'NO_SERVICE';

      const lowerCombined = combinedText.toLowerCase();
      const hasReplacementBus = [
        'replacement bus', 'buses replace', 'bus replacement', 'replacement buses', 'buses replacing',
      ].some((kw) => lowerCombined.includes(kw));

      const matchedRoutes = new Set<string>();
      for (const routeId of alert.informedRouteIds) {
        const name = await resolveRouteNameFromId(origin, routeId);
        if (name) matchedRoutes.add(name);
      }
      for (const line of KNOWN_LINE_NAMES) {
        if (lowerCombined.includes(line.toLowerCase())) matchedRoutes.add(line);
      }
      if (matchedRoutes.size === 0) matchedRoutes.add('General Network');

      for (const routeName of matchedRoutes) {
        rawAlerts.push({
          route_name: routeName,
          effect: effectStr,
          replacement_bus_available: hasReplacementBus,
          description: alert.headerText || alert.descriptionText || `Service alert on ${routeName}`,
          active_periods: alert.activePeriods,
          delay_mins: effectStr === 'DELAYED' ? 10.0 : 0.0,
        });
      }
    }
  }

  rawAlertsCache = { timestamp: now, alerts: rawAlerts };
  return rawAlerts;
}

/** Journey window: [targetEpochSecs - lookbackWindowMins, targetEpochSecs]. */
function isAlertActiveAtTime(
  activePeriods: { start: number; end: number }[],
  targetEpochSecs: number,
  lookbackWindowMins: number
): boolean {
  if (!activePeriods.length) return true; // Default to active if unconstrained.

  const windowStartTs = targetEpochSecs - lookbackWindowMins * 60;

  for (const { start, end } of activePeriods) {
    if (start && start > targetEpochSecs) continue; // Not started yet.
    if (end && end < windowStartTs) continue; // Already ended before travel window.
    return true; // Overlaps travel window.
  }
  return false;
}

export async function fetchLiveServiceAlerts(origin: string, lookbackWindowMins = 120): Promise<RawAlert[]> {
  const rawAlerts = await getRawServiceAlerts(origin);
  const targetEpochSecs = Math.floor(Date.now() / 1000);
  return rawAlerts.filter((alert) => isAlertActiveAtTime(alert.active_periods, targetEpochSecs, lookbackWindowMins));
}
