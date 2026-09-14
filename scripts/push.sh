#!/usr/bin/env bash
#
# push.sh — commit everything and send it to GitHub, in one command.
#
#     ./scripts/push.sh "what I changed"
#
# Stops on main, because SOP §38 requires a branch and a pull request.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

msg="${1:-}"
if [ -z "$msg" ]; then
  echo 'Say what changed:  ./scripts/push.sh "fixed the trials list"'
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" = "main" ]; then
  echo "You are on main, which is protected. Make a branch first:"
  echo "    git checkout -b fix/short-topic"
  exit 1
fi

if [ -z "$(git status --porcelain)" ] && git diff --quiet "origin/$branch" 2>/dev/null; then
  echo "Nothing to send — no changes and nothing waiting."
  exit 0
fi

git add -A
git commit -q -m "$msg" || echo "Nothing new to commit; sending what was already committed."

# Retry a few times: a failed push here is almost always the network.
for wait in 0 2 4 8; do
  [ "$wait" -gt 0 ] && sleep "$wait"
  if git push -u origin "$branch"; then
    echo ""
    echo "Sent. Open the pull request here:"
    echo "    https://github.com/RohithKarne/pharaxis-one/pull/new/$branch"
    exit 0
  fi
done

echo "Push failed four times. Check your internet, then run the same command again."
exit 1
