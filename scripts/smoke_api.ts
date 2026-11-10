/**
 * End-to-end smoke test of every write path in the API.
 * Run against a throwaway instance, never the real inventory:
 *   CHEMSTOCK_DATA_DIR=/tmp/chem-test PORT=8799 npx tsx server/index.ts
 *   BASE=http://localhost:8799 npx tsx scripts/smoke_api.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:8799";
if (BASE.endsWith(":8787")) throw new Error("Refusing to run mutation tests against the main instance");

let failed = 0;
const check = (ok: unknown, label: string, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failed++;
};

async function call<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(BASE + "/api" + url, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* binary export */
  }
  return { status: res.status, data };
}

const search = async (q: string, extra = "") => (await call("GET", `/search?q=${encodeURIComponent(q)}${extra}`)).data;

// Duplicate CAS prevention
const dmso = (await search("DMSO")).items[0];
const dup = await call("POST", "/chemicals", { name: "DMSO again", cas: "67685" });
check(dup.status === 409 && dup.data.existing?.[0]?.id === dmso.id, "duplicate CAS is rejected with the existing record", `status ${dup.status}`);

// Create
const created = await call("POST", "/chemicals", {
  name: "Smoke Test Reagent",
  cas: "7647-14-5",
  synonyms: ["STR-1"],
  containers: [{ brand: "TestCo", packSize: "250 g", remainingPercentage: 60, location: "ZZ9" }],
});
const sodiumChloride = await search("7647-14-5");
const allowed = created.status === 201 || (created.status === 409 && sodiumChloride.total > 0);
check(allowed, "create chemical (or 409 if NaCl already exists)", `status ${created.status}`);
const chem =
  created.status === 201
    ? created.data
    : (await call("POST", "/chemicals", { name: "Smoke Test Reagent", cas: "7647-14-5", allowDuplicateCas: true, synonyms: ["STR-1"], containers: [{ brand: "TestCo", packSize: "250 g", remainingPercentage: 60, location: "ZZ9" }] })).data;
check(chem.containers?.length === 1 && chem.containers[0].location === "ZZ9", "container created with new location");
check((await search("STR-1")).items.some((i: any) => i.id === chem.id), "manual synonym is searchable");
check((await search("ZZ9")).items.some((i: any) => i.id === chem.id), "new location is searchable");

// Container lifecycle
const cid = chem.containers[0].id;
let r = await call("PATCH", `/containers/${cid}`, { remainingPercentage: 15 });
check(r.data.containers?.[0]?.status === "low", "availability update recalculates status", r.data.containers?.[0]?.status);
r = await call("PATCH", `/containers/${cid}`, { location: "ZZ10" });
check(r.data.containers?.[0]?.location === "ZZ10", "location change");
r = await call("POST", `/chemicals/${chem.id}/containers`, { brand: "Other", packSize: "1 kg", remainingPercentage: 100, location: "ZZ10" });
check(r.status === 201 && r.data.containers.length === 2, "add container");
r = await call("PATCH", `/containers/${cid}`, { remainingPercentage: 0 });
check(r.data.containers.find((c: any) => c.id === cid)?.status === "out", "mark unavailable");
check(r.data.activity.some((a: any) => a.action === "marked_unavailable"), "activity log records the change");
const alerts = (await call("GET", "/alerts?status=out")).data.items;
check(alerts.some((a: any) => a.containerId === cid && a.otherAvailable === 1), "alerts list the empty container and note other stock");
r = await call("DELETE", `/containers/${cid}`);
check(r.status === 200 && r.data.containers.length === 1, "delete container");

// Classification
const meta = (await call("GET", "/meta")).data;
const solvents = meta.categories.find((c: any) => c.slug === "organic-solvents");
const inorganic = meta.categories.find((c: any) => c.slug === "inorganic-chemicals");
r = await call("PUT", `/chemicals/${chem.id}/classification`, { categoryIds: [solvents.id, inorganic.id], primaryCategoryId: inorganic.id, tags: ["smoke-tag"] });
check(r.data.categories.length === 2 && r.data.categories.find((c: any) => c.isPrimary)?.slug === "inorganic-chemicals", "multi-category with primary");
check((await search("", "&tag=smoke-tag")).items.some((i: any) => i.id === chem.id), "tag filter");

// Custom category create / delete with Unclassified fallback
const cat = await call("POST", "/categories", { name: "Smoke Category" });
check(cat.status === 201, "create category", `status ${cat.status}`);
r = await call("PUT", `/chemicals/${chem.id}/classification`, { categoryIds: [cat.data.id] });
await call("DELETE", `/categories/${cat.data.id}`);
r = await call("GET", `/chemicals/${chem.id}`);
check(r.data.categories.some((c: any) => c.slug === "unclassified"), "deleting a category moves orphans to Unclassified");

