#!/usr/bin/env bash
# start-services.sh — Start Qdrant Docker container via docker compose
# Provides: start_qdrant() function

# ──────────────────────────────────────────────────────
# start_qdrant
# Starts the Qdrant container via docker compose.
# Waits for Qdrant to be ready (polls /readyz).
# Idempotent — safe to call if already running.
# Args: $1 = ia-framework directory (optional, defaults to SCRIPT_DIR or cwd)
# Exit code: 0 on success, 1 on timeout/failure.
# ──────────────────────────────────────────────────────
start_qdrant() {
  local ia_dir="${1:-${SCRIPT_DIR:-$(pwd)}}"
  local qdrant_url="${QDRANT_HTTP_PORT:-6333}"
  local qdrant_host="http://localhost:${qdrant_url}"

  # Check if already running
  if curl -sf "${qdrant_host}/readyz" &>/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Qdrant already running at ${qdrant_host}"
    return 0
  fi

  echo -e "  ${YELLOW}→${NC} Starting Qdrant container..."

  # Start via docker compose
  if command -v "docker" &>/dev/null && docker compose version &>/dev/null 2>&1; then
    docker compose -f "${ia_dir}/docker-compose.yml" up -d qdrant 2>&1 | tail -3
  elif command -v docker-compose &>/dev/null; then
    docker-compose -f "${ia_dir}/docker-compose.yml" up -d qdrant 2>&1 | tail -3
  else
    echo -e "  ${RED}✗${NC} docker compose not found. Install Docker first."
    return 1
  fi

  # Poll until ready (max 30 attempts × 1s = 30s)
  local attempts=0
  local max_attempts=30
  echo -n "  Waiting for Qdrant"
  while ! curl -sf "${qdrant_host}/readyz" &>/dev/null 2>&1; do
    if [ $attempts -ge $max_attempts ]; then
      echo ""
      echo -e "  ${RED}✗${NC} Qdrant did not become ready within ${max_attempts}s"
      echo "    Check: docker logs ia-framework-qdrant"
      return 1
    fi
    sleep 1
    attempts=$((attempts + 1))
    printf "."
  done
  echo ""
  echo -e "  ${GREEN}✓${NC} Qdrant ready at ${qdrant_host}"
  return 0
}
