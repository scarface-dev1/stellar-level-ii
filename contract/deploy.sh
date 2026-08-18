#!/usr/bin/env bash
#
# Deploy the Multi-Wallet Payment Tracker contract to Stellar Testnet.
#
# Requirements:
#   - Rust toolchain with the `wasm32v1-none` target
#   - Stellar CLI (https://developers.stellar.org/docs/tools/cli/install-cli)
#
# Usage:
#   ./deploy.sh                                   # default deployer identity
#   DEPLOYER=my-deployer ./deploy.sh              # use a named identity
#
# The deployer identity is generated + friendbot-funded automatically on the
# first run. The resulting contract ID is printed and saved to
# `deployed_contract_id.txt`.

set -euo pipefail

NETWORK="${NETWORK:-testnet}"
DEPLOYER="${DEPLOYER:-payment-tracker-deployer}"
WASM="target/wasm32v1-none/release/payment_tracker.wasm"
OUT_FILE="deployed_contract_id.txt"

echo "▶ Building contract…"
stellar contract build

# Create the deployer identity if it does not already exist.
if ! stellar keys ls 2>/dev/null | grep -q "^${DEPLOYER}$"; then
  echo "▶ Generating deployer identity '${DEPLOYER}'…"
  stellar keys generate "${DEPLOYER}"
fi

# Fund the deployer via friendbot (testnet only). Funding an already-funded
# account is not an error we want to abort on.
echo "▶ Funding ${DEPLOYER} on ${NETWORK}…"
stellar keys fund "${DEPLOYER}" --network "${NETWORK}" \
  || echo "⚠  Funding skipped (account may already be funded)"

echo "▶ Deploying contract…"
CONTRACT_ID="$(stellar contract deploy \
  --wasm "${WASM}" \
  --source-account "${DEPLOYER}" \
  --network "${NETWORK}" \
  --ignore-checks \
  2>&1 | grep -E '^C[A-Z0-9]{55}$' | tail -1)"

if [ -z "${CONTRACT_ID}" ]; then
  echo "❌ Failed to extract contract ID from deploy output" >&2
  exit 1
fi

echo "${CONTRACT_ID}" > "${OUT_FILE}"

echo ""
echo "✅ Deployed!"
echo "   Contract ID: ${CONTRACT_ID}"
echo "   Saved to:    ${OUT_FILE}"
