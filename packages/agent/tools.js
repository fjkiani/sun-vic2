// Agent tool definitions + local executor.
//
// - `toolDefs()` returns the JSON-schema list to pass to the LLM.
// - `executeToolCall(payload, template, locks, call)` mutates a working copy of the payload
//   and returns { payload, applied, refused_locks, error? }. It never persists — the caller
//   (agent-chat.js) handles DB writes.

import { randomUUID } from 'node:crypto';
import { isLocked, violatedLocks } from '../../netlify/functions/_shared/locks.js';

// -------------------- Tool definitions --------------------

export function toolDefs(template) {
  const isContract = template === 'contract';
  const commonTools = [
    {
      name: 'set_field',
      description: 'Set a field on the document payload at a JSON dot-path. Rejected if the path is locked.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'dot-path, e.g. "bill_to.client_name" or "timeline.start_date"' },
          value: { description: 'the new value (any JSON type)' },
        },
        required: ['path', 'value'],
      },
    },
    {
      name: 'add_phase',
      description: 'Append a new phase to the document.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          sqft: { type: 'number' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                desc: { type: 'string' },
                details: { type: 'string' },
                qty: { type: 'number' },
                rate: { type: 'number' },
              },
              required: ['desc'],
            },
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'update_phase',
      description: 'Update fields on an existing phase by id or index.',
      parameters: {
        type: 'object',
        properties: {
          phase_id: { type: 'string' },
          phase_index: { type: 'number' },
          patch: {
            type: 'object',
            description: 'shallow patch of phase fields',
          },
        },
        required: ['patch'],
      },
    },
    {
      name: 'remove_phase',
      description: 'Remove a phase by id or index.',
      parameters: {
        type: 'object',
        properties: {
          phase_id: { type: 'string' },
          phase_index: { type: 'number' },
        },
      },
    },
    {
      name: 'add_item',
      description: 'Append an item to a phase.',
      parameters: {
        type: 'object',
        properties: {
          phase_id: { type: 'string' },
          phase_index: { type: 'number' },
          item: {
            type: 'object',
            properties: {
              desc: { type: 'string' },
              details: { type: 'string' },
              qty: { type: 'number' },
              rate: { type: 'number' },
            },
            required: ['desc'],
          },
        },
        required: ['item'],
      },
    },
    {
      name: 'update_item',
      description: 'Update an item on a phase.',
      parameters: {
        type: 'object',
        properties: {
          phase_id: { type: 'string' },
          phase_index: { type: 'number' },
          item_index: { type: 'number' },
          patch: { type: 'object' },
        },
        required: ['patch', 'item_index'],
      },
    },
    {
      name: 'remove_item',
      description: 'Remove an item from a phase.',
      parameters: {
        type: 'object',
        properties: {
          phase_id: { type: 'string' },
          phase_index: { type: 'number' },
          item_index: { type: 'number' },
        },
        required: ['item_index'],
      },
    },
    {
      name: 'set_status',
      description: 'Change document status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft', 'sent', 'signed', 'paid', 'overdue', 'void'] },
        },
        required: ['status'],
      },
    },
    {
      name: 'generate_pdf',
      description: 'Regenerate the current PDF and return a signed URL. Use after material changes.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'email_document',
      description: 'Email the current PDF to the client. Requires a recipient.',
      parameters: {
        type: 'object',
        properties: { to: { type: 'string' } },
        required: ['to'],
      },
    },
  ];

  if (isContract) {
    commonTools.push({
      name: 'set_payment_schedule',
      description: 'Overwrite payment.schedule with a set of milestones summing to 100%.',
      parameters: {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                milestone: { type: 'string' },
                percent: { type: 'number' },
                due_condition: { type: 'string' },
              },
              required: ['milestone', 'percent'],
            },
          },
        },
        required: ['milestones'],
      },
    });
  }
  return commonTools;
}

// -------------------- Executor --------------------

// Utility: get/set on dot-path.
function getPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function phasesRef(payload, template) {
  return template === 'contract' ? (payload.scope_of_work?.phases || []) : (payload.phases || []);
}

function findPhase(payload, template, { phase_id, phase_index }) {
  const arr = phasesRef(payload, template);
  if (phase_id != null) {
    const i = arr.findIndex((p) => p.id === phase_id);
    return { idx: i, phase: arr[i] };
  }
  if (Number.isInteger(phase_index)) return { idx: phase_index, phase: arr[phase_index] };
  return { idx: -1, phase: undefined };
}

