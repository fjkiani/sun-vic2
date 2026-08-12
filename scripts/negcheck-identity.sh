#!/usr/bin/env bash
# Negative controls for test-identity-binding.mjs.
# A regression test that has never been seen to fail is not evidence of anything.
# Each case reintroduces one real defect — including the exact production bug — and
# asserts the test rejects it.
set -u
cd "$(dirname "$0")/.."

SCHEMA=packages/schema/documents.js
CONFIG=packages/config/business.js
CPDF=packages/templates/pdf/ContractPDF.jsx
IPDF=packages/templates/pdf/InvoicePDF.jsx
LEGAL=packages/templates/legal.js

# Restore from a copy of the working tree, never from git: `git checkout -- <file>` reverts to
# HEAD and has silently destroyed uncommitted work in this repo before.
for f in "$SCHEMA" "$CONFIG" "$CPDF" "$IPDF" "$LEGAL"; do cp "$f" "/tmp/$(basename "$f").negid.bak"; done
restore() {
  for f in "$SCHEMA" "$CONFIG" "$CPDF" "$IPDF" "$LEGAL"; do cp "/tmp/$(basename "$f").negid.bak" "$f"; done
  node scripts/build-pdf-templates.mjs >/dev/null 2>&1
}
trap restore EXIT

fails=0
expect_fail() {
  local label="$1"
  node scripts/build-pdf-templates.mjs >/dev/null 2>&1
  if node scripts/test-identity-binding.mjs >/tmp/negid.txt 2>&1; then
    echo "NEGCHECK FAIL  $label — test PASSED on broken code"
    fails=$((fails+1))
  else
    echo "NEGCHECK ok    $label — rejected: $(grep -m1 '  - ' /tmp/negid.txt | cut -c1-104)"
  fi
  restore
}

# 1. THE PRODUCTION BUG, exactly as it shipped: the template prints contractor.address_footer,
#    the schema does not declare it, so zod strips it and a frozen constant is printed instead.
sed -i "/^  address_footer: z.string().default(CONTRACTOR.address_footer),$/d" "$SCHEMA"
sed -i "s|address_footer: envStr('BUSINESS_ADDRESS_FOOTER', '')|address_footer: envStr('BUSINESS_ADDRESS_FOOTER', '6 Stone Ridge Rd ,Old Bridge, NJ, 08857')|" "$CONFIG"
sed -i "s|address_footer: c.address_footer \|\| address,|address_footer: c.address_footer \|\| CONTRACTOR.address_footer,|" "$CPDF"
expect_fail "the shipped bug: address_footer printed but not in the schema"

# 2. Config gains an identity key the schema does not know about (defaults.js will spread it,
#    zod will strip it, and whatever prints it falls back to a constant).
sed -i "s|  website:        envStr('BUSINESS_WEBSITE', 'www.sunvicnj.com'),|  website:        envStr('BUSINESS_WEBSITE', 'www.sunvicnj.com'),\n  fax_number:     envStr('BUSINESS_FAX', '+1 (732) 000-0000'),|" "$CONFIG"
expect_fail "config identity key with no schema declaration"

# 3. The footer stops reading the payload and goes back to a config constant only.
sed -i "s|address_footer: c.address_footer \|\| address,|address_footer: CONTRACTOR.address_footer \|\| CONTRACTOR.address,|" "$CPDF"
expect_fail "contract footer bypasses the payload"

# 4. Same, on the invoice — where the address was ONLY ever printed via the footer key.
sed -i "s|address_footer: c.address_footer \|\| address,|address_footer: CONTRACTOR.address \|\| '',|" "$IPDF"
expect_fail "invoice header/footer bypasses the payload"

# 5. The third address spelling returns to the statutory cancellation notice.
sed -i "s|^\${CONTRACTOR.address}$|6 Stone Ridge Rd. ,Old Bridge,08857,NJ|" "$LEGAL"
expect_fail "a second spelling of the street address in one document"

# 6. A new unreachable identity string appears in PDF chrome (allow-list must not absorb it).
sed -i "s|<Text style={s.bulletText}>Cash (ONLY accepted with a signed receipt)</Text>|<Text style={s.bulletText}>Wire to SUNVIC CONTRACTORS LLC, +1 (732) 824-9203</Text>|" "$CPDF"
expect_fail "new hardcoded identity string in template chrome"

restore
echo ""
if [ "$fails" -eq 0 ]; then echo "negcheck-identity: all 6 defects correctly rejected"; else echo "negcheck-identity: $fails control(s) did not fail"; fi
node scripts/test-identity-binding.mjs | tail -2
exit $fails
