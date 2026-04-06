#!/usr/bin/env bash
# install.sh — ia-framework one-shot installer
# Usage: ./install.sh
# 
# Installs prerequisites, builds the framework, configures services,
# and sets up OpenCode MCP integration.
set -euo pipefail

# ──────────────────────────────────────────────────────
# Colors
# ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'  # No Color

# ──────────────────────────────────────────────────────
# Resolve script directory (handles symlinks)
# ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPT_DIR

# ──────────────────────────────────────────────────────
# Source helper scripts
# ──────────────────────────────────────────────────────
# shellcheck source=scripts/check-prerequisites.sh
source "${SCRIPT_DIR}/scripts/check-prerequisites.sh"
# shellcheck source=scripts/install-docker.sh
source "${SCRIPT_DIR}/scripts/install-docker.sh"
# shellcheck source=scripts/install-node.sh
source "${SCRIPT_DIR}/scripts/install-node.sh"
# shellcheck source=scripts/install-ollama.sh
source "${SCRIPT_DIR}/scripts/install-ollama.sh"
# shellcheck source=scripts/install-opencode.sh
source "${SCRIPT_DIR}/scripts/install-opencode.sh"
# shellcheck source=scripts/start-services.sh
source "${SCRIPT_DIR}/scripts/start-services.sh"
# shellcheck source=scripts/init-config.sh
source "${SCRIPT_DIR}/scripts/init-config.sh"

# ──────────────────────────────────────────────────────
# Banner
# ──────────────────────────────────────────────────────
echo -e "${BLUE}${BOLD}"
echo "╔══════════════════════════════════════╗"
echo "║   ia-framework installer v0.1.0      ║"
echo "║   AI codebase context for OpenCode   ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ──────────────────────────────────────────────────────
# Step 1: Check & install prerequisites
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 1: Prerequisites${NC}"
echo -e "${YELLOW}→${NC} Checking installed tools..."
echo ""

# Docker (required — hard fail if install fails)
docker_status=$(check_docker)
if echo "$docker_status" | grep -q "^INSTALLED"; then
  echo -e "  ${GREEN}✓${NC} Docker: ${docker_status#INSTALLED: }"
else
  echo -e "  ${YELLOW}→${NC} Docker not found — installing..."
  if ! install_docker; then
    echo -e "  ${RED}✗${NC} Docker installation failed. Install manually: https://docs.docker.com/get-docker/"
    exit 1
  fi
fi

# Node.js 22+ (required — hard fail if install fails)
node_status=$(check_node)
if echo "$node_status" | grep -q "^INSTALLED"; then
  echo -e "  ${GREEN}✓${NC} Node.js: ${node_status#INSTALLED: }"
else
  echo -e "  ${YELLOW}→${NC} Node.js 22+ not found — installing..."
  if ! install_node; then
    echo -e "  ${RED}✗${NC} Node.js installation failed. Install manually: https://nodejs.org"
    exit 1
  fi
fi

# Ollama (recommended — soft fail)
ollama_status=$(check_ollama)
if echo "$ollama_status" | grep -q "^INSTALLED"; then
  echo -e "  ${GREEN}✓${NC} Ollama: ${ollama_status#INSTALLED: }"
else
  echo -e "  ${YELLOW}→${NC} Ollama not found — installing..."
  install_ollama || echo -e "  ${YELLOW}⚠${NC} Ollama install skipped — configure embedding.provider in .ia-framework/project.json"
fi

# OpenCode (recommended — soft fail)
opencode_status=$(check_opencode)
if echo "$opencode_status" | grep -q "^INSTALLED"; then
  echo -e "  ${GREEN}✓${NC} OpenCode: ${opencode_status#INSTALLED: }"
else
  echo -e "  ${YELLOW}→${NC} OpenCode not found — installing..."
  install_opencode || echo -e "  ${YELLOW}⚠${NC} OpenCode install skipped — install manually: https://opencode.ai"
fi

echo ""

# ──────────────────────────────────────────────────────
# Step 2: Install pnpm if needed
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 2: Package manager${NC}"
if command -v pnpm &>/dev/null; then
  echo -e "  ${GREEN}✓${NC} pnpm: $(pnpm --version)"
else
  echo -e "  ${YELLOW}→${NC} Installing pnpm..."
  npm install -g pnpm
  echo -e "  ${GREEN}✓${NC} pnpm installed: $(pnpm --version)"
fi
echo ""

# ──────────────────────────────────────────────────────
# Step 3: Build the framework
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 3: Build ia-framework${NC}"
echo -e "  ${YELLOW}→${NC} Installing dependencies..."
cd "${SCRIPT_DIR}"
pnpm install --frozen-lockfile 2>&1 | tail -3

echo -e "  ${YELLOW}→${NC} Building packages..."
pnpm build 2>&1 | tail -5

echo -e "  ${GREEN}✓${NC} ia-framework built successfully"
echo ""

# ──────────────────────────────────────────────────────
# Step 3.5: Install ia-framework CLI globally
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 3.5: Install CLI globally${NC}"
echo -e "  ${YELLOW}→${NC} Linking ia-framework CLI globally..."
if (cd "${SCRIPT_DIR}/packages/cli" && npm link) 2>&1 | tail -3; then
  echo -e "  ${GREEN}✓${NC} 'ia-framework' command is now available globally"
else
  echo -e "  ${YELLOW}⚠${NC} Global link failed — you can run the CLI via:"
  echo "    node ${SCRIPT_DIR}/packages/cli/dist/bin.js <command>"
fi
echo ""

