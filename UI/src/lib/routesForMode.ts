// Route-picker lists per transit mode, ported from
// server/services/route_shape_service.py's get_routes_for_mode() +
// server/services/network_service.py's get_all_routes_metadata().
import { getMetroTrainsGeoJSON, getRoutes, getShapeData, DEFAULT_TRAM_COLOR } from './staticData';
import { LINE_TEXT_COLOR, TRAIN_CORRIDOR_ORDER, EXCLUDED_TRAIN_LINES, TRAM_TEXT_COLOR } from './lineMetadata';

export interface RouteMetadataOut {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  color: string;
  text_color?: string;
  group: string;
  outline?: boolean;
  shuttle?: boolean;
  mode: string;
}

async function getTrainRoutes(origin: string): Promise<RouteMetadataOut[]> {
  const lines = await getMetroTrainsGeoJSON(origin);
  const unique = new Map<string, RouteMetadataOut>();

  for (const f of lines.features) {
    const props = f.properties;
    const rName = props.route_short_name;
    if (rName && !unique.has(rName) && !EXCLUDED_TRAIN_LINES.has(rName)) {
      unique.set(rName, {
        route_id: props.route_id ?? rName,
        route_short_name: rName,
        route_long_name: props.route_long_name ?? '',
        color: props.color ?? '#0072CE',
        text_color: LINE_TEXT_COLOR[rName] ?? '#FFFFFF',
        group: props.line_group ?? 'Metro Train',
        outline: props.outline ?? false,
        shuttle: props.shuttle ?? false,
        mode: props.mode ?? 'train',
      });
    }
  }

  const orderMap = new Map(TRAIN_CORRIDOR_ORDER.map((name, idx) => [name, idx]));
  return [...unique.values()].sort((a, b) => {
    const oa = orderMap.get(a.route_short_name) ?? 999;
    const ob = orderMap.get(b.route_short_name) ?? 999;
    if (oa !== ob) return oa - ob;
    return a.route_short_name.localeCompare(b.route_short_name);
  });
}

function numericThenAlpha(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  if (!Number.isNaN(na) && Number.isNaN(nb)) return -1;
  if (Number.isNaN(na) && !Number.isNaN(nb)) return 1;
  return a.localeCompare(b);
}

async function getTramRoutes(origin: string): Promise<RouteMetadataOut[]> {
  const [routes, shapeData] = await Promise.all([getRoutes(origin), getShapeData(origin, 'tram')]);

  const seen = new Map<string, RouteMetadataOut>();
  for (const [, shortName, longName, routeType] of routes) {
    if (routeType !== 0 || shortName === '' || seen.has(shortName)) continue;
    seen.set(shortName, {
      route_id: shortName,
      route_short_name: shortName,
      route_long_name: longName,
      color: shapeData.routeColors.get(shortName) ?? DEFAULT_TRAM_COLOR,
      text_color: TRAM_TEXT_COLOR[shortName] ?? '#FFFFFF',
      group: 'Yarra Trams',
      mode: 'tram',
    });
  }

  return [...seen.values()].sort((a, b) => numericThenAlpha(a.route_short_name, b.route_short_name));
}

/** Lists every route for a transit mode, for populating the route picker. Unknown modes return []. */
export async function getRoutesForMode(origin: string, mode: string): Promise<RouteMetadataOut[]> {
  if (mode === 'train') return getTrainRoutes(origin);
  if (mode === 'tram') return getTramRoutes(origin);
  // Bus is intentionally excluded from this dataset - see README.md.
  return [];
}
