#!/usr/bin/env bash
# negcheck-lock-nav — negative controls for the BROWSER assertions about locked fields.
#
# Why this exists: sections 5 and 5d of verify-pdf-send only ever ran against a build that
# already worked. An assertion that has never been seen to fail is not evidence. Production
# cannot be broken on purpose, so each case breaks one mechanism in the source, rebuilds, and
# drives the real browser against the local build through serve-dist-proxy. A case that still
# passes means the assertion is decorative and must be rewritten.
#
# Requires: a running `node scripts/serve-dist-proxy.mjs --port 4180 --target <deployment>`.
# Run from the repo root with a clean tree — every case restores with `git checkout --`.
#
# Usage: bash scripts/negcheck-lock-nav.sh

set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${NEGCHECK_BASE:-http://localhost:4180}"
LOG=/tmp/negcheck-lock-nav
mkdir -p "$LOG"
pass=0; fail=0

if [ -n "$(git status --porcelain)" ]; then
  echo "REFUSING: working tree is dirty. Commit first — every case runs 'git checkout --'."
  git status --porcelain
  exit 2
fi

restore() { git checkout -- "$@" >/dev/null 2>&1; }

# $1 label  $2 expected-failing-assertion (grep -F)  $3 file(s) restored  $4.. mutation command
case_run() {
  local label="$1"; shift
  local expect="$1"; shift
  local files="$1"; shift
  local slug; slug=$(echo "$label" | tr -cd '[:alnum:]' | cut -c1-24)

  echo ""
  echo "── $label"
  "$@"
  if ! git diff --quiet -- $files; then :; else
    echo "   FAIL  mutation changed nothing — the control never ran"
    fail=$((fail+1)); restore $files; return
  fi

  if ! npm run build >"$LOG/$slug.build" 2>&1; then
    echo "   FAIL  build broke, so the browser never judged anything"
    fail=$((fail+1)); restore $files; npm run build >/dev/null 2>&1; return
  fi

  node scripts/verify-pdf-send.mjs --base "$BASE" --shots "$LOG/shots-$slug" >"$LOG/$slug.out" 2>&1
  local code=$?
  if [ $code -ne 0 ] && grep -qF "FAIL $expect" "$LOG/$slug.out"; then
    echo "   ok    caught: FAIL $expect"
    pass=$((pass+1))
  elif [ $code -ne 0 ]; then
    echo "   FAIL  the suite failed, but not on the assertion under control:"
    grep -F "FAIL " "$LOG/$slug.out" | head -4 | sed 's/^/         /'
    fail=$((fail+1))
  else
    echo "   FAIL  broken code still passed — this assertion proves nothing"
    fail=$((fail+1))
  fi
  restore $files
}

# 1 ── the accordion stops naming its sections, so "take me there" cannot open the block that
#      holds the row. This is the layer that actually hid contractor.address.
case_run "accordion sections become anonymous" \
  "tapping it mounts the field row, no hunting" \
  "src/components/ui/Accordion.jsx" \
  perl -0pi -e 's/\n\s*data-accordion-item=\{id\}//' src/components/ui/Accordion.jsx

# 2 ── the Advanced disclosure stops advertising the paths it hides. contractor.address is
#      inside one, so the row stays out of the DOM even with the right block open.
case_run "Advanced hides what it contains" \
  "tapping it mounts the field row, no hunting" \
  "src/components/editors/ContractFormEditor.jsx" \
  perl -0pi -e 's/data-advanced-paths=\{hidden \|\| undefined\}/data-advanced-paths={undefined}/' \
  src/components/editors/ContractFormEditor.jsx

# 3 ── the message names a tab the app does not open. The toast text and the tab state are read
#      from two independent places, so the cross-check must catch the lie.
case_run "the toast names the wrong tab" \
  "it landed on the tabs it promised" \
  "src/components/doc/docSections.js" \
  perl -0pi -e "s/const tabLabel = loc\.tab === 'form' \? 'Form' : 'Legal';/const tabLabel = 'Legal';/" \
  src/components/doc/docSections.js

# 4 ── verbatim statute offers an inline unlock. N.J.S.A. 56:8-151 prescribes the cancellation
#      notice word for word; an "unlock and edit" button there is the one case where the old
#      "you cannot change this" was true.
case_run "statutory clause offers an inline unlock" \
  "no inline unlock is offered for verbatim statute" \
  "src/lib/pdfTextIndex.js" \
  perl -0pi -e 's/inlineUnlock: false/inlineUnlock: true/g' src/lib/pdfTextIndex.js

echo ""
npm run build >/dev/null 2>&1
if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: tree not clean after restore:"; git status --porcelain
fi
echo "negcheck-lock-nav: $pass controls fired, $fail did not"
[ $fail -eq 0 ] || exit 1
