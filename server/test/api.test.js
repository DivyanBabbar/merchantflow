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
const productIds = [];

before(async () => {
  if (!enabled) return;
  const result = await pool.query('INSERT INTO products (name, price_cents, stock) VALUES ($1, 2500, 20) RETURNING id', [`test-${runId}`]);
  productId = Number(result.rows[0].id);
  productIds.push(productId);
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!enabled) return;
  for (const id of productIds) {
    await pool.query('DELETE FROM ledger_entries WHERE order_id IN (SELECT id FROM orders WHERE product_id = $1)', [id]);
    await pool.query('DELETE FROM webhook_events WHERE order_id IN (SELECT id FROM orders WHERE product_id = $1)', [id]);
    await pool.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE product_id = $1)', [id]);
    await pool.query('DELETE FROM orders WHERE product_id = $1', [id]);
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
  }
  await pool.query('DELETE FROM idempotency_keys WHERE key LIKE $1', [`test-${runId}-%`]);
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

async function createProduct(name, stock) {
  const result = await pool.query('INSERT INTO products (name, price_cents, stock) VALUES ($1, 2500, $2) RETURNING id', [name, stock]);
  const id = Number(result.rows[0].id);
  productIds.push(id);
  return id;
}

async function createOrder(key, targetProductId = productId, quantity = 2) {
  return fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ productId: targetProductId, quantity })
  });
}

test('catalog and order endpoints reject invalid input before persistence', { skip: !enabled }, async () => {
  const productResponse = await fetch(`${baseUrl}/api/v1/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `test-${runId}-api-product`, priceCents: 49900, stock: 3 })
  });
  assert.equal(productResponse.status, 201);
  const product = await productResponse.json();
  assert.equal(product.priceCents, 49900);
  assert.equal(product.stock, 3);
  productIds.push(product.id);

  const invalidProduct = await fetch(`${baseUrl}/api/v1/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ' ', priceCents: 0, stock: -1 })
  });
  assert.equal(invalidProduct.status, 400);

  const missingKey = await fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: product.id, quantity: 1 })
  });
  assert.equal(missingKey.status, 400);
  const invalidQuantity = await fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `test-${runId}-invalid` },
    body: JSON.stringify({ productId: product.id, quantity: 0 })
  });
  assert.equal(invalidQuantity.status, 400);
});

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

test('concurrent duplicate capture webhooks write one balanced ledger pair', { skip: !enabled }, async () => {
  const orderResponse = await createOrder(`test-${runId}-capture-order`);
  const order = await orderResponse.json();
  const event = { eventId: `test-${runId}-capture-event`, orderId: order.id, type: 'PAYMENT_CAPTURED' };
  const send = () => fetch(`${baseUrl}/api/v1/simulator/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
  const responses = await Promise.all([send(), send()]);
  const results = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(results.map(result => result.duplicate).sort(), [false, true]);

  const orders = await (await fetch(`${baseUrl}/api/v1/orders`)).json();
  const saved = orders.find(row => row.id === order.id);
  assert.equal(saved.status, 'PAID');
  assert.equal(saved.ledgerEntries, 2);
  assert.equal(saved.ledgerBalanced, true);
});

test('cancel releases the reserved inventory once and cannot be repeated', { skip: !enabled }, async () => {
  const before = (await pool.query('SELECT stock FROM products WHERE id = $1', [productId])).rows[0].stock;
  const order = await (await createOrder(`test-${runId}-cancel`)).json();
  const reserved = (await pool.query('SELECT stock FROM products WHERE id = $1', [productId])).rows[0].stock;
  assert.equal(reserved, before - 2);

  const cancelled = await fetch(`${baseUrl}/api/v1/orders/${order.id}/cancel`, { method: 'POST' });
  assert.equal(cancelled.status, 200);
  assert.deepEqual(await cancelled.json(), { status: 'CANCELLED', releasedQuantity: 2 });
  const repeated = await fetch(`${baseUrl}/api/v1/orders/${order.id}/cancel`, { method: 'POST' });
  assert.equal(repeated.status, 409);
  const restored = (await pool.query('SELECT stock FROM products WHERE id = $1', [productId])).rows[0].stock;
  assert.equal(restored, before);
});

test('concurrent orders cannot reserve more units than are in stock', { skip: !enabled }, async () => {
  const scarceProduct = await createProduct(`test-${runId}-scarce`, 1);
  const requests = await Promise.all([
    createOrder(`test-${runId}-scarce-a`, scarceProduct, 1),
    createOrder(`test-${runId}-scarce-b`, scarceProduct, 1)
  ]);
  assert.deepEqual(requests.map(response => response.status).sort(), [201, 409]);
  const remaining = (await pool.query('SELECT stock FROM products WHERE id = $1', [scarceProduct])).rows[0].stock;
  assert.equal(remaining, 0);
});

test('capture and refund transition state and leave a balanced four-entry ledger', { skip: !enabled }, async () => {
  const order = await (await createOrder(`test-${runId}-refund-order`)).json();
  const captured = await fetch(`${baseUrl}/api/v1/simulator/webhooks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: `test-${runId}-capture`, orderId: order.id, type: 'PAYMENT_CAPTURED' })
  });
  assert.equal(captured.status, 200);
  assert.equal((await captured.json()).status, 'PAID');

  const refundEvent = { eventId: `test-${runId}-refund`, orderId: order.id, type: 'PAYMENT_REFUNDED' };
  const refunded = await fetch(`${baseUrl}/api/v1/simulator/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refundEvent) });
  assert.equal(refunded.status, 200);
  assert.equal((await refunded.json()).status, 'REFUNDED');
  const replay = await fetch(`${baseUrl}/api/v1/simulator/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refundEvent) });
  assert.equal((await replay.json()).duplicate, true);

  const reused = await (await createOrder(`test-${runId}-different-order`)).json();
  const conflict = await fetch(`${baseUrl}/api/v1/simulator/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...refundEvent, orderId: reused.id }) });
  assert.equal(conflict.status, 409);
  const saved = (await (await fetch(`${baseUrl}/api/v1/orders`)).json()).find(row => row.id === order.id);
  assert.equal(saved.status, 'REFUNDED');
  assert.equal(saved.ledgerEntries, 4);
  assert.equal(saved.ledgerBalanced, true);
});

