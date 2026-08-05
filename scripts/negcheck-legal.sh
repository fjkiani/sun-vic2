#!/usr/bin/env bash
# Negative controls for test-legal-binding.mjs.
# A regression test that has never been seen to fail is not evidence of anything.
# Each case reintroduces one real defect and asserts the test rejects it.
set -u
cd "$(dirname "$0")/.."

META=src/components/editors/legal/legalMeta.js
EDITOR=src/components/editors/LegalEditor.jsx
PDF=packages/templates/pdf/ContractPDF.jsx
cp "$META" /tmp/meta.bak; cp "$EDITOR" /tmp/editor.bak; cp "$PDF" /tmp/pdf.bak
restore() { cp /tmp/meta.bak "$META"; cp /tmp/editor.bak "$EDITOR"; cp /tmp/pdf.bak "$PDF"; }
trap restore EXIT

fails=0
expect_fail() {
  local label="$1"
  if node scripts/test-legal-binding.mjs >/tmp/out.txt 2>&1; then
    echo "NEGCHECK FAIL  $label — test PASSED on broken code"
    fails=$((fails+1))
  else
    echo "NEGCHECK ok    $label — rejected: $(grep -m1 '^FAIL' /tmp/out.txt | cut -c1-110)"
  fi
  restore
}

# 1. The original bug: declare + write the non-existent permits.text
sed -i "s|paths: \['permits.intro', 'permits.contractor_responsible', 'permits.homeowner_responsible'\]|paths: ['permits.text']|" "$META"
sed -i "s|set({ 'permits.intro': v })|set({ 'permits.text': v })|" "$EDITOR"
expect_fail "permits.text (the original dead-path bug)"

# 2. dispute_resolution.text, the second dead path
sed -i "s|paths: \['dispute_resolution.intro', 'dispute_resolution.steps', 'dispute_resolution.footer'\]|paths: ['dispute_resolution.text']|" "$META"
expect_fail "dispute_resolution.text declared"

# 3. Editor writes a path legalMeta never declared (escapes schema + PDF checks)
sed -i "s|set({ 'insurance.text': v })|set({ 'insurance.blurb': v })|" "$EDITOR"
expect_fail "undeclared write insurance.blurb"

# 4. A declared path the PDF does not read (edit changes nothing on the contract)
sed -i "s|'warranties.materials_text'|'warranties.one_year_workmanship'|" "$META"
expect_fail "declared path the PDF never prints"

# 5. PDF alias renamed out from under the editor
sed -i "s|const perm = payload.permits|const permits_ = payload.permits|" "$PDF"
expect_fail "ContractPDF alias rename"

# 6. A legal sub-tab routes to a block with no metadata
sed -i "s|blocks: \['right_to_cancel', 'dispute_resolution'\]|blocks: ['right_to_cancel', 'dispute_resolution', 'arbitration_rider']|" src/components/doc/docSections.js
if node scripts/test-legal-binding.mjs >/tmp/out.txt 2>&1; then
  echo "NEGCHECK FAIL  orphan sub-tab block — test PASSED on broken code"; fails=$((fails+1))
else
  echo "NEGCHECK ok    orphan sub-tab block — rejected: $(grep -m1 '^FAIL' /tmp/out.txt | cut -c1-110)"
fi
git checkout -- src/components/doc/docSections.js 2>/dev/null || cp /tmp/docsections.bak src/components/doc/docSections.js

restore
echo ""
if [ "$fails" -eq 0 ]; then echo "negcheck-legal: all 6 defects correctly rejected"; else echo "negcheck-legal: $fails control(s) did not fail"; fi
node scripts/test-legal-binding.mjs | tail -2
exit $fails
