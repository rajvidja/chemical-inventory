import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { HTTPException } from "hono/http-exception";
import { catalogApi } from "./api/catalog";
import { chemicalsApi } from "./api/chemicals";
import { importsApi } from "./api/imports";
import { closeDb, getDb, ROOT } from "./db";
import { seedIfEmpty } from "./seed";

const PORT = Number(process.env.PORT ?? 8787);
const isProd = process.env.NODE_ENV === "production";

const db = await getDb();
await db.transaction((tx) => seedIfEmpty(tx));

const app = new Hono();
app.use("*", compress());

const api = new Hono()
  .get("/health", (c) => c.json({ ok: true }))
  .route("/", chemicalsApi)
  .route("/", catalogApi)
  .route("/", importsApi);

api.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: "Something went wrong on the server. Your data was not changed." }, 500);
});
app.route("/api", api);

const dist = path.join(ROOT, "dist");
if (isProd && existsSync(dist)) {
  app.use("/*", serveStatic({ root: path.relative(process.cwd(), dist) }));
  const indexHtml = readFileSync(path.join(dist, "index.html"), "utf8");
  app.get("*", (c) => c.html(indexHtml));
}

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`ChemStock API listening on http://localhost:${info.port}`);
});

const shutdown = async () => {
  server.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
