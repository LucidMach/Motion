// Curated metro train line metadata not baked into the static GeoJSON
// (text color, display sort order, exclusions). Ported from
// server/services/network_service.py's LINE_METADATA/TRAIN_CORRIDOR_ORDER/
// EXCLUDED_TRAIN_LINES. Colors/groups/outline/shuttle flags themselves are
// already resolved into ptv_metro_trains.geojson's feature properties at
// precompute time, so they aren't duplicated here.

export const LINE_TEXT_COLOR: Record<string, string> = {
  Alamein: '#FFFFFF',
  Belgrave: '#FFFFFF',
  Lilydale: '#FFFFFF',
  'Glen Waverley': '#FFFFFF',
  Hurstbridge: '#FFFFFF',
  Mernda: '#FFFFFF',
  Craigieburn: '#000000',
  Upfield: '#000000',
  Frankston: '#FFFFFF',
  'Stony Point': '#028430',
  Sandringham: '#FFFFFF',
  Werribee: '#FFFFFF',
  Williamstown: '#FFFFFF',
  Cranbourne: '#FFFFFF',
  Pakenham: '#FFFFFF',
  Sunbury: '#FFFFFF',
  'Flemington Racecourse': '#000000',
  'City Circle': '#FFFFFF',
};

/** Standard PTV Melbourne railway corridor display order. */
export const TRAIN_CORRIDOR_ORDER: string[] = [
  'Cranbourne', 'Pakenham', 'Sunbury',
  'Lilydale', 'Belgrave', 'Glen Waverley', 'Alamein',
  'Craigieburn', 'Upfield',
  'Mernda', 'Hurstbridge',
  'Frankston',
  'Werribee', 'Sandringham', 'Williamstown',
];

export const EXCLUDED_TRAIN_LINES = new Set([
  'City Circle',
  'Replacement Bus',
  'Flemington Racecourse',
  'Williamstown',
  'Stony Point',
]);

/** Ported from network_service.py's FALLBACK_TRAM_METADATA text_color values. */
export const TRAM_TEXT_COLOR: Record<string, string> = {
  '1': '#000000', '3': '#000000', '5': '#FFFFFF', '6': '#FFFFFF',
  '11': '#000000', '12': '#FFFFFF', '16': '#000000', '19': '#FFFFFF',
  '30': '#FFFFFF', '35': '#FFFFFF', '48': '#FFFFFF', '57': '#000000',
  '58': '#FFFFFF', '59': '#FFFFFF', '64': '#FFFFFF', '67': '#FFFFFF',
  '70': '#000000', '72': '#000000', '75': '#000000', '78': '#000000',
  '82': '#000000', '86': '#000000', '96': '#FFFFFF', '109': '#000000',
};
