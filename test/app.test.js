'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../index');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health returns 200 with status ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);

  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(typeof body.uptime, 'number');
});

test('GET / renders the car gallery', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);

  const html = await res.text();
  assert.match(html, /Awesome Cars/i);
  assert.match(html, /Tesla Model S/);
});

test('static assets are served', async () => {
  const res = await fetch(`${baseUrl}/css/style.css`);
  assert.strictEqual(res.status, 200);
});

test('unknown route returns 404', async () => {
  const res = await fetch(`${baseUrl}/does-not-exist`);
  assert.strictEqual(res.status, 404);
});
