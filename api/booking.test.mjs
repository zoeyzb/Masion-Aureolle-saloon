import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './booking.js';

const futureDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const valid = {
  service: 'Hair',
  date: futureDate,
  time: 'Morning / 09:00 — 12:00',
  name: 'Sample Guest',
  email: 'guest@example.test',
  note: 'A consultation',
  website: ''
};
let nextIp = 0;

async function invoke(body = valid, overrides = {}) {
  const response = {
    status: 0,
    payload: null,
    setHeader() {},
    writeHead(status) { this.status = status; },
    end(text) { this.payload = JSON.parse(text); }
  };
  await handler({
    method: overrides.method || 'POST',
    headers: {
      host: 'localhost:3000',
      origin: overrides.origin || 'http://localhost:3000',
      'content-type': overrides.contentType || 'application/json',
      'x-real-ip': 'test-' + ++nextIp
    },
    body
  }, response);
  return response;
}

test('accepts valid requests only when email provider accepts them', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  let sent;
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return { ok: true, status: 200, json: async () => ({ id: 'test-id' }) };
  };
  try {
    const result = await invoke();
    assert.equal(result.status, 202);
    assert.equal(result.payload.ok, true);
    assert.equal(sent.url, 'https://api.resend.com/emails');
    const email = JSON.parse(sent.options.body);
    assert.deepEqual(email.to, ['sierra@recoverrevenue.company']);
    assert.equal(email.reply_to, valid.email);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('rejects missing and invalid appointment details', async () => {
  assert.equal((await invoke({ ...valid, email: 'invalid' })).status, 422);
  assert.equal((await invoke({ ...valid, service: 'Unknown' })).status, 422);
  assert.equal((await invoke({ ...valid, date: '2020-01-01' })).status, 422);
  assert.equal((await invoke({ ...valid, website: 'bot' })).status, 422);
});

test('blocks wrong origin and unsupported method', async () => {
  assert.equal((await invoke(valid, { origin: 'https://wrong.example' })).status, 403);
  assert.equal((await invoke(valid, { method: 'GET' })).status, 405);
});

test('does not show success if email provider fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'error' }) });
  try {
    const result = await invoke();
    assert.equal(result.status, 502);
    assert.notEqual(result.payload.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});
