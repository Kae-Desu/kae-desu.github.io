// Static site builder: turns the Obsidian vault in content/ into _site/.
//
//   content/<section>/<note>.md   -> post, listed on the home page and under /<section>/
//   content/<page>.md             -> standalone page at /<page>/, linked in the nav
//   content/<section>/_section.md -> section settings (title, description, order) + intro text
//   anything else (images, pdfs)  -> copied to the same path, e.g. content/assets/x.png -> /assets/x.png
//
// Files and folders starting with "." or "_" (e.g. .obsidian, _templates) are otherwise ignored.

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import * as pagefind from "pagefind";
import * as T from "./templates.mjs";

const { slugify } = T;

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "_site");

const titleCase = (s) => s.replace(/[-_]+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const stripHtml = (html) =>
  html
    .replace(/<a class="anchor"[^>]*>#<\/a>/g, "")
    .replace(/<(script|style|pre)[\s\S]*?<\/\1>/g, " ")
    .replace(/<\/(p|li|h\d|div|td|th|tr|blockquote|summary)>|<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

// --- content discovery -------------------------------------------------------

async function walk(dir, rel = "") {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), relPath)));
    else out.push(relPath);
  }
  return out;
}

function gitCreatedDate(file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%aI", "--", file], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const last = out.split("\n").pop();
    return last ? new Date(last) : null;
  } catch {
    return null;
  }
}

async function resolveDate(data, absPath) {
  const raw = data.date ?? data.created ?? data.published;
  if (raw) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!isNaN(d)) return d;
  }
  return gitCreatedDate(absPath) ?? (await fs.stat(absPath)).mtime;
}

const asList = (v) =>
  v == null ? [] : (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean);

// --- markdown (with Obsidian syntax) ----------------------------------------

// Lookup tables filled before rendering so wikilinks can resolve to any note or asset.
const notesByKey = new Map(); // lowercase basename / title -> note
const assetsByName = new Map(); // lowercase filename -> [relPath]
let current = null; // note being rendered

function findAsset(name, fromDir) {
  const key = name.toLowerCase();
  // Exact relative path first (e.g. ![[img/diagram.png]] or ![](./img/x.png)).
  for (const candidate of [path.posix.join(fromDir, name), path.posix.normalize(name)]) {
    if (assetsByName.has(`path:${candidate.toLowerCase()}`)) return assetsByName.get(`path:${candidate.toLowerCase()}`);
  }
  // Otherwise behave like Obsidian's "shortest path": match by filename, prefer the note's folder.
  const hits = assetsByName.get(path.posix.basename(key)) ?? [];
  return hits.find((h) => path.posix.dirname(h) === fromDir) ?? hits[0] ?? null;
}

const assetUrl = (rel) => `/${encodePath(rel)}`;

function resolveNote(target) {
  const [name, heading] = target.split("#");
  const note = notesByKey.get(path.posix.basename(name.trim()).replace(/\.md$/i, "").toLowerCase());
  if (!note) return null;
  return { note, href: note.url + (heading ? `#${slugify(heading)}` : "") };
}

