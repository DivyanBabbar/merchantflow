import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../src/db.js';

const enabled = process.env.RUN_INTEGRATION_TESTS === '1';

test('failure-first experiment: stale absolute stock writes oversell one unit', { skip: !enabled }, async (t) => {
  const suffix = crypto.randomUUID();
  const product = (await pool.query('INSERT INTO products (name, price_paise, stock) VALUES ($1, 1250, 1) RETURNING id', [`experiment-${suffix}`])).rows[0];
  t.after(async () => {
    await pool.query('DELETE FROM orders WHERE product_id = $1', [product.id]);
    await pool.query('DELETE FROM products WHERE id = $1', [product.id]);
  });

  let readers = 0;
  let releaseReaders;
  const bothRead = new Promise((resolve) => { releaseReaders = resolve; });
  async function unsafeOrder() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const observed = (await client.query('SELECT stock FROM products WHERE id = $1', [product.id])).rows[0].stock;
      readers += 1;
      if (readers === 2) releaseReaders();
      await bothRead;
      if (observed < 1) { await client.query('ROLLBACK'); return false; }
      // Deliberately models the initial bug: a stale read is written as an absolute value.
      await client.query('UPDATE products SET stock = $1 WHERE id = $2', [observed - 1, product.id]);
      await client.query("INSERT INTO orders (id, product_id, quantity, amount_paise, status) VALUES ($1, $2, 1, 1250, 'PENDING')", [crypto.randomUUID(), product.id]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  const accepted = await Promise.all([unsafeOrder(), unsafeOrder()]);
  const finalStock = (await pool.query('SELECT stock FROM products WHERE id = $1', [product.id])).rows[0].stock;
  const orderCount = Number((await pool.query('SELECT count(*) FROM orders WHERE product_id = $1', [product.id])).rows[0].count);
  console.log(`unsafe stale-write experiment: starting stock=1, accepted=${accepted.filter(Boolean).length}, ending stock=${finalStock}, orders=${orderCount}, oversold=${Math.max(orderCount - 1, 0)}`);
  assert.equal(accepted.filter(Boolean).length, 2);
  assert.equal(finalStock, 0);
  assert.equal(orderCount, 2);
});
