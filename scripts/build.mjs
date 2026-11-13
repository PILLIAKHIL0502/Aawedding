// Production build → dist/ (what Vercel serves).
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assemble, ROOT } from "./assemble.mjs";

const OUT = join(ROOT, "dist");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), assemble());
for (const dir of ["assets", "css", "js", "vendor"]) {
  if (existsSync(join(ROOT, dir))) cpSync(join(ROOT, dir), join(OUT, dir), { recursive: true });
}
console.log("Built dist/");
