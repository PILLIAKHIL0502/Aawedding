// Dev server: assembles index.html from partials on every request (no build step).
// Usage: PORT=8080 node scripts/dev.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { assemble, ROOT } from "./assemble.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".mp3": "audio/mpeg", ".json": "application/json", ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
      return res.end(assemble());
    }
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) throw new Error("outside root");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(port, () => console.log(`dev server → http://localhost:${port}`));
