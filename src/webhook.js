const { getSetting } = require('./db');

/**
 * Dispatches a webhook payload to the configured URL (Google Apps Script, Zapier, Make, Notion).
 * Runs asynchronously without blocking the user response.
 */
async function dispatchWebhook(closingData) {
  const webhookUrl = process.env.WEBHOOK_URL || getSetting('webhook_url');
  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    return { skipped: true, reason: 'No webhook URL configured' };
  }

  const payload = formatWebhookPayload(closingData);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GTillCalculator/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10-second timeout
    });

    const text = await response.text();
    console.log(`[Webhook] Sent closing #${closingData.id} to ${webhookUrl} - Status: ${response.status}`);
    return { success: response.ok, status: response.status, body: text };
  } catch (err) {
    console.error(`[Webhook] Error delivering closing #${closingData.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Format a till closing object into a standardized, Google-Sheets-friendly JSON payload.
 */
function formatWebhookPayload(closing) {
  const breakdown = closing.breakdown || {};
  return {
    event: 'till_closing',
    id: closing.id,
    timestamp: closing.created_at || new Date().toISOString(),
    employee_name: closing.employee_name,
    total_cash: closing.total_cash,
    drawer_float: closing.drawer_float,
    deposit_amount: closing.deposit_amount,
    expected_amount: closing.expected_amount,
    discrepancy: closing.discrepancy,
    notes: closing.notes || '',
    // Flat breakdown fields for easy column mapping in Google Sheets:
    count_100: Number(breakdown.bill_100?.count) || Number(closing.count_100) || 0,
    count_50:  Number(breakdown.bill_50?.count)  || Number(closing.count_50)  || 0,
    count_20:  Number(breakdown.bill_20?.count)  || Number(closing.count_20)  || 0,
    count_10:  Number(breakdown.bill_10?.count)  || Number(closing.count_10)  || 0,
    count_5:   Number(breakdown.bill_5?.count)   || Number(closing.count_5)   || 0,
    count_1:   Number(breakdown.bill_1?.count)   || Number(closing.count_1)   || 0,
    count_025: Number(breakdown.coin_25?.count)  || Number(closing.count_025) || 0,
    count_010: Number(breakdown.coin_10?.count)  || Number(closing.coin_010)  || 0,
    count_005: Number(breakdown.coin_5?.count)   || Number(closing.coin_005)  || 0,
    count_001: Number(breakdown.coin_1?.count)   || Number(closing.coin_001)  || 0,
    breakdown,
  };
}

module.exports = {
  dispatchWebhook,
  formatWebhookPayload,
};
