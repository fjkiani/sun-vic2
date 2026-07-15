// Handles GET/PATCH/DELETE /api/documents/:id
// The Netlify handler expects `event.queryStringParameters.id`.
// Vercel gives us `req.query.id` from the [id] filename param, which our
// adapter maps into queryStringParameters unchanged.

import { adapt } from '../_lib/adapt.js';
import { handler } from '../../netlify/functions/document.js';
export default adapt(handler);
