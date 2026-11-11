import crypto from 'node:crypto';

export function hashOrderRequest(productId, quantity) {
  return crypto.createHash('sha256').update(JSON.stringify({ productId, quantity })).digest('hex');
}

export function paymentLedgerPair(type, amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 2_147_483_647) {
    throw new TypeError('amountCents must be a positive PostgreSQL integer.');
  }
  if (type === 'PAYMENT_CAPTURED') {
    return [
      { account: 'CUSTOMER_FUNDS', direction: 'DEBIT' },
      { account: 'SELLER_CLEARING', direction: 'CREDIT' }
    ];
  }
  if (type === 'PAYMENT_REFUNDED') {
    return [
      { account: 'SELLER_CLEARING', direction: 'DEBIT' },
      { account: 'CUSTOMER_FUNDS', direction: 'CREDIT' }
    ];
  }
  throw new TypeError('Unsupported payment event type.');
}

