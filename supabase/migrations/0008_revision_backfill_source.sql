-- 0008: allow 'backfill' as a document_revisions.change_source
--
-- The Lump Sump repair snapshots each document into document_revisions before mutating
-- it, so the change stays recoverable. The original CHECK only permitted user_edit,
-- agent_oneshot, agent_tool and system, so the snapshot insert failed with 23514 and the
-- backfill correctly aborted without writing anything.
--
-- Folding maintenance writes into 'system' would work but makes them indistinguishable
-- from ordinary server-side activity, which defeats the point of snapshotting them.
-- Additive change: no existing row can violate the widened constraint.

alter table document_revisions
  drop constraint if exists document_revisions_change_source_check;

alter table document_revisions
  add constraint document_revisions_change_source_check
  check (change_source in ('user_edit', 'agent_oneshot', 'agent_tool', 'system', 'backfill'));
