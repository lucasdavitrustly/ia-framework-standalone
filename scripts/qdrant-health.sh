#!/usr/bin/env bash
set -euo pipefail

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"

echo "Checking Qdrant health at $QDRANT_URL..."
response=$(curl -sf "$QDRANT_URL/readyz" 2>&1) || {
  echo "ERROR: Qdrant is not responding at $QDRANT_URL"
  echo "Try: docker compose up -d qdrant"
  exit 1
}

echo "Qdrant is healthy: $response"
echo ""
echo "Version:"
curl -sf "$QDRANT_URL/" | python3 -m json.tool 2>/dev/null || echo "(unavailable)"
echo ""
echo "Collections:"
curl -sf "$QDRANT_URL/collections" | python3 -m json.tool 2>/dev/null || echo "(none yet)"
