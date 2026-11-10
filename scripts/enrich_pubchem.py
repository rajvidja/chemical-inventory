"""Fetch verified identity metadata from PubChem for every CAS number in the source Excel file.

Lookup is by CAS number only (never by chemical name). PubChem's name endpoint resolves a CAS
string to the compound that carries it as a synonym; the registry-number cross-reference is used as
a fallback. A CID is accepted only when PubChem's own synonym list contains the CAS number.

Output: data/pubchem.json
  { cas: { cid, title, formula, mw, iupac, smiles, cas_confirmed, synonyms[], match_names[] } | null }
Re-running only re-resolves CAS numbers that are missing or unconfirmed in the cache.
"""

import json
import re
import sys
import time
from pathlib import Path

import openpyxl
import requests

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "data" / "Chemical Inventory - Merged_updated.xlsx"
OUT = ROOT / "data" / "pubchem.json"
BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
JUNK_SYNONYM = re.compile(
    r"(UNII|EINECS|NSC|CHEMBL|DTXSID|DTXCID|CAS-|AI3-|BRN|HSDB|CCRIS|MFCD|ZINC|SCHEMBL|AKOS|"
    r"WLN|NCGC|InChI|Tox21|BIDD|KS-|EN300|STR|SBI|BDBM|CHEBI|Q\d|^\d)",
    re.I,
)


def session_get(sess, url, **kw):
    for attempt in range(5):
        r = sess.get(url, timeout=30, **kw) if "data" not in kw else sess.post(url, timeout=30, **kw)
        if r.status_code == 503 or r.status_code == 429:
            time.sleep(2 + attempt * 2)
            continue
        return r
    return r


def clean_synonyms(syns, cas):
    out = []
    seen = set()
    for s in syns[:60]:
        s = s.strip()
        if not s or len(s) > 48 or CAS_RE.match(s) or JUNK_SYNONYM.search(s):
            continue
        # drop catalogue-style codes like "AB12345" (letters+digits, no separators)
        if re.fullmatch(r"[A-Z]{1,4}-?\d{3,}", s):
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
        if len(out) >= 14:
            break
    return out


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True)
    ws = wb.active
    cas_numbers = sorted(
        {
            str(r[2]).strip()
            for r in ws.iter_rows(min_row=2, values_only=True)
            if r[2] and CAS_RE.match(str(r[2]).strip())
        }
    )
    cache = json.loads(OUT.read_text()) if OUT.exists() else {}
    confirmed = {c: v["cid"] for c, v in cache.items() if v and v.get("cas_confirmed")}
    todo = [c for c in cas_numbers if c not in confirmed]
    print(f"{len(cas_numbers)} unique CAS, {len(todo)} to resolve", flush=True)

    sess = requests.Session()
    candidates = {}
    for i, cas in enumerate(todo):
        ids = []
        for endpoint in (f"{BASE}/compound/name/{cas}/cids/JSON", f"{BASE}/compound/xref/RN/{cas}/cids/JSON"):
            r = session_get(sess, endpoint)
            if r.ok:
                ids += [x for x in r.json().get("IdentifierList", {}).get("CID", []) if x not in ids]
            time.sleep(0.21)
        candidates[cas] = ids[:6]
        if i % 25 == 0:
            print(f"  cid lookup {i}/{len(todo)}", flush=True)

    found = dict(confirmed)
    cid_list = sorted(set(found.values()) | {x for ids in candidates.values() for x in ids})
    props, syns = {}, {}
    for start in range(0, len(cid_list), 100):
        chunk = ",".join(map(str, cid_list[start : start + 100]))
        r = session_get(
            sess,
            f"{BASE}/compound/cid/property/Title,MolecularFormula,MolecularWeight,IUPACName,SMILES/JSON",
            data={"cid": chunk},
        )
        r.raise_for_status()
        for p in r.json()["PropertyTable"]["Properties"]:
            props[p["CID"]] = p
        r = session_get(sess, f"{BASE}/compound/cid/synonyms/JSON", data={"cid": chunk})
        r.raise_for_status()
        for info in r.json()["InformationList"]["Information"]:
            syns[info["CID"]] = info.get("Synonym", [])
        time.sleep(0.3)

    # pick the first candidate whose own synonym list carries the CAS number
    for cas, ids in candidates.items():
        match = next((x for x in ids if cas in syns.get(x, [])), None)
        if match:
            found[cas] = match
        else:
            cache[cas] = None

    for cas, cid in found.items():
        p = props.get(cid, {})
        all_syn = syns.get(cid, [])
        cache[cas] = {
            "cid": cid,
            "title": p.get("Title"),
            "formula": p.get("MolecularFormula"),
            "mw": float(p["MolecularWeight"]) if p.get("MolecularWeight") else None,
            "iupac": p.get("IUPACName"),
            "smiles": p.get("SMILES"),
            "cas_confirmed": cas in all_syn,
            "synonyms": clean_synonyms(all_syn, cas),
            "match_names": [s for s in all_syn[:80] if len(s) <= 80],
        }

    OUT.write_text(json.dumps(dict(sorted(cache.items())), indent=1))
    missing = [c for c, v in cache.items() if v is None]
    print(f"done: {len(cache) - len(missing)} matched, {len(missing)} not in PubChem: {missing}")


if __name__ == "__main__":
    sys.exit(main())
