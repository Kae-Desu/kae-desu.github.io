---
title: How this site works
date: 2026-10-28
tags: [meta, obsidian]
description: The content folder is an Obsidian vault. Every top-level folder is a section, every note is a post, and the usual Obsidian syntax just works.
---

This site is built from a folder of Markdown notes that doubles as an [Obsidian](https://obsidian.md) vault. Open `content/` as a vault, write, commit, push, and the site rebuilds itself.

![[content-layout.svg]]

## Where things go

| Path | Becomes |
| --- | --- |
| `content/<section>/<note>.md` | a post at `/<section>/<note>/` |
| `content/<page>.md` | a standalone page at `/<page>/`, linked in the menu |
| `content/assets/diagram.png` (any non-note file) | copied as-is to `/assets/diagram.png` |

Each top-level folder is a **section** and shows up in the menu. Section titles and descriptions live in `site.config.json`. Folders starting with `.` or `_` (like `.obsidian` or `_templates`) are skipped.

## Frontmatter

All fields are optional:

```yaml
---
title: Defaults to the file name
date: 2026-10-28        # falls back to the note's first git commit
updated: 2026-11-02
tags: [linux, networking]
description: Used as the excerpt instead of the first 50 words
cover: diagram.png      # card + post header image
slug: custom-url        # defaults to the file name
draft: true             # skip when building
---
```

## Obsidian syntax

- Wikilinks: [[About]] or [[About|with an alias]], and links into a heading like `[[note#Heading]]`
- Embeds: `![[image.png]]`, sized `![[image.png|300]]`
- Inline tags such as #obsidian get added to the post's tags
- ==Highlights== and `%%comments%%` (comments are stripped)
- Plain Markdown links and images with relative paths also resolve

> [!tip] Callouts work too
> Any Obsidian callout type (`note`, `tip`, `warning`, `danger`, …). Add `-` or `+` after the type to make it collapsible.

> [!warning]- Collapsed by default
> Hidden until you click the title.

## Code

Fenced blocks get syntax highlighting and a copy button:

```js
export function greet(name) {
  // Say hi
  return `hi, ${name}`;
}
```

## Publishing

```sh
npm run dev     # preview at http://localhost:4000, rebuilds on save
git push        # GitHub Actions builds and deploys
```
