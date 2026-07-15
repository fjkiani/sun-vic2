// GET/POST /api/documents → list + create documents.
// (Catch-all sibling [...path].js handles :id and :id/{pdf,email,public}.)
import { adapt } from '../_lib/adapt.js';
import { handler } from '../../netlify/functions/documents.js';
export default adapt(handler);
