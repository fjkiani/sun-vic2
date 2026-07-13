import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { ModelPickerDropdown } from './ModelPickerDropdown.jsx';

export function AppShell() {
  const nav = useNavigate();
  async function signOut() {
    await supabase.auth.signOut();
    nav('/sign-in', { replace: true });
  }
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <NavLink to="/documents" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-sunvic-500 text-white grid place-items-center font-bold">S</div>
            <div>
              <div className="text-lg font-bold text-neutral-900 leading-tight">Sunvic Documents</div>
              <div className="text-xs text-neutral-500 leading-tight">Contracts & Invoices</div>
            </div>
          </NavLink>
          <div className="flex items-center gap-4">
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                `text-sm hover:text-neutral-900 ${isActive ? 'text-sunvic-600 font-semibold' : 'text-neutral-600'}`
              }
            >
              Projects
            </NavLink>
            <NavLink
              to="/documents"
              className={({ isActive }) =>
                `text-sm hover:text-neutral-900 ${isActive ? 'text-sunvic-600 font-semibold' : 'text-neutral-600'}`
              }
            >
              Documents
            </NavLink>
            <ModelPickerDropdown />
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `text-sm hover:text-neutral-900 ${isActive ? 'text-sunvic-600 font-semibold' : 'text-neutral-600'}`
              }
            >
              Settings
            </NavLink>
            <button onClick={signOut} className="text-sm text-neutral-600 hover:text-neutral-900">Sign out</button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
