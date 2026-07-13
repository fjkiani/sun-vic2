// ColumnResizer — a draggable vertical divider between two columns.
// On drag, calls onResize(deltaPx). The parent decides how to interpret it (e.g. adjust flex-basis).

import React, { useCallback, useRef } from 'react';

export function ColumnResizer({ onResize, onCommit }) {
  const startXRef = useRef(0);
  const draggingRef = useRef(false);

  const onMouseMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    startXRef.current = e.clientX;
    onResize(dx);
  }, [onResize]);

  const onMouseUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (onCommit) onCommit();
  }, [onMouseMove, onCommit]);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 flex-shrink-0 bg-neutral-200 hover:bg-sunvic-400 active:bg-sunvic-500 cursor-col-resize transition-colors"
      title="Drag to resize"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

export default ColumnResizer;