function missing(kind, target) {
  console.warn(`  ! ${current?.source}: unresolved ${kind} "${target}"`);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;

function embedHtml(target) {
  const [rawName, opt] = target.split("|");
  const name = rawName.trim();
  if (!/\.[a-z0-9]+$/i.test(name) || name.toLowerCase().endsWith(".md")) {
    // Note embed: we don't transclude, just link to it.
    return linkHtml(target);
  }
  const rel = findAsset(name, current.dir);
  if (!rel) {
    missing("embed", name);
    return `<span class="broken">${T.esc(name)}</span>`;
  }
  const src = assetUrl(rel);
  if (!IMAGE_EXT.test(name)) return `<a href="${src}">${T.esc(path.posix.basename(name))}</a>`;
  // Obsidian sizing: ![[img.png|300]] or ![[img.png|300x200]]; anything else is alt text.
  const size = /^\s*(\d+)(?:x(\d+))?\s*$/.exec(opt ?? "");
  const attrs = size ? ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ""}` : "";
  const alt = size ? path.posix.basename(name) : (opt ?? path.posix.basename(name));
  return `<img src="${src}" alt="${T.esc(alt)}"${attrs} loading="lazy">`;
}

function linkHtml(target) {
  const [ref, alias] = target.split("|");
  const hit = resolveNote(ref);
  const label = T.esc(alias ?? ref.replace(/#/, " › "));
  if (!hit) {
    missing("link", ref);
    return `<span class="broken" title="Note not published">${label}</span>`;
  }
  return `<a href="${hit.href}">${label}</a>`;
}

const marked = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  }),
);

marked.use({
  gfm: true,
  extensions: [
    {
      name: "wikiEmbed",
      level: "inline",
      start: (src) => src.indexOf("![["),
      tokenizer(src) {
        const m = /^!\[\[([^\]\n]+)\]\]/.exec(src);
        if (m) return { type: "wikiEmbed", raw: m[0], target: m[1] };
      },
      renderer: (tok) => embedHtml(tok.target),
    },
    {
      name: "wikiLink",
      level: "inline",
      start: (src) => src.indexOf("[["),
      tokenizer(src) {
        const m = /^\[\[([^\]\n]+)\]\]/.exec(src);
        if (m) return { type: "wikiLink", raw: m[0], target: m[1] };
      },
      renderer: (tok) => linkHtml(tok.target),
    },
    {
      name: "highlightMark",
      level: "inline",
      start: (src) => src.indexOf("=="),
      tokenizer(src) {
        const m = /^==(?=\S)([^\n]*?\S)==/.exec(src);
        if (m) return { type: "highlightMark", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(tok) {
        return `<mark>${this.parser.parseInline(tok.tokens)}</mark>`;
      },
    },
    {
      // Obsidian inline tags: "#tag" or "#nested/tag" preceded by whitespace.
      name: "inlineTag",
      level: "inline",
      start(src) {
        const m = /(^|\s)#[\p{L}_][\p{L}\p{N}_/-]*/u.exec(src);
        return m ? m.index + m[1].length : undefined;
      },
      tokenizer(src) {
        const m = /^#([\p{L}_][\p{L}\p{N}_/-]*)/u.exec(src);
        if (m) return { type: "inlineTag", raw: m[0], tag: m[1] };
      },
      renderer(tok) {
        current.inlineTags.add(tok.tag);
        return `<a class="tag" href="/tags/${slugify(tok.tag)}/">#${T.esc(tok.tag)}</a>`;
      },
    },
  ],
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const id = slugify(stripHtml(html));
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
    },
    image({ href, title, text }) {
      let src = href;
      if (!/^([a-z]+:|\/|#)/i.test(href)) {
        const rel = findAsset(decodeURI(href.replace(/^<|>$/g, "")), current.dir);
        if (rel) src = assetUrl(rel);
        else missing("image", href);
      }
      return `<img src="${T.esc(src)}" alt="${T.esc(text)}"${title ? ` title="${T.esc(title)}"` : ""} loading="lazy">`;
    },
    link({ href, title, tokens }) {
      let target = href;
      // Relative links to other notes: [text](other-note.md#heading)
      if (!/^([a-z]+:|\/|#)/i.test(href) && /\.md(#|$)/i.test(href)) {
        const hit = resolveNote(decodeURI(href));
        if (hit) target = hit.href;
        else missing("link", href);
      }
      const external = /^https?:/i.test(target);
      return `<a href="${T.esc(target)}"${title ? ` title="${T.esc(title)}"` : ""}${external ? ' rel="noopener"' : ""}>${this.parser.parseInline(tokens)}</a>`;
    },
    blockquote({ tokens }) {
      const body = this.parser.parse(tokens);
      // Obsidian callouts: > [!note] Optional title   (+/- after ] makes it foldable)
      const m = /^<p>\[!([\w-]+)\]([+-]?)[ \t]*(.*?)(\n|<\/p>\n?)/.exec(body);
      if (!m) return `<blockquote>\n${body}</blockquote>\n`;
      const type = m[1].toLowerCase();
      const title = m[3] || titleCase(type);
      let rest = body.slice(m[0].length);
      if (m[4] === "\n") rest = `<p>${rest}`;
      rest = rest.trim() ? `<div class="callout-body">${rest}</div>` : "";
      if (m[2]) {
        return `<details class="callout" data-callout="${T.esc(type)}"${m[2] === "+" ? " open" : ""}><summary class="callout-title">${title}</summary>${rest}</details>\n`;
      }
      return `<div class="callout" data-callout="${T.esc(type)}"><p class="callout-title">${title}</p>${rest}</div>\n`;
    },
  },
});

