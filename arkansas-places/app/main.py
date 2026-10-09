"""Arkansas Places API.  Run from the project root:

    uvicorn app.main:app --reload

Then open http://127.0.0.1:8000
"""
import json
from pathlib import Path

import duckdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "arkansas.duckdb"
if not DB_PATH.exists():
    raise SystemExit("data/arkansas.duckdb not found. Run: python etl/build_db.py")

con = duckdb.connect(str(DB_PATH), read_only=True)
GEOJSON = json.loads((ROOT / "data" / "raw" / "ar_counties.geojson").read_text())

app = FastAPI(title="Arkansas Places")

# Columns the table can be sorted by (whitelist: sort is interpolated into SQL).
SORTABLE = {"name", "kind", "county_name", "population", "pop_change_pct", "density", "pct_white",
            "pct_black", "pct_hispanic", "pct_65plus", "median_age", "pct_under18", "income", "poverty_rate", "pct_bachelors",
            "gop_margin"}


def rows(sql, params=()):
    """Run a query on a per-request cursor and return a list of dicts."""
    cur = con.cursor()
    cur.execute(sql, list(params))
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


@app.get("/api/places")
def list_places(q: str = "", kind: str = "", county: str = "",
                sort: str = "population", order: str = "desc"):
    """Every place, one row each. Filter by name, kind or county; sort by any column."""
    if sort not in SORTABLE:
        raise HTTPException(400, f"cannot sort by {sort}")
    direction = "ASC" if order == "asc" else "DESC"
    where, params = ["1=1"], []
    if q:
        where.append("name ILIKE ?")
        params.append(f"%{q}%")
    if kind == "municipality":
        where.append("kind IN ('city', 'town')")
    elif kind:
        where.append("kind = ?")
        params.append(kind)
    if county:
        where.append("county_fips = ?")
        params.append(county)
    return rows(f"SELECT * FROM place_summary WHERE {' AND '.join(where)} "
                f"ORDER BY {sort} {direction} NULLS LAST, name", params)


def place_detail(geoid: str):
    found = rows("SELECT * FROM place_summary WHERE geoid = ?", [geoid])
    if not found:
        raise HTTPException(404, f"no place with geoid {geoid}")
    place = found[0]
    place["population_series"] = rows(
        "SELECT year, population FROM population WHERE geoid = ? ORDER BY year", [geoid])
    # Results are only published by county, so a municipality shows its county's.
    place["elections"] = rows(
        "SELECT year, dem, gop, total, round(100.0 * dem / total, 1) AS dem_pct, "
        "round(100.0 * gop / total, 1) AS gop_pct, round(100.0 * (gop - dem) / total, 1) AS gop_margin "
        "FROM elections WHERE county_fips = ? ORDER BY year", [place["county_fips"]])
    place["municipalities"] = rows(
        "SELECT geoid, name, kind, population FROM place_summary "
        "WHERE county_fips = ? AND kind <> 'county' ORDER BY population DESC NULLS LAST",
        [geoid]) if place["kind"] == "county" else []
    return place


@app.get("/api/places/{geoid}")
def get_place(geoid: str):
    return place_detail(geoid)


@app.get("/api/compare")
def compare(ids: str = Query(..., description="comma-separated geoids, up to 3")):
    return [place_detail(g) for g in ids.split(",")[:3] if g]


@app.get("/api/map")
def county_map():
    """County outlines with each county's summary numbers attached."""
    stats = {r["geoid"]: r for r in rows("SELECT * FROM place_summary WHERE kind = 'county'")}
    return {"type": "FeatureCollection", "features": [
        {**f, "properties": stats.get(f["id"], f["properties"])} for f in GEOJSON["features"]]}


@app.get("/api/meta")
def meta():
    return {"sources": rows("SELECT * FROM sources"),
            "counts": rows("SELECT kind, count(*) AS n FROM places GROUP BY kind ORDER BY kind")}


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


app.mount("/", StaticFiles(directory=ROOT / "static"), name="static")
