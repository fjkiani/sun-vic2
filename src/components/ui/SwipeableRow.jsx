import React, { useCallback, useRef, useState } from 'react';

// Swipe-to-delete built on native pointer events — deliberately no gesture dependency,
// the main bundle is already ~1.9 MB.
//
// Behaviour contract (see ITER6 plan, decision 2):
//   - drag left past THRESHOLD and release  -> onAction()   (recoverable soft delete)
//   - same gesture with requireConfirm=true -> onConfirmRequired()  (signed/sent/paid)
//   - anything short of the threshold       -> snaps back, no mutation
//
// Vertical scrolling must keep working, so the first ~10px of movement decides the axis
// and we only capture the pointer once we're confident the gesture is horizontal.
// `touch-action: pan-y` lets the browser own vertical panning natively (no jank) while
// leaving horizontal movement to us.

const THRESHOLD = 88;   // px of travel before the action arms
const MAX_PULL = 132;   // px the row can travel before rubber-banding
const ENGAGE = 10;      // px before we commit to an axis

export function SwipeableRow({
  children,
  onAction,
  onConfirmRequired,
  requireConfirm = false,
  disabled = false,
  actionLabel = 'Delete',
  className = '',
}) {
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const startRef = useRef(null);
  const axisRef = useRef(null); // null | 'x' | 'y'
  const dxRef = useRef(0);

  const setOffset = useCallback((v) => {
    dxRef.current = v;
    setDx(v);
  }, []);

  const snapBack = useCallback(() => {
    setSettling(true);
    setOffset(0);
    startRef.current = null;
    axisRef.current = null;
    window.setTimeout(() => setSettling(false), 200);
  }, [setOffset]);

  const onPointerDown = (e) => {
    if (disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    axisRef.current = null;
    setSettling(false);
  };

  const onPointerMove = (e) => {
    if (disabled || !startRef.current) return;
    const ddx = e.clientX - startRef.current.x;
    const ddy = e.clientY - startRef.current.y;

    if (!axisRef.current) {
      if (Math.abs(ddx) < ENGAGE && Math.abs(ddy) < ENGAGE) return;
      axisRef.current = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
      if (axisRef.current === 'x') {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
      }
    }
    if (axisRef.current !== 'x') return;

    // Left-swipe only. Past MAX_PULL the row resists so the gesture feels bounded.
    const raw = Math.min(0, ddx);
    const next = raw < -MAX_PULL ? -MAX_PULL + (raw + MAX_PULL) * 0.18 : raw;
    setOffset(next);
  };

  const finish = () => {
    if (disabled || !startRef.current) return;
    const travelled = Math.abs(dxRef.current);
    const wasHorizontal = axisRef.current === 'x';
    if (wasHorizontal && travelled >= THRESHOLD) {
      snapBack();
      // Defer so the row is visually settled before the parent mutates or opens a sheet.
      window.setTimeout(() => {
        if (requireConfirm) onConfirmRequired?.();
        else onAction?.();
      }, 0);
      return;
    }
    snapBack();
  };

  const armed = Math.abs(dx) >= THRESHOLD;
  const revealed = Math.abs(dx);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Action backdrop — only rendered while the row is actually displaced. */}
      {revealed > 0 && (
        <div
          className={`absolute inset-y-0 right-0 flex items-center justify-end pr-4 transition-colors ${
            armed ? 'bg-rose-600' : 'bg-rose-400'
          }`}
          style={{ width: Math.max(revealed, 72) }}
          aria-hidden="true"
        >
          <span className="text-white text-xs font-semibold whitespace-nowrap">
            {armed ? (requireConfirm ? 'Confirm…' : `Release to ${actionLabel.toLowerCase()}`) : actionLabel}
          </span>
        </div>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={snapBack}
        style={{
          transform: `translate3d(${dx}px,0,0)`,
          transition: settling ? 'transform 200ms cubic-bezier(0.2,0,0,1)' : 'none',
          touchAction: 'pan-y',
        }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}
