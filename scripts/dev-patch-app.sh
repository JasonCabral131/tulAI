#!/bin/zsh
# Developer tool: copy this source folder into the installed ~/Desktop/Tulai.app (keeps its node_modules and bundled engines) and restart it.
# Never run it while a training is converting or being checked: restarting kills the model server the quality gate uses.
# Safety: never restart Tulai while your meeting notes are recording, or while a training round's quality check is running (it uses Tulai's model
# server). Set FORCE=1 only if you really mean it.
if [ "$FORCE" != "1" ]; then
  REC=$(curl -s -m 5 localhost:39393/api/bot/live | python3 -c "import sys,json;print(json.load(sys.stdin).get('recording'))" 2>/dev/null)
  if [ "$REC" = "True" ]; then echo "NOT DEPLOYED: meeting notes are recording. Try again after the meeting."; exit 2; fi
  if ps -axo command | grep -E "[n]lu-gate|[p]repare-activation\.py|[a]ctivation-gate\.py|[l]lama-quantize|[c]onvert_hf_to_gguf" | grep -vq "zsh -c"; then echo "NOT DEPLOYED: a training round is converting or being checked. Try again in a few minutes."; exit 3; fi
fi
S="${TMPDIR:-/tmp}/tulai-patch"
SRC="$(cd "$(dirname "$0")/.." && pwd)"  # the Tulai source this script lives in (map-governance-ui/tools/extra/tulai)
cd ~/Desktop && rm -rf "$S" && mkdir -p "$S" && npx --yes asar extract Tulai.app/Contents/Resources/app.asar "$S/asar" 2>/dev/null || exit 1
rsync -a --include='*.js' --include='*.json' --include='*.md' --include='public/***' --include='skills/***' --include='native/***' --include='scripts/***' --include='training-config/***' --exclude='*' "$SRC/" "$S/asar/" 2>&1 | tail -2
for f in "$S"/asar/*.js; do node --check "$f" || { echo "SYNTAX ERROR in $f"; exit 1; }; done
pkill -9 -f "Tulai.app/Contents/MacOS"; pkill -9 -f "Tulai.app/Contents/Resources/bin/llama-server"; pkill -9 -f whisper-server; sleep 1
npx asar pack "$S/asar" Tulai.app/Contents/Resources/app.asar 2>/dev/null && open -n Tulai.app --args --bot && sleep 6 && open -n Tulai.app && sleep 8 && echo patched-all
