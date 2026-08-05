#!/usr/bin/env bash
# Negative control for scripts/test-guardrails.mjs.
#
# A suite that passes on its first run is not evidence — it may simply be asserting
# things that cannot fail. This reintroduces each defect the guardrails exist to
# prevent, one at a time, and requires the suite to reject it. If a mutation is
# applied and the suite still passes, the corresponding assertion is decorative.
#
# Every mutation is verified to have actually changed the file before the suite runs,
# so a no-op edit cannot masquerade as a passing negative control.
set -uo pipefail
cd "$(dirname "$0")/.."

SRC=packages/validation/guardrails.js
BASE_SHA=$(git rev-parse HEAD)
PASSES=0
FAILS=0

restore() { git checkout "$BASE_SHA" -- "$SRC"; }
trap restore EXIT

run_case() {
  local name="$1"; shift
  local before after failcount
  before=$(md5sum "$SRC" | cut -d' ' -f1)
  "$@"
  after=$(md5sum "$SRC" | cut -d' ' -f1)
  if [ "$before" = "$after" ]; then
    echo "  BROKEN NEGCHECK  $name  (mutation did not apply — pattern is stale)"
    FAILS=$((FAILS + 1)); restore; return
  fi
  local out rc summary
  out=$(node scripts/test-guardrails.mjs 2>&1); rc=$?
  summary=$(echo "$out" | grep -oE 'FAIL [0-9]+' | tail -1 | awk '{print $2}')
  if [ -z "$summary" ]; then
    # No summary line means the suite died partway through. That is still a rejection,
    # but a weak one: every assertion after the crash point never ran.
    echo "  rejected (suite crashed, rc=$rc)  $name"
    PASSES=$((PASSES + 1))
  elif [ "$summary" -gt 0 ]; then
    echo "  rejected ($summary assertions fired)  $name"
    echo "$out" | grep -E '^\s*(FAIL|fail)' | head -3 | sed 's/^/      /'
    PASSES=$((PASSES + 1))
  else
    echo "  NOT CAUGHT       $name  <-- the suite does not actually test this"
    FAILS=$((FAILS + 1))
  fi
  restore
}

# 1. The original bug: raw float reduce plus a tolerance comparison.
#    Note this must mutate scheduleSum itself. An earlier version of this mutation left
#    scheduleSum as `hundredths / SCALE` and only changed how the hundredths were summed;
#    that round-trip (x * 100) / 100 silently snaps 99.99000000000001 back to 99.99 and
#    therefore repairs the defect it was supposed to reintroduce. Reproduce the real thing.
m_float() {
  perl -0pi -e "s/  return scheduleSumHundredths\(schedule\) \/ SCALE;/  return (schedule || []).reduce((a, r) => a + (Number(r?.percent) || 0), 0);/s" "$SRC"
  perl -0pi -e "s/  return scheduleSumHundredths\(schedule\) === FULL;/  return Math.abs(scheduleSum(schedule) - 100) < SCHEDULE_TOLERANCE;/s" "$SRC"
}

# 2. Protected-status list drifts away from the swipe-delete list.
m_statuses() { perl -pi -e "s/\['sent', 'signed', 'paid', 'overdue'\]/['sent', 'signed', 'paid']/" "$SRC"; }

# 3. Writes to sent/signed/paid stop requiring confirmation.
m_writeguard() { perl -0pi -e "s/  if \(!hasPayloadChange\) return null;\n  if \(!GUARDED_WRITE_STATUSES/  if (!hasPayloadChange) return null;\n  return null;\n  if (!GUARDED_WRITE_STATUSES/s" "$SRC"; }

# 4. A required field silently stops being required.
m_required() { perl -0pi -e "s/    \['timeline\.start_date', 'a start date'\],\n//s" "$SRC"; }

# 5. The agent is blamed for pre-existing problems (breaks self-repair).
m_introduced() { perl -0pi -e "s/  const had = new Set\(validatePayload\(before, template\)\.issues\.map\(key\)\);/  const had = new Set();/s" "$SRC"; }

# 6. Money reconciliation tolerance made meaningless.
m_money() { perl -pi -e "s/export const MONEY_TOLERANCE_CENTS = 100;/export const MONEY_TOLERANCE_CENTS = 100000000;/" "$SRC"; }

echo "negcheck-guardrails: reintroducing defects the suite must reject"
run_case "float percent tolerance (layout-dependent verdicts)" m_float
run_case "guarded-status list drifts from swipe-delete policy"  m_statuses
run_case "signed/sent/paid writes need no confirmation"         m_writeguard
run_case "start date is no longer required before delivery"     m_required
run_case "agent blamed for pre-existing issues"                 m_introduced
run_case "money reconciliation tolerance neutered"              m_money

restore
FINAL=$(node scripts/test-guardrails.mjs 2>/dev/null | tail -2 | tr -d '\n')
echo
echo "restored: $FINAL"
echo "negcheck-guardrails: REJECTED $PASSES / 6, missed $FAILS"
[ "$FAILS" -eq 0 ] || exit 1
echo "$FINAL" | grep -q "FAIL 0" || { echo "restore did not return the suite to green"; exit 1; }
