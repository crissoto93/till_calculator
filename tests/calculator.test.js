const assert = require('node:assert');
const {
  DENOMINATIONS,
  COIN_ROLLS,
  ALL_ITEMS,
  amountToCount,
  countToAmount,
  calculateClosingTotals,
} = require('../src/calculator');

console.log('--- Testing Denominations & Calculator ---');

// Test 1: Denominations and Coin Rolls loaded
assert.strictEqual(DENOMINATIONS.length, 10, 'Should have 10 denominations');
assert.strictEqual(COIN_ROLLS.length, 4, 'Should have 4 standard US coin rolls');
assert.strictEqual(ALL_ITEMS.length, 14, 'Should have 14 total countable items');

const d100 = DENOMINATIONS.find(d => d.id === 'bill_100');
const d20 = DENOMINATIONS.find(d => d.id === 'bill_20');
const d025 = DENOMINATIONS.find(d => d.id === 'coin_25');
assert.strictEqual(d100.cents, 10000);
assert.strictEqual(d20.cents, 2000);
assert.strictEqual(d025.cents, 25);

const roll25 = COIN_ROLLS.find(r => r.id === 'roll_25');
const roll10 = COIN_ROLLS.find(r => r.id === 'roll_10');
const roll5  = COIN_ROLLS.find(r => r.id === 'roll_5');
const roll1  = COIN_ROLLS.find(r => r.id === 'roll_1');

assert.strictEqual(roll25.cents, 1000, 'Quarter roll should be $10.00 (1000 cents)');
assert.strictEqual(roll10.cents, 500,  'Dime roll should be $5.00 (500 cents)');
assert.strictEqual(roll5.cents,  200,  'Nickel roll should be $2.00 (200 cents)');
assert.strictEqual(roll1.cents,  50,   'Penny roll should be $0.50 (50 cents)');
console.log('✓ Denominations and Coin Rolls validated');

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

const resRollCount = countToAmount(roll25, 3);
assert.strictEqual(resRollCount.valid, true);
assert.strictEqual(resRollCount.count, 3);
assert.strictEqual(resRollCount.amount, 30.0);
assert.strictEqual(resRollCount.cents, 3000);
console.log('✓ countToAmount validated (including coin rolls)');

// Test 3: amountToCount with valid multiples
const res3 = amountToCount(d20, 100);
assert.strictEqual(res3.valid, true);
assert.strictEqual(res3.count, 5);
assert.strictEqual(res3.amount, 100);

const res4 = amountToCount(d025, 1.75);
assert.strictEqual(res4.valid, true);
assert.strictEqual(res4.count, 7);
assert.strictEqual(res4.amount, 1.75);

const resRollAmount = amountToCount(roll25, 40);
assert.strictEqual(resRollAmount.valid, true);
assert.strictEqual(resRollAmount.count, 4);
assert.strictEqual(resRollAmount.amount, 40);

const resPennyRoll = amountToCount(roll1, 1.50);
assert.strictEqual(resPennyRoll.valid, true);
assert.strictEqual(resPennyRoll.count, 3);
assert.strictEqual(resPennyRoll.amount, 1.50);
console.log('✓ amountToCount (valid) validated (including coin rolls)');

// Test 4: amountToCount with INVALID multiples
const res5 = amountToCount(d20, 30);
assert.strictEqual(res5.valid, false, '30 is not a multiple of 20');
assert.strictEqual(res5.error, 'Must be a multiple of $20');

const res6 = amountToCount(d025, 0.30);
assert.strictEqual(res6.valid, false, '0.30 is not a multiple of 0.25');
assert.strictEqual(res6.error, 'Must be a multiple of $0.25');

const resRollBad = amountToCount(roll25, 25);
assert.strictEqual(resRollBad.valid, false, '25 is not a multiple of 10');
assert.strictEqual(resRollBad.error, 'Must be a multiple of $10 Roll');

const resPennyBad = amountToCount(roll1, 1.25);
assert.strictEqual(resPennyBad.valid, false, '1.25 is not a multiple of 0.50');
assert.strictEqual(resPennyBad.error, 'Must be a multiple of $0.50 Roll');
console.log('✓ Multiple validation tested (including coin roll multiples)');

// Test 5: calculateClosingTotals with bills, loose coins, and coin rolls
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
  // Coin Rolls:
  roll_25:  { count: 2 }, // 2 * $10 = $20
  roll_10:  { count: 1 }, // 1 * $5  = $5
  roll_5:   { count: 2 }, // 2 * $2  = $4
  roll_1:   { count: 2 }, // 2 * $0.50 = $1
};
// Total Cash = 300 + 100 + 200 + 50 + 40 + 25 + 10 + 3 + 1 + 0.50 + 20 + 5 + 4 + 1 = $759.50
const totals = calculateClosingTotals(sampleBreakdown, 200, 200.15, 35.50);
assert.strictEqual(totals.totalCash, 759.50);
assert.strictEqual(totals.drawerFloat, 200);
assert.strictEqual(totals.deposit, 559.50);
assert.strictEqual(totals.expected, 200.15);
assert.strictEqual(totals.cashTips, 35.50);
// Discrepancy = 200.00 - 200.15 = -0.15 (15 cents short)
assert.strictEqual(totals.discrepancy, -0.15);
console.log('✓ calculateClosingTotals validated (759.50 total including rolls, 559.50 deposit, 35.50 tips, -$0.15 short discrepancy)');

console.log('ALL CALCULATOR UNIT TESTS PASSED! 🎉');