# ──────────────────────────────────────────────────────
# Step 4: Initialize config (ask for target project path)
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 4: Configure${NC}"
init_config "${SCRIPT_DIR}"
echo ""

# Derive IA_FRAMEWORK_DIR and write .env for docker-compose
IA_FRAMEWORK_DIR="${SCRIPT_DIR}/.ia-framework"
export IA_FRAMEWORK_DIR
{
  echo "IA_FRAMEWORK_DIR=${IA_FRAMEWORK_DIR}"
  echo "DASHBOARD_PORT=${DASHBOARD_PORT:-3000}"
  echo "QDRANT_HTTP_PORT=${QDRANT_HTTP_PORT:-6333}"
  echo "QDRANT_GRPC_PORT=${QDRANT_GRPC_PORT:-6334}"
} > "${SCRIPT_DIR}/.env"
echo -e "  ${GREEN}✓${NC} Environment written to ${SCRIPT_DIR}/.env"

# Copy docker-compose override defaults if not present
if [ ! -f "${SCRIPT_DIR}/docker-compose.override.yml" ] && [ -f "${SCRIPT_DIR}/docker-compose.override.yml.example" ]; then
  cp "${SCRIPT_DIR}/docker-compose.override.yml.example" "${SCRIPT_DIR}/docker-compose.override.yml"
  echo -e "  ${GREEN}✓${NC} Docker Compose overrides initialized from .example"
fi
echo ""

# ──────────────────────────────────────────────────────
# Step 5: Start services (Qdrant + Dashboard)
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 5: Start services${NC}"
if ! start_qdrant "${SCRIPT_DIR}"; then
  echo -e "  ${RED}✗${NC} Failed to start Qdrant. Check Docker is running."
  exit 1
fi

# Start the monitoring dashboard
echo -e "  ${YELLOW}→${NC} Starting monitoring dashboard..."
if command -v "docker" &>/dev/null && docker compose version &>/dev/null 2>&1; then
  docker compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d --build dashboard 2>&1 | tail -3
elif command -v docker-compose &>/dev/null; then
  docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d --build dashboard 2>&1 | tail -3
else
  echo -e "  ${YELLOW}⚠${NC} docker compose not found — dashboard start skipped"
fi

# Wait up to 60s for dashboard to respond
echo -n "  Waiting for dashboard"
_dash_retries=0
until curl -sf "http://localhost:${DASHBOARD_PORT:-3000}/api/status" > /dev/null 2>&1; do
  if [ $_dash_retries -ge 30 ]; then
    echo ""
    echo -e "  ${YELLOW}⚠${NC} Dashboard did not start within 60s — check: docker compose logs dashboard"
    break
  fi
  sleep 2
  _dash_retries=$((_dash_retries + 1))
  printf "."
done
if curl -sf "http://localhost:${DASHBOARD_PORT:-3000}/api/status" > /dev/null 2>&1; then
  echo ""
  echo -e "  ${GREEN}✓${NC} Dashboard running at http://localhost:${DASHBOARD_PORT:-3000}"
fi
echo ""

# ──────────────────────────────────────────────────────
# Step 6: Configure OpenCode MCP integration
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 6: Configure OpenCode MCP${NC}"
# Source the OpenCode configuration script
if [ -f "${SCRIPT_DIR}/scripts/configure-opencode.sh" ]; then
  # shellcheck source=scripts/configure-opencode.sh
  source "${SCRIPT_DIR}/scripts/configure-opencode.sh"
  CONFIG_FILE="${SCRIPT_DIR}/.ia-framework/project.json"
  configure_opencode "${SCRIPT_DIR}" "${CONFIG_FILE}" || \
    echo -e "  ${YELLOW}⚠${NC} OpenCode config skipped — see docs/opencode-setup.md"
else
  echo -e "  ${YELLOW}⚠${NC} configure-opencode.sh not found — OpenCode MCP setup deferred"
fi
echo ""

# ──────────────────────────────────────────────────────
# Step 6.5: Agent documentation injection
# ──────────────────────────────────────────────────────
echo -e "${BOLD}Step 6.5: Agent documentation${NC}"
CONFIG_FILE="${SCRIPT_DIR}/.ia-framework/project.json"
if [ -f "${SCRIPT_DIR}/packages/cli/dist/bin.js" ] && [ -f "$CONFIG_FILE" ]; then
  echo -e "  ${YELLOW}→${NC} Injecting RAG tools guidance into target project..."
  if node "${SCRIPT_DIR}/packages/cli/dist/bin.js" agents inject --config "$CONFIG_FILE"; then
    echo -e "  ${GREEN}✓${NC} Agent documentation updated"
  else
    echo -e "  ${YELLOW}⚠${NC} Run 'ia-framework agents inject' later to add RAG guidance"
  fi
else
  echo -e "  ${YELLOW}⚠${NC} Agent docs injection deferred — run 'ia-framework agents inject' after setup"
fi
echo ""

# ──────────────────────────────────────────────────────
# Success summary
# ──────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════╗"
echo "║   ✓ ia-framework is ready!           ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"
echo "Available commands:"
echo "  ia-framework index    — Index your codebase into Qdrant"
echo "  ia-framework search   — Search your codebase"
echo "  ia-framework status   — Check indexing status"
echo ""
echo "Start indexing: Open the dashboard and click 'Start Indexing', or run:"
echo "  ia-framework index"
echo ""
echo "OpenCode MCP: Restart OpenCode to load the ia-framework tools"
echo "Dashboard:    http://localhost:${DASHBOARD_PORT:-3000}"
echo ""
echo -e "Config: ${BLUE}${SCRIPT_DIR}/.ia-framework/project.json${NC}"
