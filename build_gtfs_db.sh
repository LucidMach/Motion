#!/usr/bin/env bash
# ==============================================================================
# Motion GTFS Database Auto-Generator
# Downloads official Transport for Victoria GTFS feeds, extracts them,
# populates a dev-time SQLite timetable database, and bakes it down into the
# static JSON the Astro app serves at runtime.
# ==============================================================================

set -e

# Default settings
DEFAULT_GTFS_URL="https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip"
GTFS_URL="${GTFS_DOWNLOAD_URL:-$DEFAULT_GTFS_URL}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GTFS_ZIP="${PROJECT_ROOT}/gtfs.zip"
GTFS_DIR="${PROJECT_ROOT}/gtfs"
DB_FILE="${PROJECT_ROOT}/gtfs_schedule.db"

cd "${PROJECT_ROOT}"

# Detect Python interpreter
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python 3 is not installed or not in PATH."
    exit 1
fi

echo "=============================================================================="
echo " MOTION GTFS PIPELINE: AUTO-GENERATOR"
echo "=============================================================================="
echo " Project Root : ${PROJECT_ROOT}"
echo " Python Binary: $($PYTHON_CMD --version 2>&1) (${PYTHON_CMD})"
echo " Database File: ${DB_FILE}"
echo "=============================================================================="

# Step 1: Download GTFS zip if not already present
if [ -f "${GTFS_ZIP}" ] && [ -s "${GTFS_ZIP}" ]; then
    echo "✓ Existing gtfs.zip found ($(du -h "${GTFS_ZIP}" | cut -f1)). Skipping download."
else
    echo "⬇️  Downloading official Victorian GTFS dataset..."
    echo "   URL: ${GTFS_URL}"
    curl -fSL --retry 3 --progress-bar -o "${GTFS_ZIP}" "${GTFS_URL}"
    echo "✓ Download complete: $(du -h "${GTFS_ZIP}" | cut -f1)"
fi

# Step 2: Extract feeds into gtfs/ directory
echo ""
echo "📦 Extracting GTFS sub-feeds into ./gtfs/ ..."
mkdir -p "${GTFS_DIR}"
unzip -q -o "${GTFS_ZIP}" -d "${GTFS_DIR}/"
FEED_COUNT=$(find "${GTFS_DIR}" -name "google_transit.zip" | wc -l | tr -d ' ')
echo "✓ Extracted ${FEED_COUNT} GTFS feeds."

# Step 3: Run GTFS Database Ingestion
# Motion only serves the metro feeds:
#   2  = Metro Train
#   3  = Metro Tram
#   11 = SkyBus airport shuttle (tiny, 5 routes, metro-area service)
# The metro bus feed (4) and the regional feeds (1, 5, 6, 10) are
# intentionally excluded - bus isn't served for now, and this database is
# dev-time only (see §4 below), never deployed, so there's no size pressure
# pushing toward trimming further than that.
echo ""
echo "⚙️  Ingesting metro feeds (Train, Tram, SkyBus) and building SQLite database..."
$PYTHON_CMD gtfs_db_builder/gtfs_db_builder.py \
    "${GTFS_DIR}/2/google_transit.zip" \
    "${GTFS_DIR}/3/google_transit.zip" \
    "${GTFS_DIR}/11/google_transit.zip"

# Step 4: Bake the static JSON the Astro app actually serves at runtime.
# gtfs_schedule.db itself is never deployed - only these output files are.
echo ""
echo "⚡ Precomputing stops/routes/vehicle-sim static JSON..."
$PYTHON_CMD gtfs_db_builder/precompute_static_data.py

# Step 5: Precompute per-route shape/stop files for the frontend
# Route shapes and stops are static GTFS-derived data, so they're baked out
# once here into UI/public/data/transit/routes/ and served to the browser
# as plain static files - no backend lookup needed on every route click.
echo ""
echo "🗺️  Precomputing per-route shape & stop files..."
$PYTHON_CMD precompute_route_data/precompute_route_data.py

# Step 6: Verify and output summary stats
echo ""
echo "=============================================================================="
echo " VERIFICATION SUMMARY"
echo "=============================================================================="
$PYTHON_CMD -c "
import sqlite3, os
db = '${DB_FILE}'
if os.path.exists(db):
    conn = sqlite3.connect(db)
    c = conn.cursor()
    for table in ['stops', 'routes', 'trips', 'stop_times', 'calendar', 'calendar_dates']:
        try:
            cnt = c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
            print(f' • {table.ljust(22)}: {cnt:,} records')
        except Exception as e:
            print(f' • {table.ljust(22)}: Error ({e})')
    conn.close()
"
echo " Database size (raw) : $(du -h "${DB_FILE}" | cut -f1)"
echo "=============================================================================="
echo "✨ All Done! Static JSON is in UI/public/data/ and ready for local dev or a Vercel deploy."
