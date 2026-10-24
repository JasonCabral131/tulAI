#!/bin/sh
# Bootstrap for a fresh clone:  ./setup.sh   (same as: npm run setup)
set -e
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 18+ is needed first: https://nodejs.org (or: brew install node)"; exit 1; }
[ -d node_modules ] || npm install
node scripts/setup.js "$@"
