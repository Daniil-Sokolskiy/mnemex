# Contributing

Thanks for considering a contribution.

## Dev setup

```bash
git clone https://github.com/Daniil-Sokolskiy/mnemex.git
cd mnemex
pnpm install
pnpm -r build
```

Run a package in dev:

```bash
cd packages/cli
pnpm dev -- --help
```

## Repo layout

```
packages/library-mcp   MCP server: Gutenberg + Anna's search/download
packages/cli           mnemex init / doctor / mcp install
apps/wiki-template      starter wiki cloned by `mnemex init`
docs/                   methodology + quickstart + disclaimers
install.sh              turnkey installer
```

## The most common maintenance task

Anna's Archive periodically changes its search-results markup. When that
happens, `library_annas_search` returns empty or malformed results. The fix
lives in one place: the `page.evaluate()` DOM-extraction block in
`packages/library-mcp/src/annas.ts`. To debug:

1. Save a rendered page:
   ```bash
   node -e 'import("playwright").then(async ({chromium})=>{const b=await chromium.launch();const p=await (await b.newContext()).newPage();await p.goto("https://annas-archive.gl/search?q=test&ext=epub");await p.waitForTimeout(1500);require("fs").writeFileSync("/tmp/annas.html",await p.content());await b.close()})'
   ```
2. Inspect `/tmp/annas.html` for the new result-card structure.
3. Update the selectors in the `page.evaluate()` block.
4. Verify: `node -e 'import("./dist/annas.js").then(m=>m.searchAnnas("phoenix project",{limit:3})).then(console.log)'`

## Guidelines

- TypeScript, `strict: true`. Keep dependencies minimal.
- No telemetry, no network calls except to the services a tool explicitly targets.
- Never commit ingested book content or personal wiki pages — `.gitignore`
  already excludes `raw/books/**` and `wiki/**` under the template.
- Be careful with anything touching Anna's: this project is an automation client
  only. Don't add scraping of other sites or circumvention of protections.

## Commit / PR

- One logical change per PR.
- Run `pnpm -r build` before pushing.
- Describe what you changed and why in the PR body.
