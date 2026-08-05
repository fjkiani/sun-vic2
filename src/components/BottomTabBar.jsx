import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

// Mobile-first bottom tab bar: the primary navigation for the app on small screens.
// Three primary tabs (Copilot / Work / Activity) + Settings. Hidden on md+ where the
// top nav takes over. A tab is "active" when the current path belongs to its section,
// including pushed screens (e.g. /documents/:id highlights Work).
const TABS = [
  {
    to: '/copilot',
    label: 'Copilot',
    match: (p) => p.startsWith('/copilot') || p.startsWith('/chat'),
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
      </svg>
    ),
  },
  {
    to: '/work',
    label: 'Work',
    match: (p) => p.startsWith('/work') || p.startsWith('/projects') || p.startsWith('/documents'),
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/activity',
    label: 'Activity',
    match: (p) => p.startsWith('/activity'),
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    match: (p) => p.startsWith('/settings'),
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function BottomTabBar() {
  const loc = useLocation();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200 shadow-[0_-1px_3px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="Primary"
    >
      <div className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = t.match(loc.pathname);
          return (
            <NavLink
              key={t.to}
              to={t.to}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 active:bg-neutral-50 ${
                active ? 'text-sunvic-600' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-sunvic-500" aria-hidden="true" />}
              {t.icon(active)}
              <span className={`text-[10px] leading-none ${active ? 'font-semibold' : ''}`}>{t.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
