#requires -version 5.1
<#
  mnemex turnkey installer for Windows (PowerShell).

    irm https://raw.githubusercontent.com/Daniil-Sokolskiy/mnemex/main/install.ps1 | iex

  Installs the MCP servers + CLI globally, installs pandoc (via winget) and
  Chromium for Playwright, scaffolds a wiki, and prints the client setup to
  paste/run. This is the Windows counterpart of install.sh (Linux/macOS only).

  Requires Node 20+ (22+ for the optional search backend). winget is used for
  pandoc/git/Node when missing; if you don't have winget, install those manually.
#>

$ErrorActionPreference = 'Stop'
# Don't let benign non-zero exits from native tools (winget "already installed",
# qmd "collection exists") abort the whole script on PowerShell 7.3+.
$PSNativeCommandUseErrorActionPreference = $false

function Write-Info { param([string]$m) Write-Host "  [+] $m" -ForegroundColor Green }
function Write-Step { param([string]$m) Write-Host "  [>] $m" -ForegroundColor Cyan }
function Write-Warn2 { param([string]$m) Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host "  [x] $m" -ForegroundColor Red }

function Test-Cmd { param([string]$name) [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Update-SessionPath {
  # winget / MSI installers update the persisted PATH but not this process's
  # copy. Re-read it so freshly-installed tools are usable in this same run.
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

function Install-WithWinget {
  param([string]$Id, [string]$Label)
  if (-not (Test-Cmd winget)) {
    Write-Warn2 "winget not found - install $Label manually, then re-run."
    return
  }
  Write-Step "Installing $Label via winget..."
  winget install --id $Id -e --accept-source-agreements --accept-package-agreements --disable-interactivity | Out-Null
  Update-SessionPath
}

Write-Host ""
Write-Host "  +---------------------------------------+" -ForegroundColor Cyan
Write-Host "  |   mnemex installer (Windows)          |" -ForegroundColor Cyan
Write-Host "  |   your second brain, curated by an LLM |" -ForegroundColor Cyan
Write-Host "  +---------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# ---- platform sanity ----
if (-not ($IsWindows -or $env:OS -eq 'Windows_NT')) {
  Write-Err2 "This installer is for Windows. On macOS/Linux use install.sh."
  return
}

# ---- Node.js (>= 20; search needs >= 22) ----
if (-not (Test-Cmd node)) {
  Write-Warn2 "Node.js not found."
  Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS' | Out-Null
}
if (-not (Test-Cmd node)) {
  Write-Err2 "Node.js not on PATH. Install Node 20+ from https://nodejs.org, open a new terminal, and re-run."
  return
}
$nodeMajor = [int]((node -v) -replace '^v', '' -replace '\..*$', '')
if ($nodeMajor -lt 20) {
  Write-Err2 "Node.js 20+ required (found $(node -v)). Upgrade: winget install OpenJS.NodeJS.LTS"
  return
}
Write-Info "Node.js $(node -v)"
if ($nodeMajor -lt 22) {
  Write-Warn2 "Node $nodeMajor detected - the optional search backend (qmd) needs Node 22+."
}

# ---- pandoc (epub/pdf -> markdown) ----
if (-not (Test-Cmd pandoc)) { Install-WithWinget 'JohnMacFarlane.Pandoc' 'pandoc' | Out-Null }
if (Test-Cmd pandoc) { Write-Info "pandoc present" }
else { Write-Warn2 "pandoc missing - needed to convert books. Install: winget install JohnMacFarlane.Pandoc" }

# ---- git ----
if (-not (Test-Cmd git)) { Install-WithWinget 'Git.Git' 'git' | Out-Null }
if (Test-Cmd git) { Write-Info "git present" }
else { Write-Warn2 "git missing. Install: winget install Git.Git" }

# ---- install packages ----
Write-Step "Installing @mnemex packages globally (this may take a minute)..."
npm install -g '@mnemex/library-mcp' '@mnemex/cli'
Update-SessionPath
Write-Info "MCP servers + CLI installed"

# ---- Chromium for Playwright ----
Write-Step "Installing Chromium for Playwright (needed for Anna's search)..."
try { npx --yes playwright install chromium }
catch { Write-Warn2 "Chromium install failed - run 'npx playwright install chromium' manually later." }

# ---- scaffold wiki ----
$defaultDir = Join-Path $HOME 'mnemex'
$wikiDir = Read-Host "  ? Where to create your wiki? [$defaultDir]"
if ([string]::IsNullOrWhiteSpace($wikiDir)) { $wikiDir = $defaultDir }

if ((Test-Path $wikiDir) -and (Get-ChildItem -Force $wikiDir -ErrorAction SilentlyContinue)) {
  Write-Warn2 "Directory $wikiDir is not empty - skipping scaffold. Run 'mnemex init <dir>' manually."
}
else {
  Write-Step "Scaffolding wiki at $wikiDir..."
  mnemex init $wikiDir
}

# ---- optional search backend (qmd) ----
$setupSearch = Read-Host "  ? Set up search now? Installs qmd + downloads a ~2GB model [y/N]"
if ($setupSearch -match '^[yY]') {
  if ($nodeMajor -lt 22) {
    Write-Warn2 "Skipping search: qmd needs Node 22+. Upgrade (winget install OpenJS.NodeJS.LTS), then see docs/mcp/search.md."
  }
  else {
    Write-Step "Setting up search backend (qmd)..."
    $env:QMD_EMBED_MODEL = 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf'
    $env:QMD_FORCE_CPU = '1'  # qmd's GPU reranker can fail on Windows; CPU is reliable
    try {
      if (-not (Test-Cmd qmd)) { npm install -g '@tobilu/qmd'; Update-SessionPath }
      qmd collection add (Join-Path $wikiDir 'wiki') --name mnemex-wiki --mask '**/*.md'
      qmd collection add (Join-Path $wikiDir 'raw')  --name mnemex-raw  --mask '**/*.md'
      qmd update
      qmd embed
      Write-Info "Search ready."
    }
    catch {
      Write-Warn2 "Search setup didn't finish - see docs/mcp/search.md to complete it manually. ($_)"
    }
  }
}
else {
  Write-Warn2 "Skipping search setup. See docs/mcp/search.md to enable wiki search later."
}

# ---- print MCP config ----
Write-Host ""
mnemex mcp install --wiki $wikiDir

Write-Host ""
Write-Info "Installation complete."
Write-Host "  Next: follow the setup block above for YOUR client (Claude Desktop or Claude Code),"
Write-Host "  restart/verify it, then open a chat and say: " -NoNewline
Write-Host '"help me ingest my first book"' -ForegroundColor Cyan
Write-Host ""
