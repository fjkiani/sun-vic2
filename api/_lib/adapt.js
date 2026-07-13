// Adapt a Netlify Function handler ({event}=>({statusCode,headers,body}))
// to a Vercel Node serverless function ((req,res)=>Promise<void>).
//
// The Netlify handlers in netlify/functions/*.js accept an `event` object with:
//   - httpMethod                : 'GET' | 'POST' | ...
//   - headers                   : Record<string,string>
//   - queryStringParameters     : Record<string,string>
//   - body                      : string  (raw body)
//   - path                      : string
//
// They return { statusCode, headers, body } (body is a string).
//
// Vercel Node functions receive (req, res) where:
//   - req.method, req.headers, req.query, req.body (already parsed if JSON)
//   - res.status(n).setHeader(k,v).send(body)

export function toEvent(req) {
  // Vercel already parses JSON bodies. We need the raw string for parseJson().
  let bodyStr = '';
  if (req.body !== undefined && req.body !== null) {
    bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  // Lower-case header keys to match Netlify's normalization.
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
  }
  return {
    httpMethod: req.method,
    headers,
    queryStringParameters: req.query || {},
    body: bodyStr,
    path: req.url,
    rawUrl: req.url,
  };
}

export function toVercelResponse(res, result) {
  const { statusCode = 200, headers = {}, body = '' } = result || {};
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  res.status(statusCode);
  if (body === undefined || body === null || body === '') return res.end();
  // Netlify handlers return `body` as a string already; do not re-serialize.
  return res.send(body);
}

export function adapt(handler) {
  return async (req, res) => {
    try {
      const event = toEvent(req);
      const result = await handler(event);
      return toVercelResponse(res, result);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('adapter caught error:', err);
      res.status(500).setHeader('content-type', 'application/json');
      return res.send(JSON.stringify({ error: 'internal_error', detail: String(err?.message || err) }));
    }
  };
}
