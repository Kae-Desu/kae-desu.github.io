// HTML templates. Plain template literals, no framework.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const slugify = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

const fmtDate = (d) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const isoDate = (d) => d.toISOString().slice(0, 10);

function layout(site, { title, description, url, body, ogImage }) {
  const fullTitle = title ? `${title} · ${site.title}` : site.title;
  const desc = description ?? site.description;
  const canonical = site.url.replace(/\/$/, "") + url;
  const nav = site.nav
    .map((n) => `<li><a href="${n.url}"${url.startsWith(n.url) ? ' aria-current="page"' : ""}>${esc(n.title)}</a></li>`)
    .join("");
  return `<!doctype html>
<html lang="${site.lang ?? "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0c0c0d">
<meta property="og:title" content="${esc(title ?? site.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
${ogImage ? `<meta property="og:image" content="${esc(new URL(ogImage, site.url).href)}">` : ""}
<link rel="alternate" type="application/atom+xml" title="${esc(site.title)}" href="/feed.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap">
<link rel="stylesheet" href="/style.css">
<script src="/main.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header box">
  <a class="site-title" href="/">${esc(site.title)}</a>
  <button class="menu-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
    <span></span><span></span><span></span>
  </button>
  <nav id="site-nav" aria-label="Main"><ul>${nav}</ul></nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <p>© ${new Date().getFullYear()} ${esc(site.author)} · Words &amp; images
  <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener">CC BY 4.0</a> ·
  <a href="/feed.xml">RSS</a> · <a href="/tags/">Tags</a></p>
</footer>
</body>
</html>
`;
}

const tagLinks = (tags) =>
  tags.length ? `<p class="tags">${tags.map((t) => `<a href="/tags/${slugify(t)}/">#${esc(t)}</a>`).join(", ")}</p>` : "";

function card(p) {
  return `<article class="card box">
  ${p.coverUrl ? `<a class="cover" href="${p.url}" tabindex="-1"><img src="${esc(p.coverUrl)}" alt="" loading="lazy"></a>` : ""}
  <time class="date" datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time>
  <h2 class="card-title"><a href="${p.url}">${esc(p.title)}</a></h2>
  <p class="excerpt">${esc(p.excerpt)}</p>
  <p class="category"><a href="/${p.sectionInfo.slug}/">${esc(p.sectionInfo.title)}</a></p>
  ${tagLinks(p.tags)}
</article>`;
}

function pagerHtml(pager) {
  if (pager.total <= 1) return "";
  return `<nav class="pager" aria-label="Pagination">
  ${pager.prev ? `<a class="btn box" href="${pager.prev}">← Newer</a>` : "<span></span>"}
  <span class="pager-count">${pager.current} / ${pager.total}</span>
  ${pager.next ? `<a class="btn box" href="${pager.next}">Older →</a>` : "<span></span>"}
</nav>`;
}

export function listPage(site, { url, items, pager, heading, intro }) {
  const head = heading
    ? `<header class="list-header"><h1>${esc(heading)}</h1>${intro ? `<p>${esc(intro)}</p>` : ""}</header>`
    : "";
  const body = items.length ? items.map(card).join("\n") : `<p class="empty box">Nothing here yet.</p>`;
  return layout(site, {
    title: heading ?? null,
    url,
    body: `<div class="column">${head}${body}${pagerHtml(pager)}</div>`,
  });
}

export function postPage(site, p, { newer, older }) {
  const updated = p.updated && !isNaN(p.updated) ? ` · updated <time datetime="${isoDate(p.updated)}">${fmtDate(p.updated)}</time>` : "";
  const adj = (n, label) =>
    n ? `<a class="adjacent box" href="${n.url}"><span>${label}</span>${esc(n.title)}</a>` : "<span></span>";
  return layout(site, {
    title: p.title,
    description: p.excerpt,
    url: p.url,
    ogImage: p.coverUrl,
    body: `<article class="post box">
  <header class="post-header">
    <p class="date"><time datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time>${updated} · ${p.readingMinutes} min read</p>
    <h1>${esc(p.title)}</h1>
  </header>
  ${p.coverUrl ? `<img class="post-cover" src="${esc(p.coverUrl)}" alt="">` : ""}
  <div class="prose">${p.html}</div>
  <footer class="post-footer">
    <p class="category"><a href="/${p.sectionInfo.slug}/">${esc(p.sectionInfo.title)}</a></p>
    ${tagLinks(p.tags)}
  </footer>
</article>
<nav class="adjacent-nav" aria-label="More posts">${adj(newer, "← Newer")}${adj(older, "Older →")}</nav>`,
  });
}

export function pagePage(site, p) {
  return layout(site, {
    title: p.title,
    description: p.excerpt,
    url: p.url,
    body: `<article class="post box">
  <header class="post-header"><h1>${esc(p.title)}</h1></header>
  <div class="prose">${p.html}</div>
</article>`,
  });
}

export function tagsPage(site, tags) {
  const list = tags.length
    ? `<ul class="tag-cloud">${tags.map((t) => `<li><a class="btn box" href="/tags/${t.slug}/">#${esc(t.name)} <span>${t.posts.length}</span></a></li>`).join("")}</ul>`
    : `<p class="empty box">No tags yet.</p>`;
  return layout(site, {
    title: "Tags",
    url: "/tags/",
    body: `<div class="column"><header class="list-header"><h1>Tags</h1></header>${list}</div>`,
  });
}

export function notFoundPage(site) {
  return layout(site, {
    title: "Not found",
    url: "/404.html",
    body: `<div class="column"><article class="card box">
  <p class="date">Error 404</p>
  <h1 class="card-title">Page not found</h1>
  <p class="excerpt">Whatever was here has moved or never existed.</p>
  <p class="category"><a href="/">← Back home</a></p>
</article></div>`,
  });
}

export function feed(site, posts) {
  const base = site.url.replace(/\/$/, "");
  const updated = (posts[0]?.date ?? new Date()).toISOString();
  const entries = posts
    .map(
      (p) => `<entry>
  <title>${esc(p.title)}</title>
  <link href="${base}${p.url}"/>
  <id>${base}${p.url}</id>
  <published>${p.date.toISOString()}</published>
  <updated>${(p.updated && !isNaN(p.updated) ? p.updated : p.date).toISOString()}</updated>
  ${p.tags.map((t) => `<category term="${esc(t)}"/>`).join("")}
  <summary>${esc(p.excerpt)}</summary>
  <content type="html">${esc(p.html)}</content>
</entry>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${esc(site.title)}</title>
<subtitle>${esc(site.description)}</subtitle>
<link href="${base}/feed.xml" rel="self"/>
<link href="${base}/"/>
<id>${base}/</id>
<updated>${updated}</updated>
<author><name>${esc(site.author)}</name></author>
${entries}
</feed>
`;
}

export function sitemap(site, items) {
  const base = site.url.replace(/\/$/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.map((i) => `<url><loc>${base}${i.url}</loc>${i.date ? `<lastmod>${isoDate(i.updated && !isNaN(i.updated) ? i.updated : i.date)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}
