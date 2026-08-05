import React from 'react';

// Activity — emails sent + agent action log. WS-A provides the shell; WS-E fills the
// body (EmailsList + agent activity).
export function ActivityPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-neutral-900 mb-1">Activity</h1>
      <p className="text-sm text-neutral-500">Emails sent and what your agent has done.</p>
      {/* WS-E: EmailsList + agent activity feed */}
    </div>
  );
}
