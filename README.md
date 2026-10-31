# kae-desu.github.io

Personal site for technical write-ups and sharing.

## Writing

`content/` is an Obsidian vault — open it in Obsidian and write there.

```
content/
  about.md              -> /about/            (top-level notes are pages in the menu)
  writeups/             -> /writeups/         (top-level folders are sections)
    _section.md         -> section title, description, order, intro
    some-post.md        -> /writeups/some-post/
  assets/diagram.png    -> /assets/diagram.png (attachments keep their path)
```

Frontmatter (`title`, `date`, `tags`, `description`, `cover`, `slug`, `draft`), wikilinks,
`![[embeds]]`, callouts, highlights and inline `#tags` are supported. See
`content/writeups/how-this-site-works.md` for the full reference. Each section's title,
description and menu order come from its `_section.md`; site-wide settings live in
`site.config.json`.

Search (`/` or `Ctrl+K`) runs fully in the browser via [Pagefind](https://pagefind.app); the index is
built into `_site/pagefind/` as the last build step.

## Running locally

```sh
npm install
npm run dev     # http://localhost:4000, rebuilds when content/ or src/ changes
npm run build   # outputs to _site/
```

Pushing to `main` builds and deploys via GitHub Actions (`.github/workflows/deploy.yml`).

## License

This repository is dual-licensed:

- **Code** (site source, templates, styles, scripts) — [MIT](LICENSE)
- **Content** (everything in `content/`: posts, notes, images, and other media) — [CC BY 4.0](LICENSE-CONTENT)

You're free to reuse the content, including commercially, as long as you give
appropriate credit with a link back to the original post and indicate if changes
were made.
