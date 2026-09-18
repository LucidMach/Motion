#!/usr/bin/env bash
# ==============================================================================
# Motion GTFS Database Auto-Generator
# Downloads official Transport for Victoria GTFS feeds, extracts them,
# populates SQLite timetable schema, and precomputes directional spatial graphs.
# ==============================================================================

set -e

# Default settings
DEFAULT_GTFS_URL="https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip"
GTFS_URL="${GTFS_DOWNLOAD_URL:-$DEFAULT_GTFS_URL}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GTFS_ZIP="${PROJECT_ROOT}/gtfs.zip"
GTFS_DIR="${PROJECT_ROOT}/gtfs"
DB_FILE="${PROJECT_ROOT}/gtfs_schedule.db"
GZ_FILE="${PROJECT_ROOT}/gtfs_schedule.db.gz"

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
echo "✓ Extracted ${FEED_COUNT} GTFS feeds (Trains, Trams, Buses, Regional, SkyBus)."

# Step 3: Run GTFS Database Ingestion
echo ""
echo "⚙️  Ingesting feeds and building SQLite database..."
$PYTHON_CMD gtfs_db_builder/gtfs_db_builder.py "${GTFS_DIR}"/*/google_transit.zip

# Step 4: Precompute Directional & Spatial Graph Edges
echo ""
echo "⚡ Precomputing transit edges and KDTree transfer pairs..."
$PYTHON_CMD precompute_graph/precompute_graph.py

# Step 5: Compress for deployment / release assets
echo ""
echo "🗜️  Compressing database for deployment asset..."
gzip -c -9 "${DB_FILE}" > "${GZ_FILE}"
echo "✓ Created compressed asset: $(du -h "${GZ_FILE}" | cut -f1)"

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
    for table in ['stops', 'routes', 'trips', 'stop_times', 'transit_network_edges', 'transfer_edges']:
        try:
            cnt = c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
            print(f' • {table.ljust(22)}: {cnt:,} records')
        except Exception as e:
            print(f' • {table.ljust(22)}: Error ({e})')
    conn.close()
"
echo " Database size (raw) : $(du -h "${DB_FILE}" | cut -f1)"
echo " Database size (gzip): $(du -h "${GZ_FILE}" | cut -f1)"
echo "=============================================================================="
echo "✨ All Done! Database is ready for local development or Render deployment."
