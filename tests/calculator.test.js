const assert = require('node:assert');
const {
  DENOMINATIONS,
  amountToCount,
  countToAmount,
  calculateClosingTotals,
} = require('../src/calculator');

console.log('--- Testing Denominations & Calculator ---');

// Test 1: Denominations loaded
assert.strictEqual(DENOMINATIONS.length, 10, 'Should have 10 denominations');
const d100 = DENOMINATIONS.find(d => d.id === 'bill_100');
const d20 = DENOMINATIONS.find(d => d.id === 'bill_20');
const d025 = DENOMINATIONS.find(d => d.id === 'coin_25');
assert.strictEqual(d100.cents, 10000);
assert.strictEqual(d20.cents, 2000);
assert.strictEqual(d025.cents, 25);
console.log('✓ Denominations validated');

// Test 2: countToAmount
const res1 = countToAmount(d100, 5);
assert.strictEqual(res1.valid, true);
assert.strictEqual(res1.count, 5);
assert.strictEqual(res1.amount, 500);
assert.strictEqual(res1.cents, 50000);

const res2 = countToAmount(d025, 4);
assert.strictEqual(res2.valid, true);
assert.strictEqual(res2.count, 4);
assert.strictEqual(res2.amount, 1.0);
assert.strictEqual(res2.cents, 100);
console.log('✓ countToAmount validated');

// Test 3: amountToCount with valid multiples
const res3 = amountToCount(d20, 100);
assert.strictEqual(res3.valid, true);
assert.strictEqual(res3.count, 5);
assert.strictEqual(res3.amount, 100);

const res4 = amountToCount(d025, 1.75);
assert.strictEqual(res4.valid, true);
assert.strictEqual(res4.count, 7);
assert.strictEqual(res4.amount, 1.75);
console.log('✓ amountToCount (valid) validated');

// Test 4: amountToCount with INVALID multiples ($30 in $20 bill)
const res5 = amountToCount(d20, 30);
assert.strictEqual(res5.valid, false, '30 is not a multiple of 20');
assert.strictEqual(res5.error, 'Must be a multiple of $20');

const res6 = amountToCount(d025, 0.30);
assert.strictEqual(res6.valid, false, '0.30 is not a multiple of 0.25');
assert.strictEqual(res6.error, 'Must be a multiple of $0.25');
console.log('✓ Multiple validation tested');

// Test 5: calculateClosingTotals
const sampleBreakdown = {
  bill_100: { count: 3 }, // $300
  bill_50:  { count: 2 }, // $100
  bill_20:  { count: 10 }, // $200
  bill_10:  { count: 5 }, // $50
  bill_5:   { count: 8 }, // $40
  bill_1:   { count: 25 }, // $25
  coin_25:  { count: 40 }, // $10
  coin_10:  { count: 30 }, // $3
  coin_5:   { count: 20 }, // $1
  coin_1:   { count: 50 }, // $0.50
};
// Total Cash = 300 + 100 + 200 + 50 + 40 + 25 + 10 + 3 + 1 + 0.50 = $729.50
const totals = calculateClosingTotals(sampleBreakdown, 200, 200.15, 35.50);
assert.strictEqual(totals.totalCash, 729.50);
assert.strictEqual(totals.drawerFloat, 200);
assert.strictEqual(totals.deposit, 529.50);
assert.strictEqual(totals.expected, 200.15);
assert.strictEqual(totals.cashTips, 35.50);
// Discrepancy = 200.00 - 200.15 = -0.15 (15 cents short)
assert.strictEqual(totals.discrepancy, -0.15);
console.log('✓ calculateClosingTotals validated (729.50 total, 529.50 deposit, 35.50 tips, -$0.15 short discrepancy)');

console.log('ALL CALCULATOR UNIT TESTS PASSED! 🎉');
