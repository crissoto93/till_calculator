/**
 * Till Closing Calculator - Mobile Frontend Application
 */

// Denominations matching backend exact definitions
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

// App State
const state = {
  items: {}, // key: id -> { count: 0, amount: 0, error: null }
  drawerFloat: 200.0,
  expectedAmount: 0.0,
  cashTips: 0.0,
  isSaving: false,
};

// Initialize state
DENOMINATIONS.forEach(d => {
  state.items[d.id] = { count: 0, amount: 0.0, error: null };
});

// DOM Elements
const rowsContainer = document.getElementById('denomRowsContainer');
const nonZeroBadge = document.getElementById('nonZeroCount');
const totalCashDisplay = document.getElementById('totalCashDisplay');
const cashTipsInput = document.getElementById('cashTipsInput');
const drawerFloatInput = document.getElementById('drawerFloatInput');
const depositAmountDisplay = document.getElementById('depositAmountDisplay');
const expectedAmountInput = document.getElementById('expectedAmountInput');
const discrepancyBadge = document.getElementById('discrepancyBadge');
const employeeNameInput = document.getElementById('employeeName');
const shiftNotesInput = document.getElementById('shiftNotes');
const btnSave = document.getElementById('btnSave');
const saveStatusMsg = document.getElementById('saveStatusMsg');
const btnResetTop = document.getElementById('btnResetTop');
const btnResetBottom = document.getElementById('btnResetBottom');
const successModal = document.getElementById('successModal');
const modalReceiptDetails = document.getElementById('modalReceiptDetails');
const btnModalDone = document.getElementById('btnModalDone');

/**
 * Render the 3-column table rows
 */
function renderDenominationRows() {
  rowsContainer.innerHTML = '';

  DENOMINATIONS.forEach(denom => {
    const rowEl = document.createElement('div');
    rowEl.className = 'denom-row';
    rowEl.id = `row_${denom.id}`;

    // Column 1: Denomination
    const col1 = document.createElement('div');
    col1.className = 'col-denom';
    col1.innerHTML = `
      <div class="denom-chip ${denom.type}">
        ${denom.label}
      </div>
    `;

    // Column 2: Quantity (editable, numbers only)
    const col2 = document.createElement('div');
    col2.className = 'col-count';
    col2.innerHTML = `
      <input 
        type="number" 
        id="count_${denom.id}" 
        class="input-count" 
        placeholder="0" 
        min="0" 
        step="1"
        inputmode="numeric" 
        pattern="[0-9]*"
      >
    `;

    // Column 3: Amount ($) (editable, numbers only, must be multiple)
    const col3 = document.createElement('div');
    col3.className = 'col-amount';
    const stepVal = denom.cents >= 100 ? '1' : '0.01';
    col3.innerHTML = `
      <div class="amount-wrap">
        <span class="amount-prefix">$</span>
        <input 
          type="number" 
          id="amount_${denom.id}" 
          class="input-amount" 
          placeholder="0.00" 
          min="0" 
          step="${stepVal}" 
          inputmode="decimal"
        >
      </div>
    `;

    // Error message container (for non-multiple invalid input)
    const errorBanner = document.createElement('div');
    errorBanner.className = 'row-error-banner';
    errorBanner.id = `error_${denom.id}`;
    errorBanner.style.display = 'none';

    rowEl.appendChild(col1);
    rowEl.appendChild(col2);
    rowEl.appendChild(col3);
    rowEl.appendChild(errorBanner);
    rowsContainer.appendChild(rowEl);

    // Event Listeners for Bi-directional sync
    const countInput = col2.querySelector('input');
    const amountInput = col3.querySelector('input');

    // 1. User edits COUNT (Column 2) -> updates Amount (Column 3)
    countInput.addEventListener('input', e => {
      handleCountChange(denom, e.target.value);
    });

    // 2. User edits AMOUNT (Column 3) -> updates Count (Column 2) & validates multiple
    amountInput.addEventListener('input', e => {
      handleAmountChange(denom, e.target.value);
    });

    // Clean up empty display on blur
    countInput.addEventListener('blur', () => {
      if (state.items[denom.id].count === 0) countInput.value = '';
    });
    amountInput.addEventListener('blur', () => {
      if (state.items[denom.id].count === 0 && !state.items[denom.id].error) {
        amountInput.value = '';
      }
    });
  });
}

