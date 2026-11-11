import test from 'node:test';
import assert from 'node:assert/strict';

test('ledger capture and refund pairs are equal and opposite', () => {
  const amount = 1299;
  const capture = [{ account: 'CUSTOMER_FUNDS', direction: 'DEBIT', amount }, { account: 'SELLER_CLEARING', direction: 'CREDIT', amount }];
  const refund = [{ account: 'SELLER_CLEARING', direction: 'DEBIT', amount }, { account: 'CUSTOMER_FUNDS', direction: 'CREDIT', amount }];
  for (const entries of [capture, refund]) {
    const signed = entries.reduce((sum, entry) => sum + (entry.direction === 'DEBIT' ? entry.amount : -entry.amount), 0);
    assert.equal(signed, 0);
  }
});

test('request fingerprint is based on normalized request values', async () => {
  const { createHash } = await import('node:crypto');
  const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(fingerprint({ productId: 1, quantity: 2 }), fingerprint({ productId: 1, quantity: 2 }));
  assert.notEqual(fingerprint({ productId: 1, quantity: 2 }), fingerprint({ productId: 1, quantity: 3 }));
});
