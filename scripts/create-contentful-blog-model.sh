#!/usr/bin/env bash
set -euo pipefail

: "${CONTENTFUL_SPACE_ID:?Debes definir CONTENTFUL_SPACE_ID}"
: "${CONTENTFUL_ENVIRONMENT:=master}"
: "${CONTENTFUL_MANAGEMENT_TOKEN:?Debes definir CONTENTFUL_MANAGEMENT_TOKEN}"

curl --fail --silent --show-error \
  -X PUT \
  "https://api.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENVIRONMENT}/content_types/blog" \
  -H "Authorization: Bearer ${CONTENTFUL_MANAGEMENT_TOKEN}" \
  -H "Content-Type: application/vnd.contentful.management.v1+json" \
  -H "X-Contentful-Version: 1" \
  --data @contentful/blog-content-type.json

curl --fail --silent --show-error \
  -X PUT \
  "https://api.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENVIRONMENT}/content_types/blog/published" \
  -H "Authorization: Bearer ${CONTENTFUL_MANAGEMENT_TOKEN}" \
  -H "X-Contentful-Version: 2"

