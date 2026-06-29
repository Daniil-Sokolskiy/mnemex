import { resolve } from "node:path";
import { platform } from "node:os";
import { c, info, step, warn, claudeConfigPath, defaultWikiRoot } from "./util.js";

interface McpInstallOpts {
  wiki?: string;
  annasKey?: string;
}

// Multilingual embedding model qmd uses for the search backend (handles
// non-English sources, e.g. Russian books). Overridable via QMD_EMBED_MODEL.
const QMD_EMBED_MODEL =
  "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf";

function hr(): void {
  console.log(c.dim + "─".repeat(64) + c.reset);
}

/**
 * Print ready-to-use MCP setup instructions for whichever Claude client the
 * user has. We deliberately do NOT auto-edit any config file — those files
 * often contain other servers, and silent edits are hostile. We print exactly
 * what to add, where, and how, for each supported client.
 */
export function mcpInstall(opts: McpInstallOpts): void {
  const wiki = resolve(opts.wiki || defaultWikiRoot());
  const cfg = claudeConfigPath();

  const libEnv: Record<string, string> = { WIKI_ROOT: wiki };
  if (opts.annasKey) libEnv.ANNAS_ARCHIVE_KEY = opts.annasKey;

  // On Windows, node-llama-cpp defaults to the Vulkan backend, where qmd's
  // reranker fails to allocate a context - a hard crash on an Intel Iris Xe
  // iGPU, and a silent Vulkan OOM + non-reranked fallback even with an RTX
  // 3070 Ti present (CUDA needs a separate toolkit/build and isn't auto-
  // selected). Embedding still works on the GPU; only rerank is affected, so
  // QMD_FORCE_CPU=1 gives reliable query-time reranking.
  const isWindows = platform() === "win32";
  const searchEnv: Record<string, string> = { QMD_EMBED_MODEL };
  if (isWindows) searchEnv.QMD_FORCE_CPU = "1";

  const snippet = {
    mcpServers: {
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
        env: searchEnv,
      },
    },
  };

  console.log(`\n${c.bold}mnemex — connect the MCP servers${c.reset}`);
  step(`Wiki root: ${c.cyan}${wiki}${c.reset}`);
  console.log(
    `${c.dim}Two servers: ${c.reset}mnemex-library${c.dim} (find + download books) and ${c.reset}mnemex-search${c.dim} (search your wiki).${c.reset}`,
  );
  console.log(
    `${c.dim}These are LOCAL servers — they need a client that runs on your machine: ${c.reset}Claude Desktop${c.dim} or ${c.reset}Claude Code${c.dim}. Pick your client below.${c.reset}`,
  );

  // ---- Claude Desktop ----
  console.log(`\n${c.bold}${c.cyan}▸ Claude Desktop${c.reset}`);
  console.log(`  1. Open the config file:`);
  console.log(`     ${c.cyan}${cfg}${c.reset}`);
  console.log(
    `     ${c.dim}(create it if it doesn't exist yet)${c.reset}`,
  );
  console.log(
    `  2. Merge the block below into it. If the file already has an`,
  );
  console.log(
    `     ${c.cyan}"mcpServers"${c.reset} key, add these two entries inside it — don't duplicate the key.`,
  );
  console.log(
    `  3. Save, then fully ${c.bold}quit and reopen Claude Desktop${c.reset} (not just close the window).\n`,
  );
  console.log(c.dim + JSON.stringify(snippet, null, 2) + c.reset);

  // ---- Claude Code ----
  console.log(`\n${c.bold}${c.cyan}▸ Claude Code (CLI)${c.reset}`);
  console.log(`  Run these two commands — no file editing:\n`);
  const keyFlag = opts.annasKey ? ` -e ANNAS_ARCHIVE_KEY=${opts.annasKey}` : "";
  const cpuFlag = isWindows ? " -e QMD_FORCE_CPU=1" : "";
  console.log(
    `  ${c.green}claude mcp add mnemex-library -e WIKI_ROOT=${wiki}${keyFlag} -- npx @mnemex/library-mcp${c.reset}`,
  );
  console.log(
    `  ${c.green}claude mcp add mnemex-search -e QMD_EMBED_MODEL=${QMD_EMBED_MODEL}${cpuFlag} -- qmd mcp${c.reset}`,
  );
  console.log(
    `  ${c.dim}Verify with ${c.reset}claude mcp list${c.dim}. Add ${c.reset}--scope user${c.dim} to make them available in every project.${c.reset}`,
  );

  // ---- Web ----
  console.log(`\n${c.bold}${c.cyan}▸ Claude on the web (claude.ai)${c.reset}`);
  console.log(
    `  ${c.yellow}Not supported directly.${c.reset} The web app can't launch local programs, and these`,
  );
  console.log(
    `  servers need your local filesystem + Chromium. Use Claude Desktop or Claude Code instead.`,
  );
  console.log(
    `  ${c.dim}(Advanced: host an MCP server remotely and add it as a web connector — out of scope here.)${c.reset}`,
  );

  // ---- search reminder + key tip ----
  hr();
  warn(
    `${c.bold}mnemex-search${c.reset} only works after the one-time search setup:`,
  );
  console.log(
    `   ${c.cyan}mnemex setup-search --wiki ${wiki}${c.reset}  ${c.dim}(installs qmd + downloads a ~2GB model)${c.reset}`,
  );
  console.log(
    `   ${c.dim}Skip it if you only want book download for now — mnemex-library works on its own.${c.reset}`,
  );
  if (isWindows) {
    console.log(
      `   ${c.yellow}Windows:${c.reset} ${c.dim}setup-search runs a bash script — set up qmd natively instead (see docs/mcp/search.md). ${c.reset}QMD_FORCE_CPU=1${c.dim} is already in the config above.${c.reset}`,
    );
  }
  if (!opts.annasKey) {
    console.log(
      `${c.dim}Tip: have a paid Anna's membership? Re-run with ${c.reset}--annas-key <key>${c.dim} to enable auto-download.${c.reset}`,
    );
  }
  info("Done — nothing was modified. Copy whichever block matches your client.");
  console.log();
}

export function mcpStatus(opts: { wiki?: string }): void {
  const wiki = resolve(opts.wiki || defaultWikiRoot());
  const os =
    platform() === "darwin" ? "macOS" : platform() === "win32" ? "Windows" : "Linux";
  console.log(`\n${c.bold}mnemex mcp status${c.reset}\n`);
  step(`Platform:           ${os}`);
  step(`Expected wiki root: ${c.cyan}${wiki}${c.reset}`);
  step(`Desktop config:     ${c.cyan}${claudeConfigPath()}${c.reset}`);
  console.log(
    `\n${c.dim}Claude Desktop: open the app and confirm the ${c.reset}mnemex-library${c.dim} and ${c.reset}mnemex-search${c.dim} tools appear.` +
      `\nClaude Code: run ${c.reset}claude mcp list${c.dim} and look for the two mnemex servers.${c.reset}\n`,
  );
}