export async function executeToolCall({ payload, template, locks, docId, dispatch, call }) {
  const name = call.name;
  const args = call.arguments || {};
  const p = JSON.parse(JSON.stringify(payload)); // work on a copy

  switch (name) {
    case 'set_field': {
      const path = args.path;
      if (isLocked(locks, path)) return { payload, refused_locks: [path], applied: false, error: `Path "${path}" is locked.` };
      setPath(p, path, args.value);
      return { payload: p, applied: true };
    }
    case 'add_phase': {
      const arr = phasesRef(p, template);
      const phase = {
        id: randomUUID(),
        title: args.title || 'New Phase',
        description: args.description || '',
        sqft: args.sqft || null,
        items: (args.items || []).map((it) => ({
          desc: it.desc || '', details: it.details || null,
          qty: Number(it.qty) || 1, rate: Number(it.rate) || 0,
        })),
      };
      arr.push(phase);
      if (template === 'contract') {
        p.scope_of_work = p.scope_of_work || { phases: [] };
        p.scope_of_work.phases = arr;
      } else {
        p.phases = arr;
      }
      return { payload: p, applied: true, added_phase_id: phase.id };
    }
    case 'update_phase': {
      const { idx, phase } = findPhase(p, template, args);
      if (!phase) return { payload, applied: false, error: 'phase_not_found' };
      Object.assign(phase, args.patch || {});
      return { payload: p, applied: true, updated_phase_index: idx };
    }
    case 'remove_phase': {
      const { idx } = findPhase(p, template, args);
      if (idx < 0) return { payload, applied: false, error: 'phase_not_found' };
      const arr = phasesRef(p, template);
      arr.splice(idx, 1);
      return { payload: p, applied: true };
    }
    case 'add_item': {
      const { phase } = findPhase(p, template, args);
      if (!phase) return { payload, applied: false, error: 'phase_not_found' };
      phase.items = phase.items || [];
      phase.items.push({
        desc: args.item?.desc || '', details: args.item?.details || null,
        qty: Number(args.item?.qty) || 1, rate: Number(args.item?.rate) || 0,
      });
      return { payload: p, applied: true };
    }
    case 'update_item': {
      const { phase } = findPhase(p, template, args);
      if (!phase) return { payload, applied: false, error: 'phase_not_found' };
      const it = phase.items?.[args.item_index];
      if (!it) return { payload, applied: false, error: 'item_not_found' };
      Object.assign(it, args.patch || {});
      return { payload: p, applied: true };
    }
    case 'remove_item': {
      const { phase } = findPhase(p, template, args);
      if (!phase) return { payload, applied: false, error: 'phase_not_found' };
      if (!phase.items?.[args.item_index]) return { payload, applied: false, error: 'item_not_found' };
      phase.items.splice(args.item_index, 1);
      return { payload: p, applied: true };
    }
    case 'set_status': {
      // Status lives on the DB row, not the payload — callers apply this separately.
      return { payload, applied: true, status: args.status };
    }
    case 'set_payment_schedule': {
      if (template !== 'contract') return { payload, applied: false, error: 'invoice_no_payment_schedule' };
      if (isLocked(locks, 'payment.schedule')) return { payload, refused_locks: ['payment.schedule'], applied: false, error: 'locked' };
      const sum = (args.milestones || []).reduce((s2, m) => s2 + (Number(m.percent) || 0), 0);
      if (Math.round(sum) !== 100) return { payload, applied: false, error: `milestones must sum to 100 (got ${sum})` };
      p.payment = p.payment || { total_cents: 0, method: 'check', schedule: [], notes: '' };
      p.payment.schedule = args.milestones.map((m) => ({
        milestone: m.milestone,
        percent: Number(m.percent),
        due_condition: m.due_condition || m.milestone,
      }));
      return { payload: p, applied: true };
    }
    case 'generate_pdf':
    case 'email_document': {
      // Server-side side-effects — dispatched by the caller (agent-chat.js) using its own IDs.
      if (!dispatch) return { payload, applied: false, error: 'dispatch_not_available' };
      const result = await dispatch({ name, args, docId });
      return { payload, applied: true, side_effect: result };
    }
    default:
      return { payload, applied: false, error: `unknown_tool_${name}` };
  }
}

export { violatedLocks };
