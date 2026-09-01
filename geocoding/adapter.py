"""The Nominatim adapter: the seam between the geocoding module and the live
OpenStreetMap API. Two adapters exist - the live one for production, a
fixture-backed one for tests - so search/geocode logic never needs a live
network call to be exercised.
"""

import json
import time
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Protocol


class GeocodingAdapter(Protocol):
    """Given free text, returns raw Nominatim-shaped place dicts (lat, lon,
    category, type, address, display_name, osm_type, osm_id). Never raises -
    a miss or a network failure both return an empty list.
    """

    def search_places(self, query: str, limit: int) -> List[Dict]: ...


class NominatimAdapter:
    """Live OpenStreetMap Nominatim adapter, bounded to Victoria, Australia.

    Interface cost: at most 1 request/second, shared across every caller in
    the process (Nominatim's usage policy), a 5s socket timeout per request,
    and results memoized in-process per exact (query, limit) for the life of
    the server - repeated lookups of the same text are free.
    """

    _MIN_INTERVAL_SECS = 1.0

    def __init__(self):
        self._last_request_at = 0.0
        self._cache: Dict[str, List[Dict]] = {}

    def search_places(self, query: str, limit: int = 5) -> List[Dict]:
        cache_key = f"{query.strip().lower()}::{limit}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        self._throttle()
        results = self._fetch(query, limit)
        self._cache[cache_key] = results
        return results

    def _throttle(self):
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self._MIN_INTERVAL_SECS:
            time.sleep(self._MIN_INTERVAL_SECS - elapsed)
        self._last_request_at = time.monotonic()

    def _fetch(self, query: str, limit: int) -> List[Dict]:
        url = (
            "https://nominatim.openstreetmap.org/search?"
            f"q={urllib.parse.quote(query)}"
            f"&format=jsonv2&addressdetails=1&limit={limit}"
            "&countrycodes=au&viewbox=140.9,-39.2,150.0,-33.9"
        )
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Motion-Transit-App/1.0 (https://github.com/lucidmach/Motion)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data if isinstance(data, list) else []
        except Exception:
            return []


class FakeGeocodingAdapter:
    """Test adapter: returns canned results for exact query strings, no network."""

    def __init__(self, fixtures: Optional[Dict[str, List[Dict]]] = None):
        self.fixtures = fixtures or {}
        self.calls: List[str] = []

    def search_places(self, query: str, limit: int = 5) -> List[Dict]:
        self.calls.append(query)
        return self.fixtures.get(query.strip().lower(), [])[:limit]


live_adapter = NominatimAdapter()
