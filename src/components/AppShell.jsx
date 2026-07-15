import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { ModelPickerDropdown } from './ModelPickerDropdown.jsx';

// Mobile-first shell. Below `md` the header collapses to a hamburger; nav links,
// model picker, and settings/sign-out move into a slide-in drawer.
export function AppShell() {
  const nav = useNavigate();
  const loc = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [loc.pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    nav('/sign-in', { replace: true });
  }

  const navClass = ({ isActive }) =>
    `text-sm hover:text-neutral-900 ${isActive ? 'text-sunvic-600 font-semibold' : 'text-neutral-600'}`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-neutral-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-2.5 md:py-3 flex items-center justify-between gap-2">
          {/* Left: logo */}
          <NavLink to="/chat" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-sunvic-500 text-white grid place-items-center font-bold">S</div>
            <div className="hidden sm:block">
              <div className="text-base md:text-lg font-bold text-neutral-900 leading-tight">Sunvic</div>
              <div className="text-[10px] md:text-xs text-neutral-500 leading-tight">Contracts &amp; Invoices</div>
            </div>
          </NavLink>

          {/* Desktop nav (md+) */}
          <div className="hidden md:flex items-center gap-4">
            <NavLink to="/chat" className={navClass}>Chat</NavLink>
            <NavLink to="/projects" className={navClass}>Projects</NavLink>
            <NavLink to="/documents" className={navClass}>Documents</NavLink>
            <ModelPickerDropdown />
            <NavLink to="/settings" className={navClass}>Settings</NavLink>
            <button onClick={signOut} className="text-sm text-neutral-600 hover:text-neutral-900">Sign out</button>
          </div>

          {/* Mobile hamburger (< md) */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-2 -mr-1 rounded hover:bg-neutral-100"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="font-bold text-neutral-900">Menu</div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 hover:bg-neutral-100 rounded"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-4 space-y-1 flex-1">
              <MobileNavLink to="/chat" label="Chat" />
              <MobileNavLink to="/projects" label="Projects" />
              <MobileNavLink to="/documents" label="Documents" />
              <MobileNavLink to="/settings" label="Settings" />
            </nav>
            <div className="p-4 border-t border-neutral-200 space-y-3">
              <ModelPickerDropdown />
              <button
                onClick={signOut}
                className="w-full text-sm text-left text-neutral-600 hover:text-neutral-900 py-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-3 md:px-4 py-4 md:py-6">
        <Outlet />
      </main>
    </div>
  );
}

function MobileNavLink({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-3 py-2.5 rounded-lg text-base ${
          isActive
            ? 'bg-sunvic-50 text-sunvic-700 font-semibold'
            : 'text-neutral-700 hover:bg-neutral-100'
        }`
      }
    >
      {label}
    </NavLink>
  );
}
