// mapbox-gl-js caches tile/style responses via the browser Cache API and already
// swallows failures internally (tile_request_cache.js: `cache.put(...).catch(e =>
// warnOnce(e.message))`) — but warnOnce still logs the raw DOMException text
// "Failed to execute 'put' on 'Cache': Cache.put() encountered a network error"
// to the console. It's non-fatal (mapbox just falls back to an uncached fetch)
// and happens whenever the browser refuses to cache an opaque/cross-origin tile
// response (private browsing, storage partitioning, etc). We filter only this
// exact, known-benign message so real warnings still surface.
const BENIGN_PATTERNS = [/Cache\.put\(\) encountered a network error/i];

let installed = false;

export function suppressBenignMapboxWarnings(): void {
  if (installed) return;
  installed = true;

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const message = String(args[0] ?? '');
    if (BENIGN_PATTERNS.some((pattern) => pattern.test(message))) return;
    originalWarn(...args);
  };
}