// Strip Obsidian %%comments%% outside fenced and inline code.
const stripComments = (md) =>
  md
    .split(/(^(?:```|~~~)[\s\S]*?^(?:```|~~~)|`[^`\n]+`)/m)
    .map((chunk, i) => (i % 2 ? chunk : chunk.replace(/%%[\s\S]*?%%/g, "")))
    .join("");

// --- build ---------------------------------------------------------------------

export async function build() {
  const started = performance.now();
  const config = JSON.parse(await fs.readFile(path.join(ROOT, "site.config.json"), "utf8"));
  notesByKey.clear();
  assetsByName.clear();

  const files = await walk(CONTENT).catch(() => []);
  const notes = [];
  const assets = [];

  for (const rel of files) {
    if (!rel.toLowerCase().endsWith(".md")) {
      assets.push(rel);
      const byName = path.posix.basename(rel).toLowerCase();
      if (!assetsByName.has(byName)) assetsByName.set(byName, []);
      assetsByName.get(byName).push(rel);
      assetsByName.set(`path:${rel.toLowerCase()}`, rel);
      continue;
    }
    const abs = path.join(CONTENT, rel);
    const { data, content } = matter(await fs.readFile(abs, "utf8"));
    if (data.draft === true || data.publish === false) continue;

    const parts = rel.split("/");
    const base = path.posix.basename(rel, path.posix.extname(rel));
    const isPage = parts.length === 1;
    const section = isPage ? null : parts[0];
    const slug = slugify(data.slug ?? base);
    const note = {
      source: rel,
      dir: path.posix.dirname(rel),
      kind: isPage ? "page" : "post",
      section,
      slug,
      url: isPage ? `/${slug}/` : `/${slugify(section)}/${slug}/`,
      title: String(data.title ?? base),
      date: await resolveDate(data, abs),
      updated: data.updated ? new Date(data.updated) : null,
      tags: asList(data.tags),
      cover: data.cover ?? data.image ?? null,
      description: data.description ?? data.excerpt ?? null,
      order: Number(data.order ?? 0),
      body: stripComments(content),
      inlineTags: new Set(),
    };
    notes.push(note);
    for (const alias of [base, note.title, ...asList(data.aliases)]) {
      const key = alias.toLowerCase();
      if (!notesByKey.has(key)) notesByKey.set(key, note);
    }
  }

  // Render after every note is known so cross-links resolve.
  for (const note of notes) {
    current = note;
    note.html = marked.parse(note.body);
    note.tags = [...new Set([...note.tags, ...note.inlineTags])];
    const text = stripHtml(note.html);
    note.readingMinutes = Math.max(1, Math.round(text.split(" ").length / 220));
    if (!note.description) {
      const words = text.split(" ");
      note.excerpt = words.slice(0, 50).join(" ") + (words.length > 50 ? " […]" : "");
    } else note.excerpt = note.description;
    if (note.cover) {
      const rel = /^([a-z]+:|\/)/i.test(note.cover) ? null : findAsset(note.cover.replace(/^!?\[\[|\]\]$/g, ""), note.dir);
      note.coverUrl = rel ? assetUrl(rel) : note.cover;
    }
  }
  current = null;

  const posts = notes.filter((n) => n.kind === "post").sort((a, b) => b.date - a.date);
  const pages = notes.filter((n) => n.kind === "page").sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const sections = [];
  for (const key of new Set(posts.map((p) => p.section))) {
    const rel = `${key}/_section.md`;
    const raw = await fs.readFile(path.join(CONTENT, rel), "utf8").catch(() => null);
    const { data, content } = raw ? matter(raw) : { data: {}, content: "" };
    current = { source: rel, dir: key, inlineTags: new Set() };
    sections.push({
      key,
      slug: slugify(key),
      title: String(data.title ?? titleCase(key)),
      description: String(data.description ?? ""),
      introHtml: content.trim() ? marked.parse(stripComments(content)) : "",
      order: Number(data.order ?? 0),
      posts: posts.filter((p) => p.section === key),
    });
  }
  current = null;
  sections.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const sectionByKey = Object.fromEntries(sections.map((s) => [s.key, s]));
  for (const p of posts) p.sectionInfo = sectionByKey[p.section];

  const tagMap = new Map();
  for (const p of posts)
    for (const t of p.tags) {
      const slug = slugify(t);
      if (!tagMap.has(slug)) tagMap.set(slug, { name: t, slug, posts: [] });
      tagMap.get(slug).posts.push(p);
    }
  const tags = [...tagMap.values()].sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));

  const site = {
    ...config,
    nav: [...sections.map((s) => ({ title: s.title, url: `/${s.slug}/` })), ...pages.map((p) => ({ title: p.title, url: p.url }))],
  };

  // Write output fresh each build.
  await fs.rm(OUT, { recursive: true, force: true });
  const write = async (url, html) => {
    const file = path.join(OUT, url.endsWith("/") ? `${url}index.html` : url);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, html);
  };

  const perPage = config.perPage ?? 10;
  const paginate = async (list, baseUrl, render) => {
    const total = Math.max(1, Math.ceil(list.length / perPage));
    for (let i = 0; i < total; i++) {
      const url = i === 0 ? baseUrl : `${baseUrl}page/${i + 1}/`;
      const pager = {
        prev: i === 0 ? null : i === 1 ? baseUrl : `${baseUrl}page/${i}/`,
        next: i + 1 < total ? `${baseUrl}page/${i + 2}/` : null,
        current: i + 1,
        total,
      };
      await write(url, render(list.slice(i * perPage, (i + 1) * perPage), pager, url));
    }
  };

  await paginate(posts, "/", (items, pager, url) => T.listPage(site, { url, items, pager }));
  for (const s of sections) {
    await paginate(s.posts, `/${s.slug}/`, (items, pager, url) =>
      T.listPage(site, { url, items, pager, heading: s.title, intro: s.description, introHtml: s.introHtml }),
    );
  }
  for (const t of tags) {
    await paginate(t.posts, `/tags/${t.slug}/`, (items, pager, url) =>
      T.listPage(site, { url, items, pager, heading: `#${t.name}`, intro: `${t.posts.length} post${t.posts.length === 1 ? "" : "s"} tagged` }),
    );
  }
  await write("/tags/", T.tagsPage(site, tags));
  for (const [i, p] of posts.entries()) await write(p.url, T.postPage(site, p, { newer: posts[i - 1], older: posts[i + 1] }));
  for (const p of pages) await write(p.url, T.pagePage(site, p));
  await write("/404.html", T.notFoundPage(site));
  await write("/feed.xml", T.feed(site, posts.slice(0, 20)));
  await write("/sitemap.xml", T.sitemap(site, [{ url: "/" }, ...sections.map((s) => ({ url: `/${s.slug}/` })), ...pages, ...posts]));

  // Static files: theme assets + vault attachments.
  await fs.cp(SRC, OUT, { recursive: true });
  for (const rel of assets) {
    const dest = path.join(OUT, ...rel.split("/"));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(CONTENT, rel), dest);
  }
  await fs.writeFile(path.join(OUT, ".nojekyll"), "");

  // Full-text search index. Only elements marked data-pagefind-body (posts and pages) get indexed.
  const { index } = await pagefind.createIndex({ excludeSelectors: [".anchor", ".copy"] });
  await index.addDirectory({ path: OUT });
  await index.writeFiles({ outputPath: path.join(OUT, "pagefind") });
  await pagefind.close();

  const ms = Math.round(performance.now() - started);
  console.log(`Built ${posts.length} posts, ${pages.length} pages, ${sections.length} sections, ${tags.length} tags, ${assets.length} assets in ${ms}ms`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build();
}
