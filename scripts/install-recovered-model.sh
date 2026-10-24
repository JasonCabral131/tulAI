#!/bin/zsh
# Puts the rebuilt model (~/Desktop/recovered-full.gguf) back where Tulai expects its active model, and fixes the checksum in active-model.json.
# The weights are exact (copied from the running model server's memory); the file header was rebuilt from the base model, so the checksum differs from the original.
set -e
T="$HOME/Library/Application Support/gateway-chat/training"
RUN="pilot-20261009T060517Z-34e846"
SRC="$HOME/Desktop/recovered-full.gguf"
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
[ "$(stat -f%z "$SRC")" = "1929902496" ] || { echo "unexpected size"; exit 1; }
mkdir -p "$T/runs/$RUN/deployment"
cp "$SRC" "$T/runs/$RUN/deployment/model-q4_k_m.gguf"
chmod 600 "$T/runs/$RUN/deployment/model-q4_k_m.gguf"
python3 - <<'PY'
import json, hashlib, os
t = os.path.expanduser('~/Library/Application Support/gateway-chat/training')
p = t + '/active-model.json'; s = json.load(open(p))
f = t + '/runs/pilot-20261009T060517Z-34e846/deployment/model-q4_k_m.gguf'
assert s['current']['run'] == 'pilot-20261009T060517Z-34e846' and os.path.getsize(f) == s['current']['bytes']
s['current']['sha256'] = hashlib.sha256(open(f, 'rb').read()).hexdigest()
s['current']['note'] = 'Rebuilt 2026-10-11 from the model server memory after the run folders were deleted by mistake: weights exact, header rebuilt from the base model.'
json.dump(s, open(p + '.tmp', 'w'), indent=2); os.replace(p + '.tmp', p)
print('active-model.json updated')
PY
echo "done: the active model file is back. It is used the next time the bot restarts its local brain."
