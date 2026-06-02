#!/usr/bin/env bash
set -euo pipefail

PROFILE="clinica-isis"
STACK_NAME="clinica-isis-pruebas"
TEMPLATE_FILE="infrastructure/template.yaml"

aws cloudformation deploy \
  --profile "$PROFILE" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE_FILE" \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation describe-stacks \
  --profile "$PROFILE" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs" \
  --output table

