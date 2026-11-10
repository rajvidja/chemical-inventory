import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { catalogApi } from "./api/catalog";
import { chemicalsApi } from "./api/chemicals";
import { importsApi } from "./api/imports";

/** The /api routes, shared by the Node server and the static (in-browser) build. */
export function createApi() {
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
  return api;
}
