import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Measures the real space between an element's top edge and the bottom of the *visual*
// viewport, so full-height panes stop relying on hardcoded `calc(100vh - 9.5rem)` magic.
//
// Why not just 100vh: on iOS Safari `100vh` is the height with the browser chrome
// *retracted*, so a 100vh pane is taller than what you can actually see and the bottom
// gets hidden behind the toolbar. visualViewport reports what is genuinely on screen and
// also shrinks when the software keyboard opens, which keeps a docked input visible.
//
// Returns a pixel number (or null before the first successful measure). Pass `bottomGap`
// for any fixed chrome the element sits above, e.g. the mobile bottom tab bar.
//
// Callers almost always sit behind a loading guard:
//
//   if (isLoading) return <Spinner/>;      // ref target does not exist yet
//   return <div ref={paneRef} style={{height}}/>;
//
// so the element attaches on a LATER render than the one the hook first ran on. React
// does not re-run an effect when `ref.current` changes, so a naive
// `useLayoutEffect(..., [ref])` measures null once and never again — the pane would stay
// unsized forever. We therefore (a) never bail out of the listener effect just because
// the node is missing, and (b) re-measure after every render until a node shows up.
export function useFillHeight(ref, { bottomGap = 0, min = 240 } = {}) {
  const [height, setHeight] = useState(null);
  const frameRef = useRef(0);

  const measure = useCallback(() => {
    if (typeof window === 'undefined') return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const node = ref?.current;
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      const vv = window.visualViewport;
      // visualViewport.height excludes browser chrome and shrinks for the keyboard.
      const viewportBottom = vv ? vv.height : window.innerHeight;
      const next = Math.max(min, Math.round(viewportBottom - top - bottomGap));
      setHeight((prev) => (prev === next ? prev : next));
    });
  }, [ref, bottomGap, min]);

  // Listeners live for the whole lifetime of the hook, whether or not the node exists yet.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);

    // The element's own top can move when content above it grows (banners, conflict bars).
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(document.body);
    }
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [measure]);

  // Runs after EVERY render (no dep array) so the first render on which the ref actually
  // attaches gets measured. Cheap: one rAF + one getBoundingClientRect, and setHeight
  // bails when the value is unchanged so this cannot loop.
  useLayoutEffect(() => { measure(); });

  return height;
}

// Height of the mobile bottom tab bar plus the iOS home-indicator inset, in px.
// The bar is `md:hidden`, so at md+ there is nothing to clear and the gap is 0 —
// otherwise every desktop pane would be short by a phantom 72px.
// Read once per call so it tracks orientation and breakpoint changes.
export function bottomBarGap() {
  if (typeof window === 'undefined') return 72;
  if (window.matchMedia?.('(min-width: 768px)')?.matches) return 0;
  const probe = window.getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom');
  const inset = Number.parseInt(probe, 10);
  return 72 + (Number.isFinite(inset) ? inset : 0);
}
