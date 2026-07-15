// GET/POST /api/threads → list + create threads.
// (Catch-all sibling [...path].js handles :id and :id/turn.)
import { adapt } from '../_lib/adapt.js';
import { handler } from '../../netlify/functions/threads.js';
export default adapt(handler);
