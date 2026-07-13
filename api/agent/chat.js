import { adapt } from '../_lib/adapt.js';
import { handler } from '../../netlify/functions/agent-chat.js';
export default adapt(handler);
