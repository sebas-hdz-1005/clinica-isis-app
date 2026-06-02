#!/usr/bin/env bash
set -euo pipefail

API_URL="${1:-$(./scripts/get-api-url.sh)}"

echo "Prueba cedula existente"
curl --silent "$API_URL?cedula=1234567890"
echo
echo "Prueba cedula inexistente"
curl --silent "$API_URL?cedula=0000000000"
echo