// Thresholds
await call("PUT", "/settings", { goodAbove: 50, lowBelow: 20 });
r = await call("POST", `/chemicals/${chem.id}/containers`, { brand: "T", packSize: "1 g", remainingPercentage: 25 });
const c25 = r.data.containers.find((c: any) => c.remainingPercentage === 25);
check(c25.status === "moderate", "25% is moderate with default thresholds");
await call("PUT", "/settings", { goodAbove: 60, lowBelow: 30 });
r = await call("GET", `/chemicals/${chem.id}`);
check(r.data.containers.find((c: any) => c.id === c25.id).status === "low", "25% becomes low after changing thresholds");
check((await call("PUT", "/settings", { goodAbove: 20, lowBelow: 40 })).status === 400, "invalid thresholds rejected");
await call("PUT", "/settings", { goodAbove: 50, lowBelow: 20 });

// Review resolution
const review = (await call("GET", "/review?status=needs_review")).data;
const rec = review.items[0];
if (!rec) throw new Error("No review rows left – run this against a fresh data directory");
r = await call("POST", `/import-records/${rec.id}/resolve`, {
  containers: [
    { brand: "Finar", packSize: "500 mL", remainingPercentage: 80, location: "R1" },
    { brand: "SRL", packSize: "500 mL", remainingPercentage: 70, location: "R3" },
  ],
});
check(r.status === 200 && r.data.containers.filter((c: any) => !c.needsReview).length === 2 && r.data.status !== "review", "resolve review row into containers");
const afterReview = (await call("GET", "/review?status=needs_review")).data;
check(afterReview.items.length === review.items.length - 1, "review queue shrinks");

// Merge
const dupGroup = review.duplicates[0];
r = await call("POST", `/chemicals/${dupGroup.ids[0]}/merge`, { sourceId: dupGroup.ids[1] });
check(r.status === 200 && r.data.synonyms.some((s: any) => s.synonym === dupGroup.names[1]), "merge keeps other name as synonym");
check((await call("GET", `/chemicals/${dupGroup.ids[1]}`)).status === 404, "merged record removed");

// Locations
const loc = await call("POST", "/locations", { name: "ZZ-NEW", description: "Smoke shelf" });
check(loc.status === 201, "create location");
check((await call("POST", "/locations", { name: "zz-new" })).status === 409, "duplicate location name rejected (case-insensitive)");
const zz10 = (await call("GET", "/meta")).data.locations.find((l: any) => l.name === "ZZ10");
await call("PATCH", `/locations/${zz10.id}`, { name: "ZZ11" });
check((await search("ZZ11")).items.some((i: any) => i.id === chem.id), "renamed location is searchable");

// Import: re-uploading the source file detects every row as already present
const file = readFileSync(path.join(import.meta.dirname, "..", "data", "Chemical Inventory - Merged_updated.xlsx"));
const fd = new FormData();
fd.append("file", new Blob([file]), "reimport.xlsx");
const prev = await call("POST", "/import/preview", fd);
check(prev.status === 200 && prev.data.summary.total === 622, "import preview parses 622 rows");
check(prev.data.summary.existingDuplicates >= 600, "re-import flags existing CAS matches", String(prev.data.summary.existingDuplicates));
const skipAll = Object.fromEntries(prev.data.rows.map((x: any) => [x.rowNumber, { mode: "skip" }]));
const firstNew = prev.data.rows.find((x: any) => !x.existingMatches.length && x.status !== "error");
if (firstNew) delete skipAll[firstNew.rowNumber];
const before = (await call("GET", "/dashboard")).data.stats.totalRecords;
r = await call("POST", "/import/commit", { token: prev.data.token, decisions: skipAll });
const after = (await call("GET", "/dashboard")).data.stats.totalRecords;
check(r.status === 200 && after - before === (firstNew ? 1 : 0), "commit honours per-row skip decisions", `${before} → ${after}`);
const bad = new FormData();
bad.append("file", new Blob(["a,b\n1,2"]), "bad.csv");
check((await call("POST", "/import/preview", bad)).status === 400, "file without required columns is rejected");

// Export
const csvBytes = Buffer.from(await (await fetch(BASE + "/api/export?format=csv")).arrayBuffer());
const csvText = csvBytes.toString("utf8");
check(csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf && csvText.includes("Chemical Name"), "CSV export with BOM and headers");
const xlsx = await fetch(BASE + "/api/export?format=xlsx");
check(xlsx.ok && (xlsx.headers.get("content-type") ?? "").includes("spreadsheet"), "XLSX export");

// Expiry dates
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
check((await call("POST", `/chemicals/${chem.id}/containers`, { brand: "X", expiryDate: "31/12/2026" })).status === 400, "malformed expiry date rejected");
r = await call("POST", `/chemicals/${chem.id}/containers`, { brand: "Exp", packSize: "10 g", remainingPercentage: 50, expiryDate: isoIn(10) });
const expC = r.data.containers.find((c: any) => c.brand === "Exp");
check(expC?.expiryDate === isoIn(10), "container stores expiry date", expC?.expiryDate);
let dash = (await call("GET", "/dashboard")).data;
check(dash.expiring.some((e: any) => e.containerId === expC.id && e.daysLeft === 10) && dash.attention.expiringSoon >= 1, "dashboard lists container expiring in 10 days");
await call("PATCH", `/containers/${expC.id}`, { expiryDate: isoIn(-3) });
dash = (await call("GET", "/dashboard")).data;
check(dash.attention.expired >= 1 && dash.expiring.find((e: any) => e.containerId === expC.id)?.daysLeft === -3, "expired container counted");
check((await fetch(BASE + "/api/export?format=csv").then((x) => x.text())).includes(isoIn(-3)), "export includes expiry date");
await call("DELETE", `/containers/${expC.id}`);

