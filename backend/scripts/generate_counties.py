"""
One-time script to generate backend/app/data/counties.py from the US Census Bureau.
Run from the backend directory:
    python scripts/generate_counties.py
"""
import os
import urllib.request
from collections import defaultdict

# Census FIPS county reference file (tab-separated, no header)
# Columns: STATE  STATEFP  COUNTYFP  COUNTYNAME  CLASSFP
URL = "https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt"

# Class codes that correspond to counties/parishes/boroughs (exclude cities, districts)
# H1=standard county, H4=independent city treated as county equivalent,
# H5=FIPS class for AK boroughs/census areas, H6=not applicable, C7=city
# We include all FIPS county-equivalents in each state
EXCLUDE_STATES = {"DC", "PR", "VI", "GU", "AS", "MP", "UM"}  # territories + DC + US Minor Outlying Islands


def fetch_counties():
    print("Fetching county data from Census Bureau...")
    with urllib.request.urlopen(URL, timeout=30) as r:
        text = r.read().decode("utf-8")

    counties_by_state = defaultdict(list)
    for line in text.splitlines():
        if not line.strip() or line.startswith("STATE"):
            continue
        parts = line.split("|")
        if len(parts) < 5:
            continue
        # Columns: STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT
        state_abbr, county_name = parts[0], parts[4]
        if state_abbr in EXCLUDE_STATES:
            continue
        counties_by_state[state_abbr].append(county_name.strip())

    # Sort counties alphabetically within each state
    for abbr in counties_by_state:
        counties_by_state[abbr].sort()

    return dict(sorted(counties_by_state.items()))


def write_output(counties):
    lines = ["COUNTIES: dict[str, list[str]] = {"]
    for state, county_list in counties.items():
        county_strs = ", ".join(f'"{c}"' for c in county_list)
        lines.append(f'    "{state}": [{county_strs}],')
    lines.append("}")

    content = "\n".join(lines) + "\n"
    out_path = os.path.join(os.path.dirname(__file__), "..", "app", "data", "counties.py")
    out_path = os.path.normpath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    total = sum(len(v) for v in counties.values())
    print(f"Written {out_path} — {len(counties)} states, {total} counties")


if __name__ == "__main__":
    counties = fetch_counties()
    write_output(counties)