/**
 * Handle change in quantity count (Column 2)
 */
function handleCountChange(denom, rawVal) {
  const amountInput = document.getElementById(`amount_${denom.id}`);
  const rowEl = document.getElementById(`row_${denom.id}`);
  const errorBanner = document.getElementById(`error_${denom.id}`);

  // Clear any existing error
  state.items[denom.id].error = null;
  rowEl.classList.remove('has-error');
  errorBanner.style.display = 'none';

  if (rawVal === '' || rawVal === null) {
    state.items[denom.id].count = 0;
    state.items[denom.id].amount = 0;
    amountInput.value = '';
    recalculateTotals();
    return;
  }

  const count = parseInt(rawVal, 10);
  if (isNaN(count) || count < 0) {
    state.items[denom.id].count = 0;
    state.items[denom.id].amount = 0;
    amountInput.value = '';
    recalculateTotals();
    return;
  }

  state.items[denom.id].count = count;
  const totalCents = count * denom.cents;
  const amount = totalCents / 100;
  state.items[denom.id].amount = amount;

  // Auto-populate Amount column
  if (count > 0) {
    amountInput.value = (denom.cents % 100 === 0) ? amount.toFixed(0) : amount.toFixed(2);
  } else {
    amountInput.value = '';
  }

  recalculateTotals();
}

/**
 * Handle change in dollar amount (Column 3)
 */
function handleAmountChange(denom, rawVal) {
  const countInput = document.getElementById(`count_${denom.id}`);
  const rowEl = document.getElementById(`row_${denom.id}`);
  const errorBanner = document.getElementById(`error_${denom.id}`);

  if (rawVal === '' || rawVal === null) {
    state.items[denom.id].count = 0;
    state.items[denom.id].amount = 0;
    state.items[denom.id].error = null;
    rowEl.classList.remove('has-error');
    errorBanner.style.display = 'none';
    countInput.value = '';
    recalculateTotals();
    return;
  }

  const numVal = parseFloat(rawVal);
  if (isNaN(numVal) || numVal < 0) {
    state.items[denom.id].error = 'Must be a positive number';
    rowEl.classList.add('has-error');
    errorBanner.textContent = '⚠️ Must be a valid positive number';
    errorBanner.style.display = 'block';
    recalculateTotals();
    return;
  }

  const totalCents = Math.round(numVal * 100);
  const remainder = totalCents % denom.cents;

  // Strict multiple check
  if (remainder !== 0) {
    state.items[denom.id].error = `Amount must be a multiple of ${denom.label}`;
    state.items[denom.id].amount = totalCents / 100;
    rowEl.classList.add('has-error');
    errorBanner.textContent = `⚠️ Amount must be an exact multiple of ${denom.label}`;
    errorBanner.style.display = 'block';
    recalculateTotals();
    return;
  }

  // Valid multiple! Clear error and update Count
  state.items[denom.id].error = null;
  rowEl.classList.remove('has-error');
  errorBanner.style.display = 'none';

  const count = Math.floor(totalCents / denom.cents);
  state.items[denom.id].count = count;
  state.items[denom.id].amount = totalCents / 100;

  if (count > 0) {
    countInput.value = count;
  } else {
    countInput.value = '';
  }

  recalculateTotals();
}

/**
 * Recalculate totals, deposit amount, and discrepancy
 */
