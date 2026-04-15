#!/bin/bash

SCRIPT_DIR="$(dirname "$0")"

# Open Terminal and run the dev server
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$SCRIPT_DIR/app' && npm install && npm run dev"
end tell
EOF

# Wait for server to start
sleep 5

# Open browser
open http://localhost:3000
