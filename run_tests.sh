#!/usr/bin/env bash

# ==============================================================================
# Multi-Modal & Directional Transit Routing Test Suite Runner
# ==============================================================================

set -o pipefail

# ANSI color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Workspace directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

print_header() {
    echo -e "${CYAN}${BOLD}"
    echo "========================================================================"
    echo "          MOTION TRANSIT ROUTING ENGINE - TEST SUITE RUNNER            "
    echo "========================================================================"
    echo -e "${NC}"
}

print_section() {
    echo -e "\n${BLUE}${BOLD}▶ $1${NC}"
    echo -e "${BLUE}------------------------------------------------------------------------${NC}"
}

report_result() {
    local test_name="$1"
    local exit_code="$2"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ "$exit_code" -eq 0 ]; then
        echo -e "  [${GREEN}PASS${NC}] $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "  [${RED}FAIL${NC}] $test_name (Exit code: $exit_code)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

export MPLCONFIGDIR=/tmp/matplotlib
export PYTHONPATH="$PROJECT_DIR:$PYTHONPATH"

# 1. Environment & Dependency Checks
print_header

print_section "1. Checking Python Environment & Dependencies"

PYTHON_CMD="python3.11"
if ! command -v "$PYTHON_CMD" &> /dev/null; then
    PYTHON_CMD="python3"
fi

if ! command -v "$PYTHON_CMD" &> /dev/null; then
    echo -e "${RED}Error: Python is not installed or not in PATH.${NC}"
    exit 1
fi

echo "Using Python binary: $(which "$PYTHON_CMD") ($("$PYTHON_CMD" --version))"

"$PYTHON_CMD" -c "
import sqlite3, math, networkx, geopy, osmnx
print('  ✓ sqlite3, math, networkx, geopy, osmnx are available.')
"
report_result "Python Dependencies Check" $?

# 2. Database Integrity Check
print_section "2. Checking GTFS Database"
DB_FILE="$PROJECT_DIR/gtfs_schedule.db"

if [ -f "$DB_FILE" ]; then
    DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
    echo "Found database: $DB_FILE ($DB_SIZE)"
    
    "$PYTHON_CMD" -c "
import sqlite3
conn = sqlite3.connect('$DB_FILE')
c = conn.cursor()
tables = [r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]
required = {'stops', 'routes', 'trips', 'stop_times', 'transit_network_edges', 'transfer_edges'}
missing = required - set(tables)
if missing:
    raise Exception(f'Missing required tables: {missing}')
stop_count = c.execute('SELECT COUNT(*) FROM stops').fetchone()[0]
transit_edges_count = c.execute('SELECT COUNT(*) FROM transit_network_edges').fetchone()[0]
transfer_edges_count = c.execute('SELECT COUNT(*) FROM transfer_edges').fetchone()[0]
print(f'  ✓ Database verified. Stops: {stop_count}, Precomputed Transit Edges: {transit_edges_count}, Transfer Edges: {transfer_edges_count}')
conn.close()
"
    report_result "GTFS Database Schema & Data Check" $?
else
    echo -e "${YELLOW}Warning: $DB_FILE not found. Running with mock datasets.${NC}"
fi

# 3. Directional Routing Unit Tests
print_section "3. Running Directional Routing Unit Tests"
"$PYTHON_CMD" -m unittest directional_routing/test_directional_routing.py -v
report_result "Unit Tests (test_directional_routing.py)" $?

# 3b. PTV Realtime Module Unit Tests
print_section "3b. Running PTV Realtime Module Unit Tests"
"$PYTHON_CMD" -m unittest ptv_realtime/test_ptv_realtime.py -v
report_result "Unit Tests (test_ptv_realtime.py)" $?

# 3c. FastAPI Backend Test Suite
print_section "3c. Running FastAPI Backend Test Suite"
"$PYTHON_CMD" -m unittest tests/test_api.py -v
report_result "FastAPI Backend Test Suite (test_api.py)" $?

