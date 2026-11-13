// Stitches src/partials/*.html (sorted by filename) into one index.html.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARTIALS = join(ROOT, "src", "partials");

export function assemble() {
  return readdirSync(PARTIALS)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => {
      const html = readFileSync(join(PARTIALS, f), "utf8").trim();
      // nothing may precede <!doctype>, or browsers fall back to quirks mode
      return html.toLowerCase().startsWith("<!doctype") ? html : `<!-- ${f} -->\n${html}`;
    })
    .join("\n\n") + "\n";
}
