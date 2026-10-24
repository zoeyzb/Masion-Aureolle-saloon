const SERVICES = new Set(['Hair', 'Makeup', 'Nails']);
const TIMES = new Set([
  'Morning / 09:00 — 12:00',
  'Afternoon / 12:00 — 16:00',
  'Evening / 16:00 — 19:00'
]);
const attempts = new Map();

function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString('utf8');
    if (raw.length > 12000) throw new Error('BODY_TOO_LARGE');
  }
  return JSON.parse(raw);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= new Date().toISOString().slice(0, 10);
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { service, date, time } = body;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (body.website || !SERVICES.has(service) || !TIMES.has(time) || !validDate(date) ||
      name.length < 2 || name.length > 100 ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      note.length > 1200) return null;
  return { service, date, time, name, email, note };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed.' });
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return reply(res, 415, { error: 'Send a JSON request.' });
  }
  const length = Number(req.headers['content-length'] || 0);
  if (length > 12000) return reply(res, 413, { error: 'Request is too large.' });
  try {
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      return reply(res, 403, { error: 'Invalid request origin.' });
    }
  } catch {
    return reply(res, 403, { error: 'Invalid request origin.' });
  }

  // Lightweight abuse guard. For heavier traffic, add a durable rate limiter.
  const ip = String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  if (recent.length >= 5) return reply(res, 429, { error: 'Too many requests. Please try again later.' });
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 2000) attempts.clear();

  let data;
  try {
    data = validate(await readBody(req));
  } catch (error) {
    return reply(res, error.message === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'Invalid request data.' });
  }
  if (!data) return reply(res, 422, { error: 'Please check all required booking details.' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Booking email integration is not configured.');
    return reply(res, 503, { error: 'Booking requests are temporarily unavailable. Please email us directly.' });
  }

  const message = [
    'New Maison Aurelle appointment request',
    '',
    'Service: ' + data.service,
    'Preferred date: ' + data.date,
    'Preferred time: ' + data.time,
    'Name: ' + data.name,
    'Email: ' + data.email,
    'Notes: ' + (data.note || 'None'),
    '',
    'This is a request only; no appointment has been confirmed.'
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Maison Aurelle <bookings@recoverrevenue.company>',
        to: ['sierra@recoverrevenue.company'],
        reply_to: data.email,
        subject: 'Maison Aurelle appointment request — ' + data.service,
        text: message
      }),
      signal: AbortSignal.timeout(8000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result.id !== 'string') {
      console.error('Booking email provider did not accept message.', { status: response.status });
      return reply(res, 502, { error: 'We could not send your request. Please try again or email us directly.' });
    }
    return reply(res, 202, { ok: true, message: 'Your appointment request has been sent. This is not a confirmed booking.' });
  } catch (error) {
    console.error('Booking email provider could not be reached.', { name: error.name });
    return reply(res, 502, { error: 'We could not send your request. Please try again or email us directly.' });
  }
}
