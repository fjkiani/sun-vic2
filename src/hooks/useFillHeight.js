import { useLayoutEffect, useState } from 'react';

// Measures the real space between an element's top edge and the bottom of the *visual*
// viewport, so full-height panes stop relying on hardcoded `calc(100vh - 9.5rem)` magic.
//
// Why not just 100vh: on iOS Safari `100vh` is the height with the browser chrome
// *retracted*, so a 100vh pane is taller than what you can actually see and the bottom
// gets hidden behind the toolbar. visualViewport reports what is genuinely on screen and
// also shrinks when the software keyboard opens, which keeps a docked input visible.
//
// Returns a pixel number (or null before first measure). Pass `bottomGap` for any fixed
// chrome the element sits above, e.g. the mobile bottom tab bar.
export function useFillHeight(ref, { bottomGap = 0, min = 240 } = {}) {
  const [height, setHeight] = useState(null);

  useLayoutEffect(() => {
    const el = ref?.current;
    if (!el || typeof window === 'undefined') return undefined;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = ref?.current;
        if (!node) return;
        const top = node.getBoundingClientRect().top;
        const vv = window.visualViewport;
        // visualViewport.height excludes browser chrome; offsetTop accounts for the page
        // being scrolled under a pinch-zoomed viewport.
        const viewportBottom = vv ? vv.height : window.innerHeight;
        const next = Math.max(min, Math.round(viewportBottom - top - bottomGap));
        setHeight((prev) => (prev === next ? prev : next));
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);

    // The element's own top can move when content above it grows (banners, conflict bars).
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(document.body);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [ref, bottomGap, min]);

  return height;
}

// Height of the mobile bottom tab bar plus the iOS home-indicator inset, in px.
// Read once per call so it tracks orientation changes.
export function bottomBarGap() {
  if (typeof window === 'undefined') return 72;
  const probe = window.getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom');
  const inset = Number.parseInt(probe, 10);
  return 72 + (Number.isFinite(inset) ? inset : 0);
}
