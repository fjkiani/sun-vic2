// test-swipe-policy — asserts the swipe-to-delete behaviour contract from the
// ITER6 plan (decision 2) without needing a DOM.
//
//   below threshold           -> snaps back, no mutation
//   above threshold + draft   -> delete, undo restores
//   above threshold + signed  -> confirm sheet, no mutation
//
// The gesture maths and the guard policy are both pure functions, so this exercises the
// real code paths the component and the Work list use rather than a re-implementation.

import {
  THRESHOLD, MAX_PULL, ENGAGE, swipeOutcome, swipeOffset, resolveAxis,
} from '../src/components/ui/swipeMath.js';
import {
  isDocGuarded, isProjectGuarded, GUARDED_DOC_STATUSES,
} from '../src/components/work/deletePolicy.js';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('\n— axis detection —');
eq('tiny jitter commits to no axis', resolveAxis(3, 4), null);
eq('mostly-horizontal commits to x', resolveAxis(-40, 6), 'x');
eq('mostly-vertical commits to y (scroll must keep working)', resolveAxis(-6, 40), 'y');
eq('exactly at ENGAGE on y commits to y', resolveAxis(0, ENGAGE), 'y');

console.log('\n— threshold —');
eq('1px short of threshold does nothing', swipeOutcome({ axis: 'x', travelled: -(THRESHOLD - 1) }), 'none');
eq('exactly at threshold arms', swipeOutcome({ axis: 'x', travelled: -THRESHOLD }), 'action');
eq('well past threshold arms', swipeOutcome({ axis: 'x', travelled: -200 }), 'action');
eq('vertical gesture never arms', swipeOutcome({ axis: 'y', travelled: -200 }), 'none');
eq('undecided axis never arms', swipeOutcome({ axis: null, travelled: -200 }), 'none');
eq('disabled row never arms', swipeOutcome({ axis: 'x', travelled: -200, disabled: true }), 'none');
eq('right-swipe (positive travel) is not a delete', swipeOutcome({ axis: 'x', travelled: 200 }), 'none');
eq('NaN travel is not a delete', swipeOutcome({ axis: 'x', travelled: NaN }), 'none');

console.log('\n— guarded rows open a sheet instead of mutating —');
eq('draft row deletes', swipeOutcome({ axis: 'x', travelled: -120, requireConfirm: false }), 'action');
eq('guarded row asks first', swipeOutcome({ axis: 'x', travelled: -120, requireConfirm: true }), 'confirm');
eq('guarded row below threshold still does nothing', swipeOutcome({ axis: 'x', travelled: -10, requireConfirm: true }), 'none');

console.log('\n— rubber band —');
eq('no travel', swipeOffset(0), 0);
eq('right-drag is clamped to 0 (left swipe only)', swipeOffset(60), 0);
eq('inside MAX_PULL tracks the finger 1:1', swipeOffset(-50), -50);
eq('exactly MAX_PULL', swipeOffset(-MAX_PULL), -MAX_PULL);
ok('past MAX_PULL resists',
  swipeOffset(-300) > -MAX_PULL - 40 && swipeOffset(-300) < -MAX_PULL,
  `got ${swipeOffset(-300)}`);
ok('resistance is monotonic', swipeOffset(-400) < swipeOffset(-300));

console.log('\n— document guard policy —');
eq('draft is not guarded', isDocGuarded({ status: 'draft' }), false);
eq('void is not guarded', isDocGuarded({ status: 'void' }), false);
for (const s of GUARDED_DOC_STATUSES) {
  eq(`${s} is guarded`, isDocGuarded({ status: s }), true);
}
eq('status casing is ignored', isDocGuarded({ status: 'SIGNED' }), true);
eq('missing status is treated as unguarded draft', isDocGuarded({}), false);

console.log('\n— project guard policy —');
eq('empty project is not guarded', isProjectGuarded({ contract_total_cents: 0 }), false);
eq('project with no total field is not guarded', isProjectGuarded({}), false);
eq('project carrying value is guarded', isProjectGuarded({ contract_total_cents: 6500000 }), true);
eq('one cent is still value', isProjectGuarded({ contract_total_cents: 1 }), true);

console.log('\n— the live signed contract must be protected —');
// CTR-2026-0017 (288b1faf-26e0-4b58-8b8e-91e0575daafc), $65,000, status signed.
const live = { doc_number: 'CTR-2026-0017', status: 'signed', total_cents: 6500000 };
eq('CTR-2026-0017 is guarded', isDocGuarded(live), true);
eq('a full swipe on it opens a sheet, not a delete',
  swipeOutcome({ axis: 'x', travelled: -300, requireConfirm: isDocGuarded(live) }), 'confirm');

console.log(`\nPASS ${pass} FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