// Alert priority
check((await call("PUT", `/chemicals/${chem.id}/priority`, { priority: "urgent" })).status === 400, "invalid priority rejected");
r = await call("PUT", `/chemicals/${chem.id}/priority`, { priority: "critical" });
check(r.data.priority === "critical", "mark chemical critical");
check((await search("STR-1")).items.find((i: any) => i.id === chem.id)?.priority === "critical", "priority included in search results");

// Reorder workflow (per chemical)
for (const c of r.data.containers) await call("PATCH", `/containers/${c.id}`, { remainingPercentage: c.brand === "Other" ? 5 : 0 });
dash = (await call("GET", "/dashboard")).data;
check(dash.reorder[0]?.chemicalId === chem.id, "critical low chemical is first in the reorder list", dash.reorder[0]?.name);
const lowBefore = dash.attention.low;
check(dash.attention.critical >= 1, "critical count in needs attention");
r = await call("POST", `/chemicals/${chem.id}/reorder`, { supplier: "Smoke Supplies", expectedOn: isoIn(7) });
check(r.status === 201 && r.data.order?.supplier === "Smoke Supplies", "mark as ordered");
check((await call("POST", `/chemicals/${chem.id}/reorder`, {})).status === 409, "second open order rejected");
dash = (await call("GET", "/dashboard")).data;
check(dash.attention.low === lowBefore - 1 && dash.attention.ordered >= 1, "ordered chemical stops counting as urgent", `${lowBefore} → ${dash.attention.low}`);
check(dash.reorder[0]?.chemicalId !== chem.id, "ordered chemical drops below unordered ones in the reorder list");
check((await call("GET", "/reorders")).data.items.some((x: any) => x.chemicalId === chem.id), "open orders endpoint lists it");
check((await call("GET", "/alerts?status=low,out")).data.items.filter((a: any) => a.chemicalId === chem.id).every((a: any) => a.order), "alerts carry the open order");
const orderId = r.data.order.id;
r = await call("PATCH", `/reorders/${orderId}`, { status: "received" });
check(r.status === 200 && r.data.order === null && r.data.activity.some((a: any) => a.action === "reorder_received"), "mark order received");
check((await call("PATCH", `/reorders/${orderId}`, { status: "cancelled" })).status === 404, "closed order cannot change again");

// Merge carries an open order across
const mA = (await call("POST", "/chemicals", { name: "Smoke Merge A" })).data;
const mB = (await call("POST", "/chemicals", { name: "Smoke Merge B" })).data;
await call("POST", `/chemicals/${mB.id}/reorder`, {});
await call("PUT", `/chemicals/${mB.id}/priority`, { priority: "watchlist" });
r = await call("POST", `/chemicals/${mA.id}/merge`, { sourceId: mB.id });
check(r.data.order !== null && r.data.priority === "watchlist", "merge keeps the source's open order and priority");
await call("DELETE", `/chemicals/${mA.id}`);

// Incompatibility warnings use verified hazard data only
check((await call("GET", `/chemicals/${chem.id}/location-check?location=ZZ11`)).data.hasVerifiedHazard === false, "no verified hazard: compatibility not checked");
await call("PATCH", `/chemicals/${chem.id}`, { hazardClassification: "H272 May intensify fire; oxidiser", hazardSource: "smoke test SDS" });
const flam = (await call("POST", "/chemicals", { name: "Smoke Flammable", hazardClassification: "H225 Highly flammable liquid and vapour", hazardSource: "smoke test SDS" })).data;
r = await call("GET", `/chemicals/${flam.id}/location-check?location=zz11`);
check(r.data.conflicts.some((x: any) => x.chemicalId === chem.id && x.reason === "flammable next to oxidizer"), "flammable next to oxidizer is flagged", JSON.stringify(r.data.conflicts));
check((await call("GET", `/chemicals/${flam.id}/location-check?location=ZZ-NEW`)).data.conflicts.length === 0, "empty shelf has no conflicts");
await call("DELETE", `/chemicals/${flam.id}`);

// Daily count snapshots
dash = (await call("GET", "/dashboard")).data;
check(dash.trend.attentionDelta === null && dash.trend.since === null, "no earlier snapshot yet: trend is collecting data");
const hist = (await call("GET", "/insights")).data.history;
check(hist.length === 1 && hist[0].day === isoIn(0) && hist[0].low === dash.attention.low && hist[0].out === dash.attention.out, "today's snapshot matches the live counts", JSON.stringify(hist));

// Delete chemical keeps provenance
r = await call("DELETE", `/chemicals/${chem.id}`);
check(r.status === 200 && (await call("GET", `/chemicals/${chem.id}`)).status === 404, "delete chemical");

console.log(failed ? `\n${failed} check(s) failed` : "\nAll API checks passed");
process.exit(failed ? 1 : 0);
