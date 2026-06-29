import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { c, info, warn, err } from "./util.js";

interface Check {
  name: string;
  cmd: string;
  args: string[];
  required: boolean;
  hint: string;
  winHint?: string; // Windows-specific install hint (winget), if different
  min?: number; // major version
}

const CHECKS: Check[] = [
  { name: "Node.js", cmd: "node", args: ["-v"], required: true, min: 20, hint: "Install Node 20+: https://nodejs.org or via fnm/nvm", winHint: "Install Node 20+ (qmd search needs 22+): winget install OpenJS.NodeJS.LTS — or https://nodejs.org" },
  { name: "pandoc", cmd: "pandoc", args: ["--version"], required: true, hint: "Install pandoc: https://pandoc.org/installing.html (or brew/apt install pandoc)", winHint: "Install pandoc: winget install JohnMacFarlane.Pandoc — or https://pandoc.org/installing.html" },
  { name: "git", cmd: "git", args: ["--version"], required: true, hint: "Install git: https://git-scm.com", winHint: "Install git: winget install Git.Git — or https://git-scm.com" },
  { name: "calibre (ebook-convert)", cmd: "ebook-convert", args: ["--version"], required: false, hint: "Optional — needed for .mobi/.azw3/.fb2. Install: https://calibre-ebook.com", winHint: "Optional — needed for .mobi/.azw3/.fb2. Install: winget install calibre.calibre — or https://calibre-ebook.com" },
  { name: "Chromium (Playwright)", cmd: "node", args: ["-e", "require('playwright').chromium.executablePath()"], required: false, hint: "Run: npx playwright install chromium  (needed for Anna's search)" },
  { name: "qmd (search backend)", cmd: "qmd", args: ["--version"], required: false, hint: "Optional — powers wiki search. Run: mnemex setup-search", winHint: "Optional — powers wiki search. setup-search is bash-only; on Windows set it up natively — see docs/mcp/search.md" },
];

const isWindows = platform() === "win32";
const hintFor = (check: Check): string =>
  isWindows && check.winHint ? check.winHint : check.hint;

function getVersion(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")[0]
      .trim();
  } catch {
    return null;
  }
}

export function doctor(): void {
  console.log(`${c.bold}mnemex doctor${c.reset} — checking your environment\n`);
  let hardFail = false;

  for (const check of CHECKS) {
    const out = getVersion(check.cmd, check.args);
    if (!out) {
      if (check.required) {
        err(`${check.name} — NOT FOUND (required)`);
        console.log(`   ${c.dim}${hintFor(check)}${c.reset}`);
        hardFail = true;
      } else {
        warn(`${check.name} — not found (optional)`);
        console.log(`   ${c.dim}${hintFor(check)}${c.reset}`);
      }
      continue;
    }
    // version-gate Node
    if (check.min && check.name === "Node.js") {
      const major = parseInt(out.replace(/^v/, "").split(".")[0], 10);
      if (major < check.min) {
        err(`${check.name} ${out} — too old, need ${check.min}+`);
        console.log(`   ${c.dim}${hintFor(check)}${c.reset}`);
        hardFail = true;
        continue;
      }
    }
    info(`${check.name} — ${out.slice(0, 60)}`);
  }

  console.log();
  if (hardFail) {
    err("Some required tools are missing. Install them and re-run `mnemex doctor`.");
    process.exit(1);
  } else {
    info("All required tools present. You're good to go.");
  }
}
