import { adapt } from '../_lib/adapt.js';
import { handler } from '../../netlify/functions/agent-oneshot.js';
export default adapt(handler);
