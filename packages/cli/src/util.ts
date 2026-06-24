import { platform, homedir } from "node:os";
import { join } from "node:path";

export const c = {
  reset: "\x1b[0m",
  red: "\x1b[0;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[1;33m",
  cyan: "\x1b[0;36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

export const info = (m: string) => console.log(`${c.green}✓${c.reset} ${m}`);
export const warn = (m: string) => console.log(`${c.yellow}!${c.reset} ${m}`);
export const err = (m: string) => console.error(`${c.red}✗${c.reset} ${m}`);
export const step = (m: string) => console.log(`${c.cyan}→${c.reset} ${m}`);

/** Path to the user's Claude Desktop config, by platform. */
export function claudeConfigPath(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "win32":
      return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    default:
      return join(home, ".config", "Claude", "claude_desktop_config.json");
  }
}

/** Default wiki location. */
export function defaultWikiRoot(): string {
  return join(homedir(), "mnemex");
}
