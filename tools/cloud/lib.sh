# tools/cloud/lib.sh (sourced by start.sh and push.sh; docs/kickoff/README.md section 8.4)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# a single-branch clone fetches only its own branch: make a plain `git fetch origin` update origin/main and its tags too
git config --get-all remote.origin.fetch | grep -qxF '+refs/heads/main:refs/remotes/origin/main' || git config --add remote.origin.fetch '+refs/heads/main:refs/remotes/origin/main'
WS=$(git config dsdude.ws || true)
case "$WS" in WS2) BR=ws2-runtime-core;; WS4) BR=ws4-compiler;; WS5) BR=ws5-assets;;
  WS7) BR=ws7-learn;; WS6b) BR=ws6b-editors;; *) echo "dsdude.ws='$WS': run the git config line first"; exit 1;; esac
S="docs/status/${WS,,}.md"
T=$(sed -n 's/^[-* ]*Cloud push target: `\([^`]*\)`.*$/\1/p' "$S" 2>/dev/null | head -1 || true)
export PATH=/opt/node24/bin:$PATH DSDUDE_HOME=${DSDUDE_HOME:-$HOME/.dsdude} DSDUDE_SKIP_ELECTRON=1
