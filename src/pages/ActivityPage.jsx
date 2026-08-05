import React from 'react';
import { EmailsList } from '../components/activity/EmailsList.jsx';

// Activity — "emails sent" dashboard. Genuine rows from the email_log table with a
// Resend button on each. Mobile-first.
export function ActivityPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-1 mb-3">
        <h1 className="text-xl font-bold text-neutral-900">Activity</h1>
        <p className="text-sm text-neutral-500">Emails you've sent to homeowners.</p>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-neutral-200 bg-neutral-50">
          <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Emails sent</span>
        </div>
        <EmailsList />
      </div>
    </div>
  );
}
