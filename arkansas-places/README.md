# Arkansas Places

A small database and web app for Arkansas counties and municipalities:
population, population change, demographics and presidential voting history.

## Run it

    pip install -r requirements.txt
    uvicorn app.main:app --reload

Open http://127.0.0.1:8000. Interactive API docs are at /docs.

## How it fits together

    etl/fetch_raw.py   downloads the public source files, keeps Arkansas rows -> data/raw/
    etl/build_db.py    loads data/raw/ (incl. the Census downloads in data/raw/census/) into data/arkansas.duckdb
    app/main.py        FastAPI: reads the DuckDB file and serves JSON plus the static site
    static/            index.html, style.css, charts.js (SVG line chart + map), app.js (views)

To rebuild the database: `python etl/build_db.py`.

## Database

| Table | Contents |
|---|---|
| `places` | one row per county or municipality (`kind` = county, city or town) |
| `population` | `geoid, year, population` |
| `demographics` | race and ethnicity, age, income, poverty, education (percentages 0-100) |
| `elections` | county presidential results: `county_fips, year, dem, gop, total` |
| `place_summary` (view) | one row per place with everything the table and map need |

## API

| Endpoint | Returns |
|---|---|
| `GET /api/places?q=&kind=&county=&sort=&order=` | filtered, sorted list |
| `GET /api/places/{geoid}` | one place with its population series and election results |
| `GET /api/compare?ids=05143,05119` | up to three places in full |
| `GET /api/map` | county outlines (GeoJSON) with summary numbers attached |
| `GET /api/meta` | data sources and row counts |

## Data notes

- **Population, 2020-2024**: Census Bureau Vintage 2024 estimates for all 75 counties and
  all 500 incorporated cities and towns (`data/raw/census/sub-est2024_5.csv`).
  "Change" everywhere means 2020 to 2024.
- **Population, 2010-2019**: counties only, from the JsonOfCounties compilation. These come
  from the older estimate series, so expect a small step between 2019 and 2020.
- **Race, ethnicity and age**: American Community Survey 2019-2023, table DP05
  (`dp05_places.csv`, `dp05_counties.csv`). These are survey averages with real sampling
  error, which is large for the smallest towns. Race groups are non-Hispanic so the five
  shares add to 100. One town (Victoria) has no surveyed residents and shows blanks.
- **Income, poverty, education**: counties only, about 2019, from JsonOfCounties. Not
  available for cities and towns yet (ACS tables DP03 and DP02 would add them).
- **Presidential results, 2008-2024**: tonmcg county-level dataset. Its 2012 and 2016
  Arkansas totals run about 1% below the certified statewide counts.
- Election results are only published by county, so a city or town shows the results of the
  county where most of its residents live. 19 municipalities cross a county line.
- Cities and towns have no land area in these files, so density is county-only.
- Unincorporated communities (Census "CDPs") are left out.
