#!/usr/bin/env bash
#
# mnemex turnkey installer.
#
#   curl -fsSL https://raw.githubusercontent.com/Daniil-Sokolskiy/mnemex/main/install.sh | bash
#
# Installs the MCP servers + CLI globally, installs Chromium for Playwright,
# scaffolds a wiki, and prints the Claude Desktop config to paste.
#
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; }
step()  { echo -e "${CYAN}→${NC} $*"; }
die()   { err "$*"; exit 1; }

echo ""
echo "  ╭───────────────────────────────────────╮"
echo "  │   mnemex installer                   │"
echo "  │   your second brain, curated by an LLM │"
echo "  ╰───────────────────────────────────────╯"
echo ""

# ---- platform ----
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM=linux ;;
  Darwin*) PLATFORM=mac ;;
  *) die "Unsupported OS: $OS (Linux and macOS only)";;
esac
step "Platform: $PLATFORM"

# ---- Node.js ----
if ! command -v node &>/dev/null; then
  warn "Node.js not found."
  if [[ $PLATFORM == mac ]] && command -v brew &>/dev/null; then
    step "Installing Node via Homebrew..."
    brew install node
  else
    die "Please install Node.js 20+ first: https://nodejs.org (or fnm/nvm), then re-run."
  fi
fi
NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
[[ $NODE_MAJOR -ge 20 ]] || die "Node.js 20+ required (found $(node -v))."
info "Node.js $(node -v)"

# ---- pandoc ----
if ! command -v pandoc &>/dev/null; then
  step "Installing pandoc..."
  if [[ $PLATFORM == mac ]]; then
    command -v brew &>/dev/null && brew install pandoc || die "Install pandoc: https://pandoc.org/installing.html"
  else
    sudo apt-get update -qq && sudo apt-get install -y pandoc || die "Install pandoc: https://pandoc.org/installing.html"
  fi
fi
info "pandoc $(pandoc --version | head -1 | awk '{print $2}')"

# ---- git ----
command -v git &>/dev/null || die "git is required: https://git-scm.com"
info "git present"

# ---- install packages ----
step "Installing @mnemex packages globally (this may take a minute)..."
npm install -g @mnemex/library-mcp @mnemex/cli
info "MCP servers + CLI installed"

# ---- Chromium for Playwright ----
step "Installing Chromium for Playwright (needed for Anna's search)..."
npx playwright install chromium || warn "Chromium install failed — run 'npx playwright install chromium' manually later."

# ---- scaffold wiki ----
DEFAULT_DIR="$HOME/mnemex"
if [ -t 0 ]; then
  read -rp "$(echo -e "${CYAN}?${NC} Where to create your wiki? [${DEFAULT_DIR}]: ")" WIKI_DIR
else
  WIKI_DIR=""   # non-interactive (piped) — use default
fi
WIKI_DIR="${WIKI_DIR:-$DEFAULT_DIR}"

if [ -d "$WIKI_DIR" ] && [ -n "$(ls -A "$WIKI_DIR" 2>/dev/null)" ]; then
  warn "Directory $WIKI_DIR is not empty — skipping scaffold. Run 'mnemex init <dir>' manually."
else
  step "Scaffolding wiki at $WIKI_DIR..."
  mnemex init "$WIKI_DIR"
fi

# ---- search backend (qmd) — optional, downloads a ~2GB embedding model ----
SETUP_SEARCH="n"
if [ -t 0 ]; then
  read -rp "$(echo -e "${CYAN}?${NC} Set up search now? Installs qmd + downloads a ~2GB embedding model [y/N]: ")" SETUP_SEARCH
fi
case "${SETUP_SEARCH:-n}" in
  [yY]*)
    step "Setting up search backend (qmd)..."
    mnemex setup-search --wiki "$WIKI_DIR" || warn "Search setup failed — run 'mnemex setup-search' later."
    ;;
  *)
    warn "Skipping search setup. Run 'mnemex setup-search' anytime to enable wiki search."
    ;;
esac

# ---- print MCP config ----
echo ""
mnemex mcp install --wiki "$WIKI_DIR"

echo ""
info "Installation complete."
echo -e "  Next: edit your Claude Desktop config (snippet above), restart Claude, then"
echo -e "  open a chat and say: ${CYAN}\"help me ingest my first book\"${NC}"
echo ""
