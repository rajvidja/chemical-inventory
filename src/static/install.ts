import type { Hono } from "hono";

/**
 * Static build: answers /api requests in the page with the same Hono routes the Node server uses,
 * backed by an in-browser database. Nothing is sent to a server.
 */
export function installStaticApi() {
  const realFetch = window.fetch.bind(window);
  let app: Promise<Hono> | null = null;
  const load = () => (app ??= import("../../server/app").then((m) => m.createApi() as unknown as Hono));

  window.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
    url.pathname = url.pathname.slice(4);
    return (await load()).fetch(new Request(url, req));
  };

  // Export links are plain downloads in the server build; here they have to go through fetch.
  document.addEventListener("click", async (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/api/"]');
    if (!a || e.defaultPrevented) return;
    e.preventDefault();
    const res = await fetch(a.href);
    const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "chemstock-export";
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: name });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  });
}
