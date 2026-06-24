import { resolve } from "node:path";
import { c, info, step, warn, claudeConfigPath, defaultWikiRoot } from "./util.js";

interface McpInstallOpts {
  wiki?: string;
  annasKey?: string;
}

// Multilingual embedding model qmd uses for the search backend (handles
// non-English sources, e.g. Russian books). Overridable via QMD_EMBED_MODEL.
const QMD_EMBED_MODEL =
  "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf";

/**
 * Print a ready-to-paste Claude Desktop config snippet wiring up both MCP
 * servers, pointed at the given wiki root.
 *
 * We deliberately do NOT auto-edit the user's config JSON — that file often
 * contains other servers, and silent edits are hostile. We print exactly what
 * to add and where.
 */
export function mcpInstall(opts: McpInstallOpts): void {
  const wiki = resolve(opts.wiki || defaultWikiRoot());
  const cfg = claudeConfigPath();

  const libEnv: Record<string, string> = { WIKI_ROOT: wiki };
  if (opts.annasKey) libEnv.ANNAS_ARCHIVE_KEY = opts.annasKey;

  const snippet = {
    // mnemex's own server: search + download books into the wiki.
    "mnemex-library": {
      command: "npx",
      args: ["@mnemex/library-mcp"],
      env: libEnv,
    },
    // Search backend: qmd (BM25 + vector) exposes brain.query/get/multi_get/
    // status over the collections registered by `mnemex setup-search`.
    "mnemex-search": {
      command: "qmd",
      args: ["mcp"],
      env: { QMD_EMBED_MODEL },
    },
  };

  console.log(`${c.bold}mnemex mcp install${c.reset}\n`);
  step(`Wiki root:     ${wiki}`);
  step(`Claude config: ${cfg}`);
  console.log(
    `\nAdd the following under the ${c.cyan}"mcpServers"${c.reset} key of that file:\n`,
  );
  console.log(c.dim + JSON.stringify(snippet, null, 2) + c.reset);
  console.log(
    `\n${c.bold}Then restart Claude Desktop.${c.reset}` +
      (opts.annasKey
        ? ""
        : `\n${c.dim}(Tip: add "ANNAS_ARCHIVE_KEY" to the library env if you have a paid Anna's membership — enables auto-download.)${c.reset}`),
  );
  warn(
    `The "mnemex-search" server needs qmd installed and your wiki registered first:` +
      `\n   run  ${c.cyan}mnemex setup-search --wiki ${wiki}${c.reset}  before restarting Claude.`,
  );
  console.log();
  info("Done. No files were modified — copy the snippet above yourself.");
}

export function mcpStatus(opts: { wiki?: string }): void {
  const wiki = resolve(opts.wiki || defaultWikiRoot());
  console.log(`${c.bold}mnemex mcp status${c.reset}\n`);
  step(`Expected wiki root: ${wiki}`);
  step(`Claude config:      ${claudeConfigPath()}`);
  console.log(
    `\n${c.dim}To verify the servers are live, open Claude Desktop and check that the` +
      `\n'mnemex-library' and 'mnemex-search' tools appear.${c.reset}`,
  );
}