function recalculateTotals() {
  let totalCashCents = 0;
  let nonZeroItems = 0;
  let hasErrors = false;

  DENOMINATIONS.forEach(denom => {
    const item = state.items[denom.id];
    if (item.error) {
      hasErrors = true;
    }
    if (item.count > 0) {
      nonZeroItems++;
      totalCashCents += item.count * denom.cents;
    }
  });

  const totalCash = totalCashCents / 100;
  totalCashDisplay.textContent = formatCurrency(totalCash);
  nonZeroBadge.textContent = `${nonZeroItems} item${nonZeroItems === 1 ? '' : 's'} counted`;

  // Cash Tips (Optional)
  if (cashTipsInput) {
    const tipsVal = parseFloat(cashTipsInput.value);
    state.cashTips = (!isNaN(tipsVal) && tipsVal >= 0) ? tipsVal : 0.0;
  }

  // Drawer Float
  const drawerFloatVal = parseFloat(drawerFloatInput.value);
  state.drawerFloat = (!isNaN(drawerFloatVal) && drawerFloatVal >= 0) ? drawerFloatVal : 200.0;

  // Deposit Amount = Total Cash - Drawer Float
  const deposit = Math.max(0, totalCash - state.drawerFloat);
  depositAmountDisplay.textContent = formatCurrency(deposit);

  // Register Expected Amount
  const expectedVal = parseFloat(expectedAmountInput.value);
  state.expectedAmount = (!isNaN(expectedVal) && expectedVal >= 0) ? expectedVal : 0.0;

  // Discrepancy Calculation
  // Compares Cash Stays in Drawer against what the register expected in the drawer after deposit
  // e.g. Drawer has $200, Register Expected $200.15 -> -$0.15 Short
  let discrepancy = 0;
  if (state.expectedAmount > 0) {
    discrepancy = state.drawerFloat - state.expectedAmount;
  }
  updateDiscrepancyBadge(discrepancy, state.expectedAmount > 0);

  // Update Save button availability
  updateSaveButtonState(hasErrors);
}

/**
 * Format currency nicely
 */
