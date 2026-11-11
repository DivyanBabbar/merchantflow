import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';

const enabled = process.env.RUN_INTEGRATION_TESTS === '1';
const runId = crypto.randomUUID();
let server;
let baseUrl;
let productId;

before({ skip: !enabled }, async () => {
  const result = await pool.query('INSERT INTO products (name, price_cents, stock) VALUES ($1, 2500, 20) RETURNING id', [`test-${runId}`]);
  productId = Number(result.rows[0].id);
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after({ skip: !enabled }, async () => {
  if (productId) {
    await pool.query(`DELETE FROM ledger_entries WHERE order_id IN (SELECT id FROM orders WHERE product_id = $1)`, [productId]);
    await pool.query(`DELETE FROM webhook_events WHERE order_id IN (SELECT id FROM orders WHERE product_id = $1)`, [productId]);
    await pool.query(`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE product_id = $1)`, [productId]);
    await pool.query('DELETE FROM idempotency_keys WHERE key LIKE $1', [`test-${runId}-%`]);
    await pool.query('DELETE FROM orders WHERE product_id = $1', [productId]);
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);
  }
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

async function createOrder(key) {
  return fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ productId, quantity: 2 })
  });
}

test('order creation is replay-safe and rejects an idempotency key with a changed payload', { skip: !enabled }, async () => {
  const key = `test-${runId}-order`;
  const first = await createOrder(key);
  const firstBody = await first.json();
  assert.equal(first.status, 201);
  assert.equal(firstBody.status, 'PENDING');

  const replay = await createOrder(key);
  const replayBody = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayBody.id, firstBody.id);
  assert.equal(replayBody.replayed, true);

  const conflict = await fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ productId, quantity: 3 })
  });
  assert.equal(conflict.status, 409);
});

test('duplicate capture webhook writes one balanced ledger pair', { skip: !enabled }, async () => {
  const orderResponse = await createOrder(`test-${runId}-capture-order`);
  const order = await orderResponse.json();
  const event = { eventId: `test-${runId}-capture-event`, orderId: order.id, type: 'PAYMENT_CAPTURED' };
  const first = await fetch(`${baseUrl}/api/v1/simulator/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
  const second = await fetch(`${baseUrl}/api/v1/simulator/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
  assert.equal((await first.json()).duplicate, false);
  assert.equal((await second.json()).duplicate, true);

  const orders = await (await fetch(`${baseUrl}/api/v1/orders`)).json();
  const saved = orders.find(row => row.id === order.id);
  assert.equal(saved.status, 'PAID');
  assert.equal(saved.ledgerEntries, 2);
  assert.equal(saved.ledgerBalanced, true);
});
