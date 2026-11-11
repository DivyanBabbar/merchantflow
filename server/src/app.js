import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { pool, inTransaction } from './db.js';
import { hashOrderRequest, paymentLedgerPair } from './domain.js';

export const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));

const httpError = (status, message) => Object.assign(new Error(message), { status });
const simulatorOnly = (_req, res, next) => process.env.SIMULATOR_ENABLED === 'true'
  ? next()
  : res.status(403).json({ error: 'The local payment simulator is disabled.' });
const asOrder = (row) => ({
  id: row.id,
  productId: Number(row.product_id),
  productName: row.product_name,
  quantity: row.quantity,
  amountCents: row.amount_cents,
  status: row.status,
  createdAt: row.created_at,
  ledgerEntries: Number(row.ledger_entries ?? 0),
  ledgerBalanced: row.ledger_balanced ?? true
});

app.get('/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) { next(error); }
});

app.get('/api/v1/products', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, price_cents, stock FROM products ORDER BY id');
    res.json(rows.map(p => ({ id: Number(p.id), name: p.name, priceCents: p.price_cents, stock: p.stock })));
  } catch (error) { next(error); }
});

app.post('/api/v1/products', async (req, res, next) => {
  try {
    const { name, priceCents, stock = 0 } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw httpError(400, 'Name must be 1 to 120 characters.');
    if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 21_474_836) throw httpError(400, 'priceCents must be an integer from 1 to 21474836.');
    if (!Number.isSafeInteger(stock) || stock < 0) throw httpError(400, 'stock must be a non-negative integer.');
    const { rows } = await pool.query(
      'INSERT INTO products (name, price_cents, stock) VALUES ($1, $2, $3) RETURNING id, name, price_cents, stock',
      [name.trim(), priceCents, stock]
    );
    const p = rows[0];
    res.status(201).json({ id: Number(p.id), name: p.name, priceCents: p.price_cents, stock: p.stock });
  } catch (error) { next(error); }
});

