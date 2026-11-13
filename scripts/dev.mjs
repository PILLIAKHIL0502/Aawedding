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
    const type = TYPES[extname(file)] || "application/octet-stream";
    // Range requests let the browser seek in audio/video, as it can on Vercel.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      const size = body.length;
      let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== "" && range[2] !== "" ? Number(range[2]) : size - 1;
      if (start >= size || start < 0 || end < start) {
        res.writeHead(416, { "content-range": `bytes */${size}` });
        return res.end();
      }
      end = Math.min(end, size - 1);
      res.writeHead(206, {
        "content-type": type, "cache-control": "no-store", "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1,
      });
      return res.end(body.subarray(start, end + 1));
    }
    res.writeHead(200, { "content-type": type, "cache-control": "no-store", "accept-ranges": "bytes" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(port, () => console.log(`dev server → http://localhost:${port}`));
