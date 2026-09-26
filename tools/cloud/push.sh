#!/usr/bin/env bash
# tools/cloud/push.sh: the only way a cloud session pushes (docs/kickoff/README.md section 8.5).
. tools/cloud/lib.sh
git restore package-lock.json 2>/dev/null || true
node tools/check-lockfile.mjs
B=origin/main; [ -n "$T" ] && git rev-parse -q --verify "origin/$T" >/dev/null && B=origin/$T
for c in $(git rev-list --no-merges "$B..HEAD"); do
  grep -qx package-lock.json <<<"$(git diff-tree --no-commit-id --name-only -r "$c")" && { echo "$c changes package-lock.json: revert it"; exit 1; }
  grep -q '^DSDude-WS: ' <<<"$(git log -1 --format=%B "$c")" || { echo "$c lacks the trailer: git commit --amend --no-edit --trailer 'DSDude-WS: $WS'"; exit 1; }
done
for t in $T $BR claude/$BR $(git branch --show-current); do
  if git push origin "HEAD:refs/heads/$t"; then
    [ "$t" = "$T" ] || echo "NEW push target: put 'Cloud push target: \`$t\`' under the title of $S, commit, run push.sh again, tell the user"
    exit 0
  fi
done
echo 'every push target was refused: tell the user'; exit 1
