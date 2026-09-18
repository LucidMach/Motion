#!/usr/bin/env bash
# Render deployment build script for Motion Backend
set -e

echo "=== [Motion Render Build] Step 1: Installing Python dependencies ==="
pip install --upgrade pip
pip install -r requirements.txt

echo "=== [Motion Render Build] Step 2: Preparing GTFS Schedule Database ==="
if [ -n "$GTFS_DB_URL" ]; then
    echo "Fetching prebuilt database from GTFS_DB_URL..."
    curl -fSL -o gtfs_schedule.db "$GTFS_DB_URL"
    echo "✓ Prebuilt database downloaded successfully ($(du -h gtfs_schedule.db | cut -f1))."
elif [ -f "gtfs_schedule.db" ] && [ -s "gtfs_schedule.db" ]; then
    echo "✓ Existing gtfs_schedule.db found in workspace."
else
    echo "⚠️ No GTFS_DB_URL specified and no local database found."
    echo "Generating mock transit database and spatial graph for demo/testing mode..."
    python gtfs_db_builder/gtfs_db_builder.py
    python precompute_graph/precompute_graph.py
    echo "✓ Synthetic transit database created successfully."
fi

echo "=== [Motion Render Build] Step 3: Verifying Database Integrity ==="
python -c "
import sqlite3, os
if os.path.exists('gtfs_schedule.db'):
    conn = sqlite3.connect('gtfs_schedule.db')
    c = conn.cursor()
    tables = [r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]
    print(f'Database tables verified: {len(tables)} tables found -> {tables}')
    conn.close()
else:
    print('Warning: gtfs_schedule.db not present')
"

echo "=== [Motion Render Build] Build complete! Ready to start Uvicorn. ==="
