// Local preview: builds the site, serves _site/, and rebuilds when content changes.
// Polls instead of fs.watch because inotify doesn't see edits made from Windows
// (e.g. Obsidian) on a WSL /mnt/c path.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "./build.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "_site");
const WATCH = ["content", "src", "site.config.json"].map((p) => path.join(ROOT, p));
const PORT = Number(process.env.PORT ?? 4000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

async function signature(target) {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return "";
  if (!stat.isDirectory()) return `${target}:${stat.mtimeMs}:${stat.size}`;
  const parts = [];
  for (const entry of await fs.readdir(target)) {
    if (entry === ".obsidian" || entry === ".trash") continue;
    parts.push(await signature(path.join(target, entry)));
  }
  return parts.join("|");
}

let last = "";
let building = false;
async function rebuildIfChanged() {
  if (building) return;
  const sig = (await Promise.all(WATCH.map(signature))).join("||");
  if (sig === last) return;
  building = true;
  last = sig;
  try {
    await build();
  } catch (err) {
    console.error(err);
  } finally {
    building = false;
  }
}

await rebuildIfChanged();
setInterval(rebuildIfChanged, 1000);

http
  .createServer(async (req, res) => {
    let file = path.join(OUT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(OUT)) return res.writeHead(403).end();
    if ((await fs.stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(await fs.readFile(path.join(OUT, "404.html")).catch(() => "Not found"));
    }
  })
  .listen(PORT, () => console.log(`Preview at http://localhost:${PORT}`));
