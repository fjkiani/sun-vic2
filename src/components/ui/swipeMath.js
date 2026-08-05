// Pure gesture maths for SwipeableRow. Kept React-free and in a .js file so
// scripts/test-swipe-policy.mjs can import and assert the real decision rules under
// plain node — no DOM, no JSX transform, no re-implementation of the logic under test.

export const THRESHOLD = 88;   // px of travel before the action arms
export const MAX_PULL = 132;   // px the row can travel before rubber-banding
export const ENGAGE = 10;      // px before we commit to an axis

// Which axis a gesture has committed to once it clears ENGAGE. `null` = undecided,
// which is what keeps vertical list scrolling working.
export function resolveAxis(ddx, ddy) {
  if (Math.abs(ddx) < ENGAGE && Math.abs(ddy) < ENGAGE) return null;
  return Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
}

// Rubber-band curve: 1:1 with the finger up to MAX_PULL, then heavily damped so the
// gesture feels bounded rather than infinite.
export function swipeOffset(ddx) {
  const raw = Math.min(0, ddx);
  return raw < -MAX_PULL ? -MAX_PULL + (raw + MAX_PULL) * 0.18 : raw;
}

// The release decision (ITER6 plan, decision 2):
//   'none'    -> snap back, nothing mutates
//   'action'  -> soft delete + undo
//   'confirm' -> open the confirm sheet, still nothing mutates
// `travelled` is signed: negative is leftward. Delete is a LEFT swipe only — an
// abs() here would let a rightward drag arm the delete. swipeOffset() currently clamps
// positive travel to 0 so the component can never feed one in, but the rule belongs in
// the decision function rather than depending on a caller's clamp.
export function swipeOutcome({ axis, travelled, requireConfirm = false, disabled = false }) {
  if (disabled) return 'none';
  if (axis !== 'x') return 'none';
  if (!(travelled <= -THRESHOLD)) return 'none';
  return requireConfirm ? 'confirm' : 'action';
}
