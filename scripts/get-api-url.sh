#!/usr/bin/env bash
set -euo pipefail

PROFILE="clinica-isis"
STACK_NAME="clinica-isis-pruebas"

aws cloudformation describe-stacks \
  --profile "$PROFILE" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ValidarEndpoint'].OutputValue" \
  --output text

