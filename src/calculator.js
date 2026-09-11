/**
 * Cash Drawer Denominations and Math Utilities
 * All monetary calculations are performed in integer cents to eliminate floating-point errors.
 */

const DENOMINATIONS = [
  { id: 'bill_100', label: '$100', name: 'Hundred', value: 100.0, cents: 10000, type: 'bill' },
  { id: 'bill_50',  label: '$50',  name: 'Fifty',   value: 50.0,  cents: 5000,  type: 'bill' },
  { id: 'bill_20',  label: '$20',  name: 'Twenty',  value: 20.0,  cents: 2000,  type: 'bill' },
  { id: 'bill_10',  label: '$10',  name: 'Ten',     value: 10.0,  cents: 1000,  type: 'bill' },
  { id: 'bill_5',   label: '$5',   name: 'Five',    value: 5.0,   cents: 500,   type: 'bill' },
  { id: 'bill_1',   label: '$1',   name: 'One',     value: 1.0,   cents: 100,   type: 'bill' },
  { id: 'coin_25',  label: '$0.25', name: 'Quarter', value: 0.25,  cents: 25,    type: 'coin' },
  { id: 'coin_10',  label: '$0.10', name: 'Dime',    value: 0.10,  cents: 10,    type: 'coin' },
  { id: 'coin_5',   label: '$0.05', name: 'Nickel',  value: 0.05,  cents: 5,     type: 'coin' },
  { id: 'coin_1',   label: '$0.01', name: 'Penny',   value: 0.01,  cents: 1,     type: 'coin' },
];

const COIN_ROLLS = [
  { id: 'roll_25', label: '$10 Roll',   name: 'Quarters ($10)', coinLabel: '$0.25', value: 10.0, cents: 1000, coinsPerRoll: 40, type: 'roll' },
  { id: 'roll_10', label: '$5 Roll',    name: 'Dimes ($5)',     coinLabel: '$0.10', value: 5.0,  cents: 500,  coinsPerRoll: 50, type: 'roll' },
  { id: 'roll_5',  label: '$2 Roll',    name: 'Nickels ($2)',   coinLabel: '$0.05', value: 2.0,  cents: 200,  coinsPerRoll: 40, type: 'roll' },
  { id: 'roll_1',  label: '$0.50 Roll', name: 'Pennies ($0.50)', coinLabel: '$0.01', value: 0.50, cents: 50,   coinsPerRoll: 50, type: 'roll' },
];

const ALL_ITEMS = [...DENOMINATIONS, ...COIN_ROLLS];

/**
 * Validate and calculate count from an amount string or number.
 * Returns { valid: boolean, count: number, cents: number, amount: number, error?: string }
 */
function amountToCount(denomination, amountInput) {
  if (amountInput === '' || amountInput === null || amountInput === undefined) {
    return { valid: true, count: 0, cents: 0, amount: 0.0 };
  }

  const num = Number(amountInput);
  if (isNaN(num) || num < 0) {
    return { valid: false, count: 0, cents: 0, amount: 0.0, error: 'Must be a positive number' };
  }

  const totalCents = Math.round(num * 100);
  const remainder = totalCents % denomination.cents;

  if (remainder !== 0) {
    return {
      valid: false,
      count: Math.floor(totalCents / denomination.cents),
      cents: totalCents,
      amount: totalCents / 100,
      error: `Must be a multiple of ${denomination.label}`,
    };
  }

  const count = Math.floor(totalCents / denomination.cents);
  return {
    valid: true,
    count,
    cents: totalCents,
    amount: totalCents / 100,
  };
}

/**
 * Calculate amount from a count integer.
 * Returns { valid: boolean, count: number, cents: number, amount: number, error?: string }
 */
function countToAmount(denomination, countInput) {
  if (countInput === '' || countInput === null || countInput === undefined) {
    return { valid: true, count: 0, cents: 0, amount: 0.0 };
  }

  const num = Number(countInput);
  if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
    return { valid: false, count: 0, cents: 0, amount: 0.0, error: 'Must be a whole non-negative number' };
  }

  const count = Math.floor(num);
  const totalCents = count * denomination.cents;
  return {
    valid: true,
    count,
    cents: totalCents,
    amount: totalCents / 100,
  };
}

/**
 * Calculate totals for an entire till closing.
 * Discrepancy definition:
 * In a register drawer: Total Counted = Drawer Float + Cash Sales.
 * The register expected sales is `expectedAmount`.
 * So expected drawer total is `drawerFloat + expectedAmount`.
 * Discrepancy = Total Cash Counted - (Drawer Float + Expected Sales).
 * Deposit Amount = Total Cash Counted - Drawer Float.
 * Thus: Discrepancy = Deposit Amount - Expected Sales.
 */
function calculateClosingTotals(breakdown, drawerFloat = 200, expectedAmount = 0, cashTips = 0) {
  let totalCashCents = 0;
  let hasErrors = false;
  const processedBreakdown = {};

  for (const denom of ALL_ITEMS) {
    const item = breakdown[denom.id] || { count: 0, amount: 0 };
    const count = Math.max(0, parseInt(item.count, 10) || 0);
    const itemCents = count * denom.cents;
    totalCashCents += itemCents;

    processedBreakdown[denom.id] = {
      label: denom.label,
      name: denom.name,
      type: denom.type,
      denominationValue: denom.value,
      count: count,
      cents: itemCents,
      amount: itemCents / 100,
    };
  }

  const drawerFloatCents = Math.round((Number(drawerFloat) || 0) * 100);
  const expectedCents = Math.round((Number(expectedAmount) || 0) * 100);
  const cashTipsCents = Math.round((Number(cashTips) || 0) * 100);

  // Deposit is whatever cash is above the retained drawer float
  const depositCents = Math.max(0, totalCashCents - drawerFloatCents);
  
  // Discrepancy definition:
  // Compares the cash that stays in the drawer against what the register expected to be in the drawer after deposit.
  // Example: If drawer float is $200.00 and register expected is $200.15, we are 15 cents short ($200.00 - $200.15 = -$0.15).
  let discrepancyCents = 0;
  if (expectedCents > 0) {
    discrepancyCents = drawerFloatCents - expectedCents;
  }

  return {
    breakdown: processedBreakdown,
    totalCashCents,
    totalCash: totalCashCents / 100,
    drawerFloatCents,
    drawerFloat: drawerFloatCents / 100,
    expectedCents,
    expected: expectedCents / 100,
    cashTipsCents,
    cashTips: cashTipsCents / 100,
    depositCents,
    deposit: depositCents / 100,
    discrepancyCents,
    discrepancy: discrepancyCents / 100,
    hasErrors,
  };
}

module.exports = {
  DENOMINATIONS,
  COIN_ROLLS,
  ALL_ITEMS,
  amountToCount,
  countToAmount,
  calculateClosingTotals,
};