# 4. Routing Engine Integration Test (Mock & Calculation)
print_section "4. Testing Directional Routing Itinerary Computation"
"$PYTHON_CMD" -c "
from datetime import datetime
import directional_routing

bearing = directional_routing.calculate_bearing(-37.8136, 144.9631, -37.8675, 144.9765)
print(f'  Bearing (Melbourne CBD -> St Kilda): {bearing:.2f}°')
assert 160 <= bearing <= 190, f'Unexpected bearing: {bearing}'
print('  ✓ Bearing calculation verified.')
"
report_result "Directional Logic & Geometry Verification" $?

# 5. End-to-End PTV Multi-Modal Route Tests
print_section "5. Running End-to-End Multi-Modal Route Tests with Arrival Timestamps"

echo -e "${YELLOW}Test 5A: Richmond -> Footscray (Target Arrival: 2026-08-20 09:15, Buffer: 10m)${NC}"
"$PYTHON_CMD" ptv_realtime/ptv_realtime.py --start "Richmond" --destination "Footscray" --arrival-time "2026-08-20 09:15" --buffer 10
report_result "Route: Richmond -> Footscray (ISO Timestamp: 2026-08-20 09:15)" $?

echo -e "\n${YELLOW}Test 5B: Alan Finkel Building -> The Spot Building (Target Arrival: 2026-08-20 10:00, Buffer: 10m)${NC}"
"$PYTHON_CMD" ptv_realtime/ptv_realtime.py --start "Alan Finkel Building" --destination "The Spot Building" --arrival-time "2026-08-20 10:00" --buffer 10
report_result "Route: Alan Finkel Building -> The Spot Building (ISO Timestamp: 2026-08-20 10:00)" $?

echo -e "\n${YELLOW}Test 5C: Richmond -> Footscray with Sandringham Disrupted (Prefer Replacement Bus)${NC}"
"$PYTHON_CMD" ptv_realtime/ptv_realtime.py --start "Richmond" --destination "Footscray" --arrival-time "2026-08-20 09:15" --buffer 10 --disrupt-route "Sandringham"
report_result "Dynamic Reroute (Replacement Bus): Richmond -> Footscray" $?

echo -e "\n${YELLOW}Test 5D: Richmond -> Footscray with Sandringham Disrupted (No Replacement Bus - Detour Mode)${NC}"
"$PYTHON_CMD" ptv_realtime/ptv_realtime.py --start "Richmond" --destination "Footscray" --arrival-time "2026-08-20 09:15" --buffer 10 --disrupt-route "Sandringham" --no-replacement-bus
report_result "Dynamic Reroute (Alternative Line Detour): Richmond -> Footscray" $?

echo -e "\n${YELLOW}Test 5E: Richmond -> Footscray with Unix Epoch Arrival Timestamp (1787219700)${NC}"
"$PYTHON_CMD" ptv_realtime/ptv_realtime.py --start "Richmond" --destination "Footscray" --arrival-timestamp 1787219700 --buffer 10 --no-live-alerts
report_result "Route: Richmond -> Footscray (Unix Epoch Arrival Timestamp: 1787219700)" $?

# Summary Report
echo -e "\n${CYAN}${BOLD}========================================================================${NC}"
echo -e "${BOLD}TEST SUMMARY:${NC}"
echo -e "  Total Tests Executed : ${BOLD}$TOTAL_TESTS${NC}"
echo -e "  Passed               : ${GREEN}${BOLD}$PASSED_TESTS${NC}"
if [ "$FAILED_TESTS" -gt 0 ]; then
    echo -e "  Failed               : ${RED}${BOLD}$FAILED_TESTS${NC}"
    echo -e "${CYAN}========================================================================${NC}"
    exit 1
else
    echo -e "  Failed               : 0"
    echo -e "\n${GREEN}${BOLD}✓ ALL TESTS PASSED SUCCESSFULLY!${NC}"
    echo -e "${CYAN}========================================================================${NC}"
    exit 0
fi