app.get('/api/v1/orders', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, p.name AS product_name,
        count(le.id)::int AS ledger_entries,
        coalesce(sum(CASE WHEN le.direction = 'DEBIT' THEN le.amount_cents ELSE -le.amount_cents END), 0) = 0 AS ledger_balanced
      FROM orders o JOIN products p ON p.id = o.product_id
      LEFT JOIN ledger_entries le ON le.order_id = o.id
      GROUP BY o.id, p.name ORDER BY o.created_at DESC LIMIT 100`);
    res.json(rows.map(asOrder));
  } catch (error) { next(error); }
});

app.post('/api/v1/orders', async (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 200) return next(httpError(400, 'Provide an Idempotency-Key of at most 200 characters.'));
  const { productId, quantity } = req.body ?? {};
  if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    return next(httpError(400, 'productId and quantity must be positive integers; quantity cannot exceed 100.'));
  }
  const hash = hashOrderRequest(productId, quantity);
  try {
    const result = await inTransaction(async client => {
      const reserved = await client.query(
        'INSERT INTO idempotency_keys (key, request_hash) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key', [key, hash]
      );
      if (reserved.rowCount === 0) {
        const prior = (await client.query('SELECT request_hash, response_body FROM idempotency_keys WHERE key = $1', [key])).rows[0];
        if (prior.request_hash !== hash) throw httpError(409, 'This idempotency key was already used with a different request.');
        if (!prior.response_body) throw httpError(409, 'A request with this key is still being processed. Retry shortly.');
        return { replay: true, body: prior.response_body };
      }
      const product = (await client.query('SELECT id, name, price_cents, stock FROM products WHERE id = $1 FOR UPDATE', [productId])).rows[0];
      if (!product) throw httpError(404, 'Product not found.');
      if (product.stock < quantity) throw httpError(409, 'Not enough stock for this order.');
      const orderId = crypto.randomUUID();
      const amountCents = product.price_cents * quantity;
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [quantity, productId]);
      await client.query('INSERT INTO orders (id, product_id, quantity, amount_cents, status) VALUES ($1, $2, $3, $4, $5)', [orderId, productId, quantity, amountCents, 'PENDING']);
      const body = { id: orderId, productId, productName: product.name, quantity, amountCents, status: 'PENDING', ledgerEntries: 0, ledgerBalanced: true };
      await client.query('UPDATE idempotency_keys SET response_body = $2::jsonb WHERE key = $1', [key, JSON.stringify(body)]);
      return { replay: false, body };
    });
    res.status(result.replay ? 200 : 201).json({ ...result.body, replayed: result.replay });
  } catch (error) { next(error); }
});

async function applyPaymentEvent(event) {
  const { eventId, orderId, type } = event;
  if (typeof eventId !== 'string' || !eventId.trim() || eventId.length > 200) throw httpError(400, 'eventId must be a non-empty string of at most 200 characters.');
  if (!['PAYMENT_CAPTURED', 'PAYMENT_REFUNDED'].includes(type)) throw httpError(400, 'type must be PAYMENT_CAPTURED or PAYMENT_REFUNDED.');
  return inTransaction(async client => {
    const order = (await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
    if (!order) throw httpError(404, 'Order not found.');
    const inserted = await client.query(
      'INSERT INTO webhook_events (event_id, order_id, event_type) VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
      [eventId, orderId, type]
    );
    if (inserted.rowCount === 0) {
      const prior = (await client.query('SELECT order_id, event_type FROM webhook_events WHERE event_id = $1', [eventId])).rows[0];
      if (prior.order_id !== orderId || prior.event_type !== type) throw httpError(409, 'An event ID cannot be reused for a different event.');
      return { duplicate: true, status: order.status };
    }
    if (type === 'PAYMENT_CAPTURED') {
      if (order.status !== 'PENDING') throw httpError(409, `Cannot capture an order in ${order.status} state.`);
      await client.query('INSERT INTO payments (id, order_id, amount_cents, status) VALUES ($1, $2, $3, $4)', [crypto.randomUUID(), orderId, order.amount_cents, 'CAPTURED']);
      await client.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, 'PAID']);
      await insertLedgerPair(client, orderId, eventId, type, order.amount_cents);
      return { duplicate: false, status: 'PAID' };
    }
    if (order.status !== 'PAID') throw httpError(409, `Cannot refund an order in ${order.status} state.`);
    await client.query('UPDATE payments SET status = $2, updated_at = now() WHERE order_id = $1', [orderId, 'REFUNDED']);
    await client.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, 'REFUNDED']);
    await insertLedgerPair(client, orderId, eventId, type, order.amount_cents);
    return { duplicate: false, status: 'REFUNDED' };
  });
}

async function insertLedgerPair(client, orderId, eventId, type, amountCents) {
  const [first, second] = paymentLedgerPair(type, amountCents);
  await client.query(`INSERT INTO ledger_entries (order_id, event_id, account, direction, amount_cents)
    VALUES ($1, $2, $3, $4, $5), ($1, $2, $6, $7, $5)`, [
    orderId, eventId, first.account, first.direction, amountCents, second.account, second.direction
  ]);
}

app.post('/api/v1/orders/:id/capture', simulatorOnly, async (req, res, next) => {
  try {
    const result = await applyPaymentEvent({ eventId: `capture-${crypto.randomUUID()}`, orderId: req.params.id, type: 'PAYMENT_CAPTURED' });
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/v1/orders/:id/refund', simulatorOnly, async (req, res, next) => {
  try {
    const result = await applyPaymentEvent({ eventId: `refund-${crypto.randomUUID()}`, orderId: req.params.id, type: 'PAYMENT_REFUNDED' });
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/v1/orders/:id/cancel', async (req, res, next) => {
  try {
    const result = await inTransaction(async client => {
      const order = (await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!order) throw httpError(404, 'Order not found.');
      if (order.status !== 'PENDING') throw httpError(409, `Cannot cancel an order in ${order.status} state.`);
      await client.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [order.id, 'CANCELLED']);
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [order.quantity, order.product_id]);
      return { status: 'CANCELLED', releasedQuantity: order.quantity };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/v1/simulator/webhooks', simulatorOnly, async (req, res, next) => {
  try {
    const result = await applyPaymentEvent(req.body ?? {});
    res.json(result);
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message });
});

