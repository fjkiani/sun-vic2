// GET/POST /api/projects → list + create projects.
// (Catch-all sibling [...path].js handles :id and :id/summary.)
import { adapt } from '../_lib/adapt.js';
import { handler } from '../../netlify/functions/projects.js';
export default adapt(handler);
