import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOrderRequest, paymentLedgerPair } from '../src/domain.js';

test('order request hashes are repeatable and distinguish changed inputs', () => {
  assert.equal(hashOrderRequest(1, 2), hashOrderRequest(1, 2));
  assert.notEqual(hashOrderRequest(1, 2), hashOrderRequest(1, 3));
});

test('capture and refund use opposite balanced ledger directions', () => {
  const signedTotal = (pair, amount) => pair.reduce((total, entry) => total + (entry.direction === 'DEBIT' ? amount : -amount), 0);
  const capture = paymentLedgerPair('PAYMENT_CAPTURED', 1299);
  const refund = paymentLedgerPair('PAYMENT_REFUNDED', 1299);
  assert.equal(signedTotal(capture, 1299), 0);
  assert.equal(signedTotal(refund, 1299), 0);
  assert.deepEqual(capture.map(entry => entry.direction), ['DEBIT', 'CREDIT']);
  assert.deepEqual(refund.map(entry => entry.direction), ['DEBIT', 'CREDIT']);
  assert.deepEqual(refund.map(entry => entry.account), capture.map(entry => entry.account).reverse());
});

test('ledger pair rejects invalid amounts and event types', () => {
  assert.throws(() => paymentLedgerPair('PAYMENT_CAPTURED', 0), /amountCents/);
  assert.throws(() => paymentLedgerPair('PAYMENT_CAPTURED', 2_147_483_648), /amountCents/);
  assert.throws(() => paymentLedgerPair('PAYMENT_FAILED', 100), /Unsupported/);
});

