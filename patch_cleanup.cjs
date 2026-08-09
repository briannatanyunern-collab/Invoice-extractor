const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');

const cleanupEndpoint = `
// Clean up existing duplicates in Invoice Ledger tab
app.post('/api/sheets/cleanup-duplicates', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(401).json({ error: 'Google Sheets connection lost.', connectionLost: true });
      return;
    }

    const sheetRes = await fetch(
      \`https://sheets.googleapis.com/v4/spreadsheets/\${SPREADSHEET_ID}/values/\${encodeURIComponent(TARGET_TAB)}!A1:ZZ\`,
      { headers: { Authorization: \`Bearer \${accessToken}\` } }
    );
    if (!sheetRes.ok) throw new Error('Failed to fetch ledger rows');
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    if (rows.length <= 1) {
      res.json({ success: true, removedRows: 0, removedInvoices: 0 });
      return;
    }

    const headerRow = rows[0];
    const map = buildHeaderMap(headerRow);
    const invIdx = map.invoiceNumber;
    const supIdx = map.supplierName;
    const extAtIdx = map.extractedAt;

    if (invIdx < 0 || supIdx < 0 || extAtIdx < 0) {
       res.json({ success: true, removedRows: 0, removedInvoices: 0, note: 'Missing required columns' });
       return;
    }

    const groups = {};

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const inv = (r[invIdx] || '').toString().trim().toLowerCase();
      const sup = (r[supIdx] || '').toString().trim().toLowerCase();
      if (!inv || !sup) continue;
      
      const key = \`\${inv}|||\${sup}\`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({
         rowIndex: i,
         extractedAt: (r[extAtIdx] || '').toString().trim()
      });
    }

    let indicesToDelete = [];
    let invoicesCleanedCount = 0;

    for (const key of Object.keys(groups)) {
       const group = groups[key];
       const timestamps = Array.from(new Set(group.map(g => g.extractedAt))).sort();
       if (timestamps.length > 1) {
          const earliest = timestamps[0];
          const toDelete = group.filter(g => g.extractedAt !== earliest).map(g => g.rowIndex);
          if (toDelete.length > 0) {
             indicesToDelete.push(...toDelete);
             invoicesCleanedCount++;
          }
       }
    }

    if (indicesToDelete.length === 0) {
       res.json({ success: true, removedRows: 0, removedInvoices: 0 });
       return;
    }

    indicesToDelete.sort((a, b) => b - a);

    const sheetId = await getSheetId(accessToken, TARGET_TAB);
    if (sheetId === null) throw new Error('Sheet ID not found');

    const deleteRequests = indicesToDelete.map(idx => ({
       deleteDimension: {
         range: {
           sheetId: sheetId,
           dimension: 'ROWS',
           startIndex: idx,
           endIndex: idx + 1
         }
       }
    }));

    const batchUpdateRes = await fetch(
      \`https://sheets.googleapis.com/v4/spreadsheets/\${SPREADSHEET_ID}:batchUpdate\`,
      {
         method: 'POST',
         headers: {
           Authorization: \`Bearer \${accessToken}\`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ requests: deleteRequests }),
      }
    );

    if (!batchUpdateRes.ok) {
       const err = await batchUpdateRes.text();
       throw new Error(\`Failed to delete duplicates: \${err}\`);
    }

    res.json({ success: true, removedRows: indicesToDelete.length, removedInvoices: invoicesCleanedCount });

  } catch (error) {
    console.error('Cleanup duplicates error:', error);
    res.status(500).json({ error: error.message || 'Failed to cleanup duplicates.' });
  }
});
`;

const updated = content.replace('// Update Match Status for an invoice', cleanupEndpoint + '\n// Update Match Status for an invoice');
fs.writeFileSync('server.ts', updated);
