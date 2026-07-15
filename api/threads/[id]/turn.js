// POST /api/threads/:id/turn — send a user message and get the agent's response.
import { adapt } from '../../_lib/adapt.js';
import { handler } from '../../../netlify/functions/thread-turn.js';
export default adapt(handler);
