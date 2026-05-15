#!/usr/bin/env bash
# Run Flutter web on http://localhost:8080 (Git Bash / MSYS2 / WSL / macOS / Linux).
# Uses Microsoft Edge (`-d edge`) by default — works on Windows without Google Chrome.
# If you have Chrome: flutter run -d chrome --web-port=8080
# Or launch any browser manually after: flutter run -d web-server --web-port=8080
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
cd "$ROOT/flutter"
exec flutter run -d edge --web-port=8080
