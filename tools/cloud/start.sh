#!/usr/bin/env bash
# tools/cloud/start.sh: a cloud session's first command (docs/kickoff/README.md section 8.4). 10-minute timeout.
. tools/cloud/lib.sh
[[ $(node -v) == v24.* && $(npm -v) == 11.* ]] || { echo 'Node 24 / npm 11 missing: check the setup script'; exit 1; }
mkdir -p "$DSDUDE_HOME"; git restore package-lock.json 2>/dev/null || true
# 1. history, tags, main, the stream line and WS0's registered target (clone depth and refs are undocumented)
[ "$(git rev-parse --is-shallow-repository)" = true ] && git fetch --unshallow origin
git fetch --tags origin '+refs/heads/main:refs/remotes/origin/main'
R=$(git show origin/main:docs/status/cloud.md 2>/dev/null | sed -n "s/^- $WS: .*push target \`\([^\`]*\)\`.*/\1/p" || true)
L=; for b in $BR $R; do git ls-remote --exit-code --heads origin "$b" >/dev/null && git fetch origin "+refs/heads/$b:refs/remotes/origin/$b" && L=origin/$b; done
# 2. adopt the stream line without ever discarding stream work
if [ -n "$L" ] && [ -z "$(git status --porcelain --untracked-files=no)" ]; then
  if git merge-base --is-ancestor HEAD "$L"; then git merge --ff-only "$L"
  elif git merge-base --is-ancestor "$L" HEAD; then :
  elif [ -z "$(git rev-list origin/main..HEAD)" ]; then git reset --hard "$L"
  else echo "HEAD and $L diverged: note it in $S and tell the user"; exit 1; fi
fi
# 3. lockfile guard; install (never npm ci); never keep a lockfile change
node tools/check-lockfile.mjs || { echo 'LOCKFILE GUARD FAILED: README 8.9'; exit 1; }
npm install
git diff --quiet -- package-lock.json || { echo 'npm rewrote the lockfile on Linux: restored; note it in the status file'; git restore package-lock.json; }
# 4. Linux native binaries from the Windows-generated lockfile
npx biome --version && npx tsc --version
node -e "const r=require('node:module').createRequire(require('node:path').resolve('apps/ide/package.json'));r('esbuild').transformSync('');for(const m of ['rollup','lightningcss','@tailwindcss/oxide'])r(m);console.log('native ok')"
case "$WS" in WS2|WS4) gcc --version | sed -n 1p; make --version | sed -n 1p;; WS7|WS6b) npx playwright install chromium;; esac
# 5. versions, position, and what WS0 last reported
C=$(git ls-tree --name-only origin/main docs/status/ | grep -E '/checkpoint-[0-9]+\.md$' | sort -V | tail -1 || true)
O=$(git show "origin/main:$S" 2>/dev/null | sed -n '/^## Integration feedback/,$p' | awk '/^- IF-[0-9]+ resolved by/{r[$2]=1;next} /^- IF-[0-9]+ /{o[$2]=1} END{for(k in o) if(!r[k]) n++; print n+0}' || true)
echo "node $(node -v), npm $(npm -v); push target: ${T:-none yet}; behind origin/main by $(git rev-list --count HEAD..origin/main); latest checkpoint: ${C:-none}; open IF entries: ${O:-0}"
