// GET /api/projects/:id/summary — dashboard summary
// Vercel routes this file to `/api/projects/:id/summary` with `req.query.id` set.
// The netlify handler checks `event.path.endsWith('/summary')` to switch mode.

import { adapt } from '../../_lib/adapt.js';
import { handler } from '../../../netlify/functions/project.js';
export default adapt(handler);
