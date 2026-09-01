import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.routes import system, stops, network, disruptions, routing
from server.services.network_service import generate_metro_geojson


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preloads network GeoJSON and verifies database integrity on startup."""
    print("[MotionAPI] Initializing Motion Transit API...")
    try:
        lines, stations = generate_metro_geojson()
        print(f"[MotionAPI] Loaded {len(lines.get('features', []))} metro lines and {len(stations.get('features', []))} stations.")
    except Exception as e:
        print(f"[MotionAPI] Notice initializing network cache: {e}")
    yield
    print("[MotionAPI] Shutting down Motion Transit API.")


app = FastAPI(
    title="Motion Transit Engine API",
    description="High-performance multi-modal Victorian transit routing, spatial orientation, and live GTFS-R disruption engine.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for Astro & React UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4321",
        "http://127.0.0.1:4321",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all route modules
app.include_router(system.router)
app.include_router(stops.router)
app.include_router(network.router)
app.include_router(disruptions.router)
app.include_router(routing.router)


@app.get("/")
def root():
    return {
        "service": "Motion Transit Engine API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "endpoints": [
            "/api/health",
            "/api/status",
            "/api/stops/search?q={query}",
            "/api/stops/nearby?lat={lat}&lon={lon}",
            "/api/network/metro/lines",
            "/api/network/metro/stations",
            "/api/network/routes",
            "/api/disruptions/live",
            "/api/route"
        ]
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting Motion Transit API server on http://{host}:{port}...")
    uvicorn.run("server.main:app", host=host, port=port, reload=True)
