import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupees, parseRupees } from '../src/money.js';

test('rupee input converts whole and fractional values to integer paise', () => {
  assert.equal(parseRupees('499'), 49900);
  assert.equal(parseRupees('499.5'), 49950);
  assert.equal(parseRupees('0.01'), 1);
});

test('rupee input rejects invalid precision, zero, negative, and overflowing values', () => {
  for (const value of ['', '0', '0.00', '-1', '1.234', '1,000', '214748.37', '999999999']) {
    assert.equal(parseRupees(value), null, `${value} should be rejected`);
  }
});

test('currency display formats integer paise as INR', () => {
  assert.match(formatRupees(49900), /499/);
  assert.match(formatRupees(1), /0\.01/);
});

