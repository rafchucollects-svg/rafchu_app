#!/usr/bin/env bash
# One-time setup: enable CORS on the rafchu-tcg-app Firebase Storage bucket.
#
# This is what fixes the "Image unavailable" placeholders in the Story
# Sale Generator. The browser needs explicit CORS headers from the
# Storage bucket to be allowed to draw the card image onto a canvas and
# export it as PNG/JPEG (via crossOrigin="anonymous"). Without this
# config, every card image fails to load and we render placeholders.
#
# You only need to run this ONCE per bucket. The setting persists.
#
# IMPORTANT: gcloud must be authenticated with the PERSONAL Google
# account that owns the rafchu-tcg-app Firebase project
# (rafchucollects@gmail.com), not the Supercell work account.

set -euo pipefail

BUCKET="gs://rafchu-tcg-app.firebasestorage.app"
CORS_FILE="$(dirname "$0")/storage-cors.json"

echo "Active gcloud account:"
gcloud auth list --filter=status:ACTIVE --format="value(account)"
echo ""

read -r -p "Continue applying CORS to $BUCKET with this account? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted. To switch accounts:"
  echo "  gcloud auth login                              # add personal account"
  echo "  gcloud config set account YOUR_PERSONAL_EMAIL  # make it active"
  exit 1
fi

echo "Applying CORS config from $CORS_FILE..."
gsutil cors set "$CORS_FILE" "$BUCKET"

echo ""
echo "Verifying..."
gsutil cors get "$BUCKET"

echo ""
echo "Done. Reload the Story Sale Generator and rebuild from inventory."
