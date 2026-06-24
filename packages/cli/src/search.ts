import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { c, info, err, step, warn, defaultWikiRoot } from "./util.js";

const EMBED_MODEL =
  process.env.QMD_EMBED_MODEL ||
  "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf";

function haveQmd(): boolean {
  return spawnSync("qmd", ["--version"], { stdio: "ignore" }).status === 0;
}

/**
 * Install qmd (if missing) and register the wiki's `wiki/` and `raw/` folders
 * as qmd collections, then build the index + embeddings. Delegates to the
 * bundled scripts/setup-search.sh which is the source of truth.
 */
export function setupSearch(opts: { wiki?: string }): void {
  const wiki = resolve(opts.wiki || defaultWikiRoot());
  console.log(`${c.bold}mnemex setup-search${c.reset}\n`);
  step(`Wiki root: ${wiki}`);

  const script = join(wiki, "scripts", "setup-search.sh");
  if (!existsSync(script)) {
    err(`setup-search.sh not found at ${script}`);
    console.log(`   ${c.dim}Run 'mnemex init ${wiki}' first.${c.reset}`);
    process.exit(1);
  }

  const r = spawnSync("bash", [script], {
    stdio: "inherit",
    env: { ...process.env, WIKI_ROOT: wiki, QMD_EMBED_MODEL: EMBED_MODEL },
  });
  process.exit(r.status ?? 0);
}

/** Re-scan the wiki and refresh qmd's index + embeddings. */
export function reindex(): void {
  if (!haveQmd()) {
    err("qmd not installed. Run 'mnemex setup-search' first.");
    process.exit(1);
  }
  console.log(`${c.bold}mnemex reindex${c.reset}\n`);
  const env = { ...process.env, QMD_EMBED_MODEL: EMBED_MODEL };
  step("qmd update");
  spawnSync("qmd", ["update"], { stdio: "inherit", env });
  step("qmd embed");
  spawnSync("qmd", ["embed"], { stdio: "inherit", env });
  info("Reindex complete.");
}

/** Run a search from the terminal (thin wrapper over `qmd query`). */
export function search(query: string): void {
  if (!haveQmd()) {
    err("qmd not installed. Run 'mnemex setup-search' first.");
    process.exit(1);
  }
  if (!query || !query.trim()) {
    warn('Provide a query, e.g. mnemex search "bounded context"');
    process.exit(1);
  }
  const r = spawnSync("qmd", ["query", query], {
    stdio: "inherit",
    env: { ...process.env, QMD_EMBED_MODEL: EMBED_MODEL },
  });
  process.exit(r.status ?? 0);
}
