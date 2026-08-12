#!/usr/bin/env bash
# Negative controls for test-lock-binding.mjs and the lock sections of test-pdf-textindex.mjs.
#
# Both suites were written after the fixes, so they have never been seen to fail. A green test
# that has never failed proves nothing. Each case below puts one of the real defects back —
# including the exact shapes measured in production — and asserts the suite rejects it.
#
# Case 8 is a control on the INSTRUMENT rather than the code: the first version of the
# reachability probe grepped for a literal `onToggleLock('<path>')`, the editors call it through
# a local helper, and the probe reported a missing padlock on six rows that render one. So the
# padlock detector has to be shown failing when a padlock is genuinely removed.
set -u
cd "$(dirname "$0")/.."

CFE=src/components/editors/ContractFormEditor.jsx
IFE=src/components/editors/InvoiceFormEditor.jsx
DOCS=src/components/doc/docSections.js
LEGAL=packages/templates/legal.js
PDV=src/components/pdf/PdfDocView.jsx
IDX=src/lib/pdfTextIndex.js

FILES=("$CFE" "$IFE" "$DOCS" "$LEGAL" "$PDV" "$IDX")

# Restore from copies, never `git checkout --`: scripts/negcheck-legal.sh does that and once
# destroyed an uncommitted fix in this repo.
for f in "${FILES[@]}"; do cp "$f" "/tmp/$(basename "$f").neglock.bak"; done
restore() { for f in "${FILES[@]}"; do cp "/tmp/$(basename "$f").neglock.bak" "$f"; done; }
trap restore EXIT

fails=0
expect_fail() {
  local label="$1"; local suite="${2:-scripts/test-lock-binding.mjs}"
  if node "$suite" >/tmp/neglock.txt 2>&1; then
    echo "NEGCHECK FAIL  $label — test PASSED on broken code"
    fails=$((fails+1))
  else
    echo "NEGCHECK ok    $label — rejected: $(grep -m1 'FAIL:' /tmp/neglock.txt | cut -c1-100)"
  fi
  restore
}

# 1. THE PRODUCTION BUG (FINDING 64): the contractor block is rendered without locks or a
#    toggle, exactly as it shipped. Every row becomes an enabled input for a path the server
#    silently discards.
python3 - "$CFE" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace("case 'contractor': return <ContractorBlock payload={payload} locks={locks} set={set} onToggleLock={onToggleLock} />;",
            "case 'contractor': return <ContractorBlock payload={payload} set={set} />;")
s=s.replace("function ContractorBlock({ payload, locks = {}, set, onToggleLock }) {",
            "function ContractorBlock({ payload, set }) {\n  const locks = {}; const onToggleLock = null;")
open(p,'w').write(s)
PY
sed -i "s|<LockToggle locked={L('contractor.address')} onToggle={tog('contractor.address')} />||" "$CFE"
sed -i "s|disabled={L('contractor.address')} ||" "$CFE"
expect_fail "the shipped bug: contractor rows with no padlock and a live input"

# 2. The padlock stays but the input goes back to being editable — the half-fix that still
#    reverts the user's typing half a second later.
sed -i "s|disabled={L('contractor.address')} ||" "$CFE"
expect_fail "a padlock guarding an input that still accepts keystrokes"

# 3. The invoice locks a path that cannot exist. payment_methods is z.array(z.string()); the
#    `.text` key was a no-op and the four printed methods were unprotected.
sed -i "s|^  payment_methods: true,$|  'payment_methods.text': true,|" "$LEGAL"
expect_fail "invoice lock on payment_methods.text, a path with no home in the schema"

# 4. The invoice loses the tabs that own contractor and payment_methods, so six of its seven
#    locks route nowhere and whereToUnlock returns null.
python3 - "$DOCS" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace("{ id: 'homeowner', label: 'Bill to',  blocks: ['cover', 'homeowner', 'contractor'] },",
            "{ id: 'homeowner', label: 'Bill to',  blocks: ['cover', 'homeowner'] },")
s=s.replace("{ id: 'payment',   label: 'Amount',   blocks: ['payment', 'payment_methods'] },",
            "{ id: 'payment',   label: 'Amount',   blocks: ['payment'] },")
open(p,'w').write(s)
PY
expect_fail "invoice contractor and payment methods with no tab to live in"

# 5. whereToUnlock stops naming the group, so the message says "Form › Homeowner" for the
#    company address again — true, and still the wrong place to send someone.
sed -i "s|  if (group \&\& group !== hit.label) parts.push(group);||" "$DOCS"
expect_fail "destination named only down to the tab, not the group"

# 6. The blanket sentence comes back into rendered output.
sed -i "s|text: \`\${labelForPath(r.path)} — \${reason.headline}.\`,|text: \`\${labelForPath(r.path)} is locked — required NJ contract language. Unlock it in the Legal tab.\`,|" "$PDV"
expect_fail "the untrue blanket NJ claim back in the toast"

# 7. Standard company wording is reclassified as statutory, so the count of NJ-mandated locks
#    goes from 2 to 3 and the user is told they may not change their own warranty.
python3 - "$IDX" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace("""const STATUTORY_LOCKS = {""","""const STATUTORY_LOCKS = {
  'warranties.text': { headline: 'Fixed by NJ law', detail: 'N.J.A.C. requires this wording.' },""")
open(p,'w').write(s)
PY
expect_fail "company warranty wording relabelled as required by statute"

# 8. INSTRUMENT CONTROL. Remove one padlock and prove the structural detector notices. If this
#    case passes, every "0 rows without an unlock control" result above is meaningless.
sed -i "s|<LockToggle locked={L('contractor.email')} onToggle={tog('contractor.email')} />||" "$CFE"
expect_fail "detector control: one padlock removed from a locked row"

# 9. The hyphen tolerance is removed from the resolver — every wrapped word on the page goes
#    back to refusing a click on a field that exists.
python3 - "$IDX" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace("""    const dehyph = cl.replace(/-$/, '');
    if (dehyph !== cl && dehyph.length >= 4) forms.push(dehyph);""","")
open(p,'w').write(s)
PY
expect_fail "hyphenated wrapped word refuses again" scripts/test-pdf-textindex.mjs

# 10. explainComputed disagrees with the renderer's rounding (floor instead of round), so a
#     milestone amount stops being recognised as computed and is called template chrome again.
python3 - "$IDX" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace("if (Math.round(total * pct / 100) !== cents) continue;",
            "if (Math.floor(total * pct / 100) !== cents) continue;")
open(p,'w').write(s)
PY
expect_fail "computed-amount explainer drifts from the renderer's rounding" scripts/test-pdf-textindex.mjs

restore
echo ""
if [ "$fails" -eq 0 ]; then echo "negcheck-locks: all 10 defects correctly rejected"; else echo "negcheck-locks: $fails control(s) did not fail"; fi
node scripts/test-lock-binding.mjs | tail -2
node scripts/test-pdf-textindex.mjs | tail -2
exit $fails
