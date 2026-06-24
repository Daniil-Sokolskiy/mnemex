import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { c, info, warn, err, step, defaultWikiRoot } from "./util.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the bundled wiki-template. Resolution order:
 *   1. LLM_WIKI_TEMPLATE env override
 *   2. bundled `template/` shipped inside the published package (../template from dist/)
 *   3. monorepo dev path ../../apps/wiki-template
 */
function findTemplate(): string | null {
  const candidates = [
    process.env.LLM_WIKI_TEMPLATE,
    resolve(__dirname, "..", "template"),
    resolve(__dirname, "..", "..", "..", "apps", "wiki-template"),
  ].filter(Boolean) as string[];

  for (const cand of candidates) {
    if (existsSync(join(cand, "CLAUDE.md"))) return cand;
  }
  return null;
}

export function init(targetArg?: string): void {
  const target = resolve(targetArg || defaultWikiRoot());
  console.log(`${c.bold}mnemex init${c.reset}\n`);

  const template = findTemplate();
  if (!template) {
    err("Could not locate the wiki template.");
    console.log(`   ${c.dim}Set LLM_WIKI_TEMPLATE to a checkout of apps/wiki-template, or reinstall @mnemex/cli.${c.reset}`);
    process.exit(1);
  }
  step(`Template: ${template}`);

  if (existsSync(target) && readdirSync(target).length > 0) {
    err(`Target directory is not empty: ${target}`);
    console.log(`   ${c.dim}Choose an empty directory, or remove existing contents first.${c.reset}`);
    process.exit(1);
  }

  mkdirSync(target, { recursive: true });
  cpSync(template, target, { recursive: true });
  info(`Wiki created at ${target}`);

  console.log(`\n${c.bold}Next steps:${c.reset}`);
  console.log(`  1. ${c.cyan}mnemex doctor${c.reset}            — check pandoc / chromium / etc`);
  console.log(`  2. ${c.cyan}mnemex mcp install --wiki ${target}${c.reset}`);
  console.log(`                              — print the Claude Desktop config snippet`);
  console.log(`  3. Restart Claude Desktop, then say:`);
  console.log(`     ${c.dim}"help me ingest my first book"${c.reset}\n`);
}
