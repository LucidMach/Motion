"""Curated landmarks that GTFS and Nominatim don't reliably resolve: campus,
stadium, and market nicknames Melburnians actually type, plus buildings too
obscure for OSM's index. Checked before Nominatim, never instead of it -
Nominatim is the source of truth for everything not listed here.
"""

from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class Landmark:
    names: Tuple[str, ...]
    lat: float
    lon: float
    street: str
    mode: str


LANDMARKS: Tuple[Landmark, ...] = (
    Landmark(("alan finkel building",), -37.9126, 145.1332, "Alliance Lane, Monash Clayton", "Building / Landmark"),
    Landmark(("the spot", "the spot building"), -37.8016, 144.9592, "198 Berkeley Street, Carlton", "Building / Landmark"),
    Landmark(("monash university", "monash university clayton", "monash uni"), -37.9137, 145.1318, "Wellington Road, Clayton", "Campus / Landmark"),
    Landmark(("university of melbourne", "unimelb"), -37.7983, 144.9610, "Grattan Street, Parkville", "Campus / Landmark"),
    Landmark(("rmit university", "rmit"), -37.8080, 144.9632, "Swanston & La Trobe St, Melbourne CBD", "Campus / Landmark"),
    Landmark(("melbourne cricket ground", "mcg"), -37.8199, 144.9834, "Brunton Avenue, East Melbourne", "Building / Landmark"),
    Landmark(("marvel stadium",), -37.8165, 144.9475, "Harbour Esplanade, Docklands", "Building / Landmark"),
    Landmark(("queen victoria market",), -37.8076, 144.9568, "Elizabeth & Victoria St, Melbourne", "Building / Landmark"),
    Landmark(("crown melbourne", "crown casino"), -37.8228, 144.9582, "8 Whiteman Street, Southbank", "Building / Landmark"),
    Landmark(("st kilda beach",), -37.8675, 144.9735, "The Esplanade, St Kilda", "Building / Landmark"),
)


def find(query: str) -> Optional[Landmark]:
    """Best single match for a geocode lookup - substring match either direction."""
    norm = query.strip().lower()
    for landmark in LANDMARKS:
        if any(norm in name or name in norm for name in landmark.names):
            return landmark
    return None


def search(query: str) -> list:
    """All landmarks whose name contains the query, for autocomplete search."""
    norm = query.strip().lower()
    return [lm for lm in LANDMARKS if any(norm in name for name in lm.names)]
