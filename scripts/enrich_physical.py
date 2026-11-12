"""Add density (g/cm³) and room-temperature phase to data/pubchem.json.

Reads PubChem's experimental properties for each confirmed compound. Phase at 25 °C comes from the
melting and boiling points: above the melting point and below the boiling point is liquid, above the
boiling point is gas, below the melting point is solid. A physical-description line is used only when
those temperatures are missing and it names exactly one phase. Nothing is guessed from the name.

Re-running skips compounds already marked physical_checked.
"""

import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "pubchem.json"
ROOM_C = 25
HEADINGS = {"Density", "Physical Description", "Melting Point", "Boiling Point"}


def session_get(sess, url):
    for attempt in range(5):
        r = sess.get(url, timeout=40)
        if r.status_code in (429, 503):
            time.sleep(2 + attempt * 2)
            continue
        return r
    return r


def to_c(text):
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*°\s*([CF])", text)
    if not m:
        return None
    v = float(m.group(1))
    return v if m.group(2) == "C" else (v - 32) * 5 / 9


def median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2]


def walk(section, bag):
    heading = section.get("TOCHeading")
    if heading in HEADINGS:
        bag.setdefault(heading, []).extend(section.get("Information") or [])
    for child in section.get("Section") or []:
        walk(child, bag)


def temps_c(infos):
    vals = []
    for inf in infos:
        val = inf.get("Value") or {}
        nums = val.get("Number")
        if nums is not None and val.get("Unit") == "°C":
            vals.extend(nums if isinstance(nums, list) else [nums])
        for s in val.get("StringWithMarkup") or []:
            c = to_c(s.get("String") or "")
            if c is not None:
                vals.append(c)
    return [v for v in vals if -273 < v < 2000]


def strings(infos):
    out = []
    for inf in infos:
        for s in (inf.get("Value") or {}).get("StringWithMarkup") or []:
            if s.get("String"):
                out.append(s["String"])
    return out


def density_g_cm3(infos):
    for text in strings(infos):
        m = re.search(r"(\d+(?:\.\d+)?)\s*g\s*/\s*(?:cu\s*cm|cm3|cm³|ml|mL|cc)\b", text, re.I)
        if m and 0.1 <= float(m.group(1)) <= 25:
            return round(float(m.group(1)), 4)
        m = re.search(r"relative density\s*(?:\(water\s*=\s*1\))?\s*:?\s*(\d+(?:\.\d+)?)", text, re.I)
        if m and 0.1 <= float(m.group(1)) <= 25:
            return round(float(m.group(1)), 4)
        m = re.match(r"(\d+(?:\.\d+)?)\s+at\s+-?\d", text)
        if m and 0.4 <= float(m.group(1)) <= 22:
            return round(float(m.group(1)), 4)
    return None


def phase_from_text(infos):
    words = {"solid": "solid", "crystal": "solid", "powder": "solid", "liquid": "liquid", "oil": "liquid", "gas": "gas", "vapor": "gas", "vapour": "gas"}
    hits = set()
    for text in strings(infos):
        if text.count(";") > 2:
            continue
        found = {phase for word, phase in words.items() if re.search(rf"\b{word}", text, re.I)}
        if len(found) == 1:
            hits |= found
    return hits.pop() if len(hits) == 1 else None


def phase_at_room(mp, bp, descriptions):
    if mp is not None and mp > ROOM_C:
        return "solid"
    if bp is not None and bp < ROOM_C:
        return "gas"
    if mp is not None and mp <= ROOM_C and (bp is None or bp >= ROOM_C):
        return "liquid"
    return phase_from_text(descriptions)


def parse(record):
    bag = {}
    for section in record.get("Record", {}).get("Section") or []:
        walk(section, bag)
    mp = temps_c(bag.get("Melting Point", []))
    bp = temps_c(bag.get("Boiling Point", []))
    return {
        "density": density_g_cm3(bag.get("Density", [])),
        "phase": phase_at_room(median(mp) if mp else None, median(bp) if bp else None, bag.get("Physical Description", [])),
    }


def main():
    cache = json.loads(OUT.read_text())
    todo = [cas for cas, v in cache.items() if v and v.get("cas_confirmed") and not v.get("physical_checked")]
    print(f"{len(todo)} compounds to fetch", flush=True)
    sess = requests.Session()
    for i, cas in enumerate(todo):
        cid = cache[cas]["cid"]
        r = session_get(sess, f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON?heading=Experimental%20Properties")
        got = parse(r.json()) if r.ok else {"density": None, "phase": None}
        cache[cas]["density"] = got["density"]
        cache[cas]["phase"] = got["phase"]
        cache[cas]["physical_checked"] = True
        if i % 20 == 0:
            OUT.write_text(json.dumps(dict(sorted(cache.items())), indent=1))
            print(f"  {i}/{len(todo)} {cas} density={got['density']} phase={got['phase']}", flush=True)
        time.sleep(0.2)
    OUT.write_text(json.dumps(dict(sorted(cache.items())), indent=1))
    filled = [v for v in cache.values() if v and v.get("physical_checked")]
    print(f"done: {sum(v.get('density') is not None for v in filled)} with density, {sum(v.get('phase') is not None for v in filled)} with phase")


if __name__ == "__main__":
    sys.exit(main())