function formatCurrency(num) {
  return '$' + Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Update the discrepancy badge UI
 */
function updateDiscrepancyBadge(diff, hasActivity) {
  discrepancyBadge.className = 'discrepancy-badge';

  if (!hasActivity || Math.abs(diff) < 0.005) {
    discrepancyBadge.classList.add('balanced');
    discrepancyBadge.innerHTML = '<span>✓ Balanced ($0.00)</span>';
  } else if (diff > 0) {
    discrepancyBadge.classList.add('over');
    discrepancyBadge.innerHTML = `<span>▲ +${formatCurrency(diff).replace('$', '')} OVER</span>`;
  } else {
    discrepancyBadge.classList.add('short');
    discrepancyBadge.innerHTML = `<span>▼ -${formatCurrency(Math.abs(diff)).replace('$', '')} SHORT</span>`;
  }
}

/**
 * Check if the form is valid to submit
 */
function updateSaveButtonState(hasErrors) {
  if (hasErrors) {
    btnSave.disabled = true;
    saveStatusMsg.textContent = '⚠️ Please fix the invalid denomination amounts above.';
    saveStatusMsg.style.display = 'block';
  } else {
    btnSave.disabled = false;
    saveStatusMsg.style.display = 'none';
  }
}

/**
 * Reset all fields
 */
function resetCalculator(showConfirm = true) {
  if (showConfirm) {
    const hasData = Object.values(state.items).some(i => i.count > 0) || employeeNameInput.value.trim();
    if (hasData && !confirm('Are you sure you want to clear this drawer calculation?')) {
      return;
    }
  }

  DENOMINATIONS.forEach(denom => {
    state.items[denom.id] = { count: 0, amount: 0.0, error: null };
    const cInput = document.getElementById(`count_${denom.id}`);
    const aInput = document.getElementById(`amount_${denom.id}`);
    const rowEl = document.getElementById(`row_${denom.id}`);
    const errBanner = document.getElementById(`error_${denom.id}`);

    if (cInput) cInput.value = '';
    if (aInput) aInput.value = '';
    if (rowEl) rowEl.classList.remove('has-error');
    if (errBanner) errBanner.style.display = 'none';
  });

  drawerFloatInput.value = '200';
  expectedAmountInput.value = '';
  if (cashTipsInput) cashTipsInput.value = '';
  employeeNameInput.value = '';
  shiftNotesInput.value = '';

  recalculateTotals();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Submit drawer closing to backend
 */
async function submitClosing() {
  const employeeName = employeeNameInput.value.trim();
  if (!employeeName) {
    alert('Please enter Employee Name / Initials before saving.');
    employeeNameInput.focus();
    return;
  }

  // Check for any errors
  const hasErrors = Object.values(state.items).some(i => i.error !== null);
  if (hasErrors) {
    alert('Please correct the highlighted denomination errors before saving.');
    return;
  }

  let totalCashCents = 0;
  const breakdownPayload = {};

  DENOMINATIONS.forEach(denom => {
    const item = state.items[denom.id];
    totalCashCents += item.count * denom.cents;
    breakdownPayload[denom.id] = {
      count: item.count,
      amount: item.amount,
    };
  });

  const expectedVal = parseFloat(expectedAmountInput.value);
  const currentExpected = (!isNaN(expectedVal) && expectedVal >= 0) ? expectedVal : 0.0;
  state.expectedAmount = currentExpected;

  const drawerFloatVal = parseFloat(drawerFloatInput.value);
  const currentDrawerFloat = (!isNaN(drawerFloatVal) && drawerFloatVal >= 0) ? drawerFloatVal : 200.0;
  state.drawerFloat = currentDrawerFloat;

  const tipsVal = parseFloat(cashTipsInput ? cashTipsInput.value : 0);
  const currentTips = (!isNaN(tipsVal) && tipsVal >= 0) ? tipsVal : 0.0;
  state.cashTips = currentTips;

  const payload = {
    employee_name: employeeName,
    drawer_float: currentDrawerFloat,
    expected_amount: currentExpected,
    cash_tips: currentTips,
    breakdown: breakdownPayload,
    notes: shiftNotesInput.value.trim(),
  };

  btnSave.disabled = true;
  btnSave.textContent = 'Saving Closing...';

  try {
    const res = await fetch('/api/closings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to save closing.');
    }

    // Display confirmation receipt modal
    showSuccessModal(data.closing);
  } catch (err) {
    alert('Error saving till closing: ' + err.message);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<span>💾</span> Save & Submit Till Closing';
  }
}

/**
 * Show clean receipt confirmation modal upon saving
 */
function showSuccessModal(closing) {
  const dateStr = new Date(closing.created_at || Date.now()).toLocaleString();
  let discText = 'Balanced ($0.00)';
  let discColor = '#15803d';

  if (closing.discrepancy > 0) {
    discText = `+${formatCurrency(closing.discrepancy)} (OVER)`;
    discColor = '#1d4ed8';
  } else if (closing.discrepancy < 0) {
    discText = `-${formatCurrency(Math.abs(closing.discrepancy))} (SHORT)`;
    discColor = '#b91c1c';
  }

  modalReceiptDetails.innerHTML = `
    <div class="receipt-line">
      <span>Date & Time:</span>
      <strong>${dateStr}</strong>
    </div>
    <div class="receipt-line">
      <span>Employee:</span>
      <strong>${escapeHtml(closing.employee_name)}</strong>
    </div>
    <div class="receipt-line">
      <span>Total Cash Counted:</span>
      <strong>${formatCurrency(closing.total_cash)}</strong>
    </div>
    ${Number(closing.cash_tips) > 0 ? `
    <div class="receipt-line" style="color: #047857; font-weight: 600;">
      <span>Cash Tips:</span>
      <strong>${formatCurrency(closing.cash_tips)}</strong>
    </div>` : ''}
    <div class="receipt-line">
      <span>Cash Kept in Drawer:</span>
      <strong>${formatCurrency(closing.drawer_float)}</strong>
    </div>
    <div class="receipt-line bold highlight">
      <span>Deposit to Bank:</span>
      <span>${formatCurrency(closing.deposit_amount)}</span>
    </div>
    <div class="receipt-line" style="border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 6px;">
      <span>Register Expected:</span>
      <strong>${formatCurrency(closing.expected_amount || 0)}</strong>
    </div>
    <div class="receipt-line" style="color: ${discColor}; font-weight: 700;">
      <span>Discrepancy:</span>
      <span>${discText}</span>
    </div>
  `;

  successModal.classList.add('active');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event Listeners
if (cashTipsInput) {
  cashTipsInput.addEventListener('input', recalculateTotals);
  cashTipsInput.addEventListener('change', recalculateTotals);
  cashTipsInput.addEventListener('blur', recalculateTotals);
}
drawerFloatInput.addEventListener('input', recalculateTotals);
drawerFloatInput.addEventListener('change', recalculateTotals);
drawerFloatInput.addEventListener('blur', recalculateTotals);
expectedAmountInput.addEventListener('input', recalculateTotals);
expectedAmountInput.addEventListener('change', recalculateTotals);
expectedAmountInput.addEventListener('blur', recalculateTotals);
btnSave.addEventListener('click', submitClosing);
btnResetTop.addEventListener('click', () => resetCalculator(true));
btnResetBottom.addEventListener('click', () => resetCalculator(true));

btnModalDone.addEventListener('click', () => {
  successModal.classList.remove('active');
  resetCalculator(false);
});

// Initialize on page load
renderDenominationRows();
recalculateTotals();
