#!/bin/zsh
cd "$(dirname "$0")"
(sleep 1; open http://localhost:3939) &
node server.js
