#!/usr/bin/env bash
#
# branch-status.sh — what is actually in main, branch by branch. Read-only. (CPPM-45)
#
# Why: on 29 Sep 2026 a status report told the CEO that every open branch "needed
# catching up with main", when all of them already contained it. The claim was read
# off main's history and a stale local copy of main, and squash merges make work that
# is already in main look missing when branches are compared commit by commit. This
# script asks git the direct questions, and every status or pending list quotes its
# output (SOP §39.9).
#
# It never pushes, merges, checks out or changes a branch. It refreshes the local copy
# of origin/main (a fetch) and then only reads; the merge it tries is simulated in
# memory (git merge-tree) and touches no branch and no working files.
#
# Usage:
#   docs/scripts/branch-status.sh                  # every local feat/ fix/ docs/ chore/ branch
#   docs/scripts/branch-status.sh 'fix/CPPM-4*'    # branches matching a pattern
#
# Columns:
#   CONTAINS-MAIN  yes = the branch already has main's latest commit, so nothing to catch up
#   FILES          files the branch changes since it left main
#   IN-MAIN        yes     = merging the branch into main would change nothing: its work is
#                            already in main (this is what sees through squash merges)
#                  no      = merging would still change files in main (count shown)
#                  unclear = main has since changed the same lines, so a merge would conflict;
#                            read the ticket's own record before saying either way

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
PATTERN="${1:-}"

if ! git fetch --quiet origin '+main:refs/remotes/origin/main'; then
  echo "Could not refresh main from origin — refusing to report on a stale copy." >&2
  exit 1
fi
MAIN_TREE=$(git rev-parse 'origin/main^{tree}')

echo "main: $(git log -1 --format='%h %s' origin/main | cut -c1-100)"
echo "read: $(date '+%Y-%m-%d %H:%M %Z')"
echo
printf '%-52s %-14s %-6s %s\n' BRANCH CONTAINS-MAIN FILES IN-MAIN

if [ -n "$PATTERN" ]; then
  REFS=$(git for-each-ref --format='%(refname:short)' "refs/heads/$PATTERN")
else
  REFS=$(git for-each-ref --format='%(refname:short)' refs/heads/feat refs/heads/fix refs/heads/docs refs/heads/chore)
fi

for b in $REFS; do
  if git merge-base --is-ancestor origin/main "$b"; then contains=yes; else contains=no; fi

  # Three dots: what the branch changed since it left main, not what main did since.
  files=$(git diff --name-only "origin/main...$b" | grep -c .)

  # Would merging this branch change main? Simulated in memory; exit status 1 = conflict.
  out=$(git merge-tree --write-tree origin/main "$b" 2>/dev/null); rc=$?
  merged=${out%%$'\n'*}
  if [ "$rc" -eq 0 ] && [ "$merged" = "$MAIN_TREE" ]; then
    inmain="yes"
  elif [ "$rc" -eq 0 ]; then
    inmain="no ($(git diff --name-only "$MAIN_TREE" "$merged" | grep -c .) files would change)"
  else
    inmain="unclear (main changed the same lines since)"
  fi
  printf '%-52s %-14s %-6s %s\n' "$b" "$contains" "$files" "$inmain"
done
