# Google Sheets Live Integration Guide

With this Till Calculator, you can automatically append every shift's drawer closing directly to a Google Sheet in real time using a free Google Apps Script Webhook.

---

## 2-Minute Setup Instructions

### Step 1: Create a Google Sheet
1. Open [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Name it **"Till Closings Log"** (or any name you prefer).

---

### Step 2: Add Google Apps Script
1. In the Google Sheet top menu, click **Extensions** > **Apps Script**.
2. Delete any existing code in the editor (`Code.gs`) and paste the following script:

```javascript
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    // Create headers automatically if sheet is brand new
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "ID",
        "Timestamp",
        "Employee",
        "Total Cash Counted",
        "Drawer Float Kept",
        "Bank Deposit Amount",
        "Register Expected",
        "Discrepancy (Over/Short)",
        "$100 Bills",
        "$50 Bills",
        "$20 Bills",
        "$10 Bills",
        "$5 Bills",
        "$1 Bills",
        "Quarters ($0.25)",
        "Dimes ($0.10)",
        "Nickels ($0.05)",
        "Pennies ($0.01)",
        "Notes"
      ]);
      sheet.getRange(1, 1, 1, 19).setFontWeight("bold").setBackground("#f3f4f6");
    }

    // Format currency helper
    const num = (v) => Number(v) || 0;

    // Append row
    sheet.appendRow([
      data.id || "",
      new Date(data.timestamp || Date.now()).toLocaleString(),
      data.employee_name || "",
      num(data.total_cash),
      num(data.drawer_float),
      num(data.deposit_amount),
      num(data.expected_amount),
      num(data.discrepancy),
      num(data.count_100),
      num(data.count_50),
      num(data.count_20),
      num(data.count_10),
      num(data.count_5),
      num(data.count_1),
      num(data.count_025),
      num(data.count_010),
      num(data.count_005),
      num(data.count_001),
      data.notes || ""
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Click the **Save** icon (diskette) in the toolbar.

---

### Step 3: Deploy as Web App
1. In the top right, click **Deploy** > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description**: `Till Calculator Webhook`
   - **Execute as**: `Me (your Google email)`
   - **Who has access**: `Anyone` *(crucial so your local server can post data to it)*
4. Click **Deploy**.
5. When prompted, click **Authorize access**, select your Google account, click **Advanced** > **Go to Till Calculator Webhook (unsafe)**, and click **Allow**.
6. Copy the generated **Web App URL** (it looks like `https://script.google.com/macros/s/AKfycb.../exec`).

---

### Step 4: Connect to Till Calculator
1. Open your Till Calculator app in your browser.
2. Click the **Admin** button (default PIN: `1234`).
3. Click **Webhook & Google Sheets**.
4. Paste the Web App URL into the **Webhook URL** field and click **Save**.
5. Click **Test** to send a test entry. Switch back to your Google Sheet tab to see the test row automatically inserted!

From now on, whenever an employee clicks **Save & Submit Till Closing**, a new row will instantly appear in your Google Sheet!
