# Technical Specification: Spatial Graph Precomputation Utility

## Overview
`precompute_graph.py` is a preprocessing module that transforms relational GTFS timetable tables into precomputed static graph edge tables in SQLite (`gtfs_schedule.db`). 

By precomputing directed transit connections and pedestrian interchange transfer pairs ahead of time, runtime routing graph instantiation overhead is reduced from several seconds to under $100\text{ ms}$.

---

## Architectural Workflow

```mermaid
graph TD
    A[(GTFS Database: stops, stop_times, trips, routes)] --> B[precompute_transit_edges]
    B --> C[Aggregate consecutive stop pairs via SQL JOIN & AVG travel time]
    C --> D[(Table: transit_network_edges)]
    
    A --> E[precompute_transfer_edges]
    E --> F[Convert Stop (Lat, Lon) to 3D Cartesian Unit Sphere]
    F --> G[SciPy KDTree Spatial Indexing]
    G --> H[Query Stop Pairs within 500m Radius: query_pairs]
    H --> I[Filter via Haversine & Compute Walk Durations]
    I --> J[(Table: transfer_edges)]
```

---

## Precomputed Tables Schema

### 1. `transit_network_edges`
Stores every unique directed edge between consecutive transit stops across the entire public transport network.

```sql
CREATE TABLE transit_network_edges (
    from_stop_id TEXT,
    to_stop_id TEXT,
    route_type INTEGER,
    route_short_name TEXT,
    avg_travel_time REAL
);

CREATE INDEX idx_tne_from ON transit_network_edges(from_stop_id);
CREATE INDEX idx_tne_to ON transit_network_edges(to_stop_id);
```

#### SQL Derivation Logic
```sql
INSERT INTO transit_network_edges
SELECT 
    st1.stop_id, 
    st2.stop_id, 
    r.route_type, 
    r.route_short_name,
    AVG(st2.arrival_time_secs - st1.departure_time_secs) as avg_travel_time
FROM stop_times st1
JOIN stop_times st2 ON st1.trip_id = st2.trip_id AND st1.stop_sequence + 1 = st2.stop_sequence
JOIN trips t ON st1.trip_id = t.trip_id
JOIN routes r ON t.route_id = r.route_id
GROUP BY st1.stop_id, st2.stop_id, r.route_type, r.route_short_name;
```

---

### 2. `transfer_edges`
Stores all bidirectional pedestrian walking transfer links between nearby transit stops (e.g. connecting a bus stop to an adjacent train platform or tram stop).

```sql
CREATE TABLE transfer_edges (
    from_stop_id TEXT,
    to_stop_id TEXT,
    distance_km REAL,
    walk_time_mins REAL
);

CREATE INDEX idx_te_from ON transfer_edges(from_stop_id);
CREATE INDEX idx_te_to ON transfer_edges(to_stop_id);
```

---

## Spatial Algorithm: KDTree Unit Sphere Indexing

Instead of performing an expensive $O(N^2)$ pairwise distance calculation over tens of thousands of transit stops, `precompute_graph.py` projects geographic coordinates onto a 3-dimensional Cartesian unit sphere and utilizes a `scipy.spatial.KDTree` ($O(N \log N)$ spatial partitioning).

### 1. Geographic to Cartesian Conversion
$$\begin{aligned}
x &= \cos(\text{lat}) \cdot \cos(\text{lon}) \\
y &= \cos(\text{lat}) \cdot \sin(\text{lon}) \\
z &= \sin(\text{lat})
\end{aligned}$$

### 2. Great-Circle Chord Distance Mapping
For a maximum walking radius $d = 0.5\text{ km}$ (500 meters) and Earth radius $R = 6371.0\text{ km}$, the Euclidean chord distance $r_{\text{chord}}$ on a unit sphere is calculated as:
$$r_{\text{chord}} = 2 \cdot \sin\left(\frac{d}{2R}\right)$$

### 3. Spatial Query & Ingestion
```python
pairs = tree.query_pairs(r=r_chord)
```
- Performs fast bounding-box neighbor pruning.
- Verifies exact geodesic distance using `haversine()`.
- Calculates walking duration: $\text{walk\_mins} = \frac{\text{dist\_km}}{5.0\text{ km/h}} \times 60.0$.
- Ingests bidirectional edges $(u \rightarrow v)$ and $(v \rightarrow u)$ in batch transactions.

---

## Core Functions & API Reference

### 1. `run_precomputation(db_path=DB_NAME)`
Orchestrates the full precomputation suite on the specified SQLite database.

### 2. `precompute_transit_edges(conn)`
Extracts and averages transit link travel times from scheduled trips.

### 3. `precompute_transfer_edges(conn, max_walk_distance_km=0.5)`
Discovers walkable interchange links between distinct stops within `max_walk_distance_km`.

### 4. `lat_lon_to_cartesian(lat, lon) -> np.ndarray`
Vectorized conversion of latitude and longitude arrays into $(x, y, z)$ Cartesian points.

---

## CLI Execution

```bash
python precompute_graph/precompute_graph.py
```

### Execution Output
```text
============================================================
PRECOMPUTING TRANSIT & TRANSFER SPATIAL GRAPH EDGES
Database: gtfs_schedule.db
============================================================

1. Precomputing Transit Network Edges...
Creating indexes on transit_network_edges...
✓ Created 45,210 transit edges in 2.15s

2. Precomputing Walking Transfer Edges (KDTree Spatial Search)...
Found 18,420 transfer stop pairs within 500m.
Creating indexes on transfer_edges...
✓ Created 36,840 transfer walking edges in 1.40s

✓ Precomputation complete! Spatial graph querying is now instantaneous.
```
