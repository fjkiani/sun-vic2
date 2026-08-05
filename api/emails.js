import { adapt } from './_lib/adapt.js';
import { handler } from '../netlify/functions/emails.js';
export default adapt(handler);
