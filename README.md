# kae-desu.github.io

Personal site for technical write-ups and sharing.

## Writing

`content/` is an Obsidian vault — open it in Obsidian and write there.

```
content/
  about.md              -> /about/            (top-level notes are pages in the menu)
  writeups/             -> /writeups/         (top-level folders are sections)
    some-post.md        -> /writeups/some-post/
  assets/diagram.png    -> /assets/diagram.png (attachments keep their path)
```

Frontmatter (`title`, `date`, `tags`, `description`, `cover`, `slug`, `draft`), wikilinks,
`![[embeds]]`, callouts, highlights and inline `#tags` are supported. See
`content/writeups/how-this-site-works.md` for the full reference. Section names and site
settings live in `site.config.json`.

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
