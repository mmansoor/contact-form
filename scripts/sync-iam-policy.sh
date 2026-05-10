#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <policy-arn> <policy-document-path>" >&2
  exit 1
fi

POLICY_ARN="$1"
POLICY_DOCUMENT_PATH="$2"

if [[ ! -f "$POLICY_DOCUMENT_PATH" ]]; then
  echo "Policy document not found: $POLICY_DOCUMENT_PATH" >&2
  exit 1
fi

DEFAULT_VERSION_ID="$(aws iam get-policy \
  --policy-arn "$POLICY_ARN" \
  --query 'Policy.DefaultVersionId' \
  --output text)"

CURRENT_POLICY_DOCUMENT="$(aws iam get-policy-version \
  --policy-arn "$POLICY_ARN" \
  --version-id "$DEFAULT_VERSION_ID" \
  --query 'PolicyVersion.Document' \
  --output json)"

export CURRENT_POLICY_DOCUMENT
export POLICY_DOCUMENT_PATH

if node --input-type=module <<'EOF'
import { readFileSync } from 'node:fs';

const current = JSON.stringify(JSON.parse(process.env.CURRENT_POLICY_DOCUMENT));
const desired = JSON.stringify(JSON.parse(readFileSync(process.env.POLICY_DOCUMENT_PATH, 'utf8')));

if (current === desired) {
  process.exit(0);
}

process.exit(1);
EOF
then
  echo "Managed policy is already up to date."
  exit 0
fi

VERSION_COUNT="$(aws iam list-policy-versions \
  --policy-arn "$POLICY_ARN" \
  --query 'length(Versions)' \
  --output text)"

if [[ "$VERSION_COUNT" -ge 5 ]]; then
  OLDEST_NON_DEFAULT_VERSION_ID="$(aws iam list-policy-versions \
    --policy-arn "$POLICY_ARN" \
    --query 'sort_by(Versions[?IsDefaultVersion==`false`], &CreateDate)[0].VersionId' \
    --output text)"

  if [[ "$OLDEST_NON_DEFAULT_VERSION_ID" != "None" ]]; then
    aws iam delete-policy-version \
      --policy-arn "$POLICY_ARN" \
      --version-id "$OLDEST_NON_DEFAULT_VERSION_ID"
  fi
fi

aws iam create-policy-version \
  --policy-arn "$POLICY_ARN" \
  --policy-document "file://$POLICY_DOCUMENT_PATH" \
  --set-as-default >/dev/null

echo "Managed policy updated: $POLICY_ARN"
