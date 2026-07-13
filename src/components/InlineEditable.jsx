import React, { useRef, useEffect, useState } from 'react';

/**
 * A contenteditable primitive that commits on blur or Ctrl+Enter, reverts on Escape.
 * Never uses dangerouslySetInnerHTML — text goes via .textContent / .innerText.
 *
 * Props:
 *  - value: string
 *  - onSave: (newText: string) => void
 *  - as?: 'span'|'div'|'p'|'h1'|'h2'|'li' (default 'span')
 *  - placeholder?: string
 *  - multiline?: boolean (default false)
 *  - locked?: boolean
 *  - className?: string
 */
export function InlineEditable({
  value = '',
  onSave,
  as = 'span',
  placeholder = '',
  multiline = false,
  locked = false,
  className = '',
  ...rest
}) {
  const ref = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const savedValueRef = useRef(value);

  // Sync external changes into the DOM (only when not focused, to avoid caret jumps)
  useEffect(() => {
    if (!ref.current) return;
    const v = value == null ? '' : (typeof value === 'string' ? value : String(value));
    if (!isFocused && ref.current.textContent !== v) {
      ref.current.textContent = v;
    }
    savedValueRef.current = v;
  }, [value, isFocused]);

  const commit = () => {
    if (!ref.current) return;
    const newText = ref.current.innerText.trim();
    if (newText !== savedValueRef.current) {
      onSave?.(newText);
      savedValueRef.current = newText;
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    commit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (ref.current) ref.current.textContent = savedValueRef.current;
      ref.current?.blur();
      return;
    }
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      ref.current?.blur();
      return;
    }
    if (multiline && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      ref.current?.blur();
      return;
    }
  };

  // Defensive: coerce non-strings so a mis-typed prop never crashes React with error #31.
  const safeValue = value == null ? '' : (typeof value === 'string' ? value : String(value));
  const isEmpty = safeValue === '';
  const showPlaceholder = isEmpty && !isFocused;

  const Component = as;
  return (
    <Component
      ref={ref}
      contentEditable={!locked}
      suppressContentEditableWarning
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      className={[
        'inline-editable outline-none',
        locked
          ? 'text-neutral-500 cursor-not-allowed'
          : 'hover:outline hover:outline-1 hover:outline-sunvic-300 rounded-sm px-0.5',
        isFocused ? 'outline outline-2 outline-sunvic-500 bg-sunvic-50' : '',
        showPlaceholder ? 'text-neutral-400 italic' : '',
        className,
      ].join(' ')}
      style={{ minWidth: showPlaceholder ? '4rem' : undefined, whiteSpace: multiline ? 'pre-wrap' : 'normal' }}
      {...rest}
    >
      {showPlaceholder ? placeholder : safeValue}
    </Component>
  );
}

export default InlineEditable;
