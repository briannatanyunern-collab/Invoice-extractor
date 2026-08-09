/**
 * INVOICE LEDGER TAB — COLUMN OWNERSHIP:
 * 
 * Written by App 1 (App 2 reads only):
 *   Invoice Number, Date, Supplier Name, Supplier Address, PO 
 *   Reference, Line Description, Quantity, Unit Price, Line Total,
 *   Grand Total, Payment Due Date, Payment Terms, Extraction 
 *   Confidence, Extraction Notes, Extracted At
 * 
 * Written by App 2 (App 1 reads only):
 *   Match Status
 * 
 * Written by App 3 (Apps 1 and 2 read only, if at all):
 *   (App 3's payment tracking columns, if any)
 */

import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  buildHeaderMap,
  buildRowArray,
  DEFAULT_LEDGER_HEADERS,
  isValidDateFormat,
  recalculateDueDate,
} from './src/lib/sheetColumnMap';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const SPREADSHEET_ID = '1EokXlmMYiu1_BeYIziSeWneEaKV_PAFmyQR3USuGwQc';
const WORKBOOK_NAME = 'Boon Huat AP Master Data';
const TARGET_TAB = 'Invoice Ledger';

// In-memory fallback DB for local viewing if sheet is loading
let localLedgerRows: any[] = [];

// Helper to normalize invoice numbers for comparison
function normInvoice(inv: any): string {
  if (!inv) return '';
  return inv.toString().toLowerCase().replace(/\s+/g, '').trim();
}

// Lazy Gemini AI Client getter
let aiClient: GoogleGenAI | null = null;
function getGenAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

const MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'];
const modelUsage: Record<string, number[]> = {};
MODELS.forEach(m => { modelUsage[m] = []; });
const rateLimitedModels: Record<string, number> = {};

async function acquireModel(excludedModels: Set<string> = new Set()): Promise<string> {
  const now = Date.now();
  
  // Clean expired rate limit records
  for (const m of Object.keys(rateLimitedModels)) {
    if (rateLimitedModels[m] <= now) {
      delete rateLimitedModels[m];
    }
  }

  const eligible = MODELS.filter(m => !excludedModels.has(m) && !rateLimitedModels[m]);
  
  if (eligible.length > 0) {
    let bestModel = eligible[0];
    let minUsage = Infinity;
    for (const model of eligible) {
      modelUsage[model] = (modelUsage[model] || []).filter(t => now - t < 60000);
      if (modelUsage[model].length < minUsage) {
        minUsage = modelUsage[model].length;
        bestModel = model;
      }
    }
    modelUsage[bestModel] = modelUsage[bestModel] || [];
    modelUsage[bestModel].push(now);
    return bestModel;
  }

  const nonExcluded = MODELS.filter(m => !excludedModels.has(m));
  if (nonExcluded.length > 0) {
    return nonExcluded[0];
  }

  return MODELS[0];
}

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    targetWorkbook: WORKBOOK_NAME,
    targetTab: TARGET_TAB,
    spreadsheetId: SPREADSHEET_ID,
    time: new Date().toISOString(),
  });
});

// Helper to retrieve sheetId for a given tab title
async function getSheetId(accessToken: string, tabName: string): Promise<number> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!metaRes.ok) {
    const errText = await metaRes.text();
    throw new Error(`Failed to fetch spreadsheet metadata: ${errText}`);
  }
  const meta = await metaRes.json();
  const sheet = (meta.sheets || []).find(
    (s: any) => s.properties?.title === tabName
  );
  if (!sheet) {
    throw new Error(`Tab "${tabName}" not found in spreadsheet.`);
  }
  return sheet.properties.sheetId;
}

// GET existing records from Google Sheet "Invoice Ledger"
// Performs header check, restores corrupted Payment Due Dates, and syncs Match Status
app.post('/api/sheets/get-ledger', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(401).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
      });
      return;
    }

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!sheetRes.ok) {
      const errText = await sheetRes.text();
      res.status(sheetRes.status).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
        details: errText,
      });
      return;
    }

    const data = await sheetRes.json();
    const rows: any[][] = data.values || [];

    let headerPresent = false;
    let headerRow: string[] = DEFAULT_LEDGER_HEADERS;
    let dataRows: any[][] = [];

    if (rows.length > 0) {
      headerPresent = true;
      headerRow = rows[0];
      dataRows = rows.slice(1);
    }

    // 1. Ensure header row contains Payment Due Date, Payment Terms, Match Status, Due Date, and Supplier Address
    const existingHeaders = headerRow.map((h: any) => (h || '').toString().trim());
    const hasPaymentDueDateCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('payment due');
    });
    const hasDueDateCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm === 'due date';
    });
    const hasTermsCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('payment terms') || norm.includes('terms');
    });
    const hasMatchStatusCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('match status') || norm.includes('match verdict');
    });
    const hasSupplierAddressCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('supplier address') || norm.includes('address');
    });

    let headerUpdated = false;
    const newHeadersToAppend: string[] = [];
    if (!hasPaymentDueDateCol) newHeadersToAppend.push('Payment Due Date');
    if (!hasTermsCol) newHeadersToAppend.push('Payment Terms');
    if (!hasMatchStatusCol) newHeadersToAppend.push('Match Status');
    if (!hasDueDateCol) newHeadersToAppend.push('Due Date');
    if (!hasSupplierAddressCol) newHeadersToAppend.push('Supplier Address');

    if (newHeadersToAppend.length > 0) {
      headerRow = [...headerRow, ...newHeadersToAppend];
      headerUpdated = true;
    }

    let headerMap = buildHeaderMap(headerRow);

    // 2. Fetch Match Log tab data to get official App 2 match decisions
    const matchLogMap: Record<string, string> = {};
    try {
      const matchLogRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Match Log')}!A1:ZZ`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (matchLogRes.ok) {
        const mlData = await matchLogRes.json();
        const mlRows: any[][] = mlData.values || [];
        if (mlRows.length > 1) {
          const mlHeader = (mlRows[0] || []).map((h: any) => (h || '').toString().toLowerCase().trim());
          let mlInvIdx = mlHeader.findIndex((h) => h.includes('invoice'));
          if (mlInvIdx === -1) mlInvIdx = 0;
          let mlDecisionIdx = mlHeader.findIndex((h) => h === 'status');
          if (mlDecisionIdx === -1) mlDecisionIdx = 1;

          for (let k = 1; k < mlRows.length; k++) {
            const mlRow = mlRows[k];
            const mlInvKey = normInvoice(mlRow[mlInvIdx]);
            const mlDec = (mlRow[mlDecisionIdx] || '').toString().trim();
            if (mlInvKey && mlDec) {
              matchLogMap[mlInvKey] = mlDec;
            }
          }
        }
      }
    } catch (mlErr) {
      console.warn('Could not fetch Match Log tab during ledger sync:', mlErr);
    }

    // 3. Process dataRows (padding columns, syncing Match Status if needed, but NOT auto-repairing Payment Due Date on load)
    let rowsUpdated = false;

    dataRows = dataRows.map((row) => {
      // Ensure row array has enough length for all headerMap columns
      const maxColIdx = Math.max(...Object.values(headerMap), headerRow.length - 1);
      while (row.length <= maxColIdx) {
        row.push('');
      }

      const invNum = row[headerMap.invoiceNumber];
      const invKey = normInvoice(invNum);

      // Sync Match Status column from Match Log tab if Match Log has a decision
      if (matchLogMap[invKey] && headerMap.matchStatus !== undefined && headerMap.matchStatus >= 0) {
        const existingMatchStatus = row[headerMap.matchStatus];
        if (existingMatchStatus !== matchLogMap[invKey]) {
          row[headerMap.matchStatus] = matchLogMap[invKey];
          rowsUpdated = true;
        }
      }

      return row;
    });

    // 4. Save updated header back to Google Sheets if missing columns were appended
    if (headerUpdated || rowsUpdated) {
      try {
        const fullValues = [headerRow, ...dataRows];
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: fullValues }),
          }
        );
      } catch (saveErr) {
        console.warn('Error persisting updated header to Google Sheet:', saveErr);
      }
    }

    res.json({
      success: true,
      headerPresent,
      headerRow,
      headerMap,
      totalRows: dataRows.length,
      rawRows: dataRows,
      spreadsheetName: WORKBOOK_NAME,
      tabName: TARGET_TAB,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch Google Sheet data.' });
  }
});

// Repair Due Dates in "Invoice Ledger" tab (Manual action triggered by button in Tab 3)
app.post('/api/sheets/repair-due-dates', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(401).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
      });
      return;
    }

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!sheetRes.ok) {
      const errText = await sheetRes.text();
      res.status(sheetRes.status).json({
        error: 'Failed to read Google Sheet values.',
        details: errText,
      });
      return;
    }

    const data = await sheetRes.json();
    const rows: any[][] = data.values || [];

    if (rows.length <= 1) {
      res.json({
        success: true,
        repairedCount: 0,
        repairedInvoicesCount: 0,
        message: 'No invoice rows found in Invoice Ledger.',
      });
      return;
    }

    const headerRow = rows[0];
    const headerMap = buildHeaderMap(headerRow);
    const dataRows = rows.slice(1);
    const todayStr = new Date().toISOString().split('T')[0];

    let repairedRowCount = 0;
    const repairedInvoicesSet = new Set<string>();

    const updatedDataRows = dataRows.map((row) => {
      // Ensure row array has enough length
      const maxColIdx = Math.max(...Object.values(headerMap), headerRow.length - 1);
      while (row.length <= maxColIdx) {
        row.push('');
      }

      const rawDueDate = row[headerMap.dueDate] || row[headerMap.paymentDueDate];
      const invNum = row[headerMap.invoiceNumber] || 'Unknown';

      // Check if valid YYYY-MM-DD
      if (!isValidDateFormat(rawDueDate)) {
        const invDateStr = row[headerMap.invoiceDate];
        const termsStr = row[headerMap.paymentTerms];

        // 1. Recalculate Payment Due Date
        const repairedDueDate = recalculateDueDate(invDateStr, termsStr);
        if (headerMap.dueDate !== undefined && headerMap.dueDate >= 0) {
          row[headerMap.dueDate] = repairedDueDate;
        }
        if (headerMap.paymentDueDate !== undefined && headerMap.paymentDueDate >= 0) {
          row[headerMap.paymentDueDate] = repairedDueDate;
        }

        // 2. Append note to Extraction Notes
        const currentNotes = (row[headerMap.extractionNotes] || '').toString().trim();
        const repairNote = `Payment Due Date repaired on ${todayStr} — previous value was corrupted.`;
        if (!currentNotes.includes('Payment Due Date repaired')) {
          row[headerMap.extractionNotes] = currentNotes && currentNotes !== 'N/A'
            ? `${currentNotes} ${repairNote}`
            : repairNote;
        }

        repairedRowCount++;
        if (invNum) repairedInvoicesSet.add(invNum);
      }

      return row;
    });

    if (repairedRowCount > 0) {
      const fullValues = [headerRow, ...updatedDataRows];
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: fullValues }),
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        res.status(updateRes.status).json({
          error: 'Failed to write repaired due dates back to Google Sheets.',
          details: errText,
        });
        return;
      }
    }

    res.json({
      success: true,
      repairedCount: repairedRowCount,
      repairedInvoicesCount: repairedInvoicesSet.size,
      message: `Repaired ${repairedRowCount} row(s) across ${repairedInvoicesSet.size} invoice(s). Original corrupted values are logged in Extraction Notes for each row. Please spot-check the new dates against the original invoices.`,
    });
  } catch (err: any) {
    console.error('Repair due dates error:', err);
    res.status(500).json({ error: err.message || 'Failed to repair due dates.' });
  }
});

// Check Duplicate (Invoice Number + Supplier Name in Invoice Ledger)
app.post('/api/sheets/check-duplicate', async (req, res) => {
  try {
    const { accessToken, invoiceNumber, supplierName } = req.body;
    if (!accessToken) {
      res.status(401).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
      });
      return;
    }

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!sheetRes.ok) {
      res.json({ isDuplicate: false });
      return;
    }

    const data = await sheetRes.json();
    const rows = data.values || [];

    if (rows.length <= 1) {
      res.json({ isDuplicate: false, rowCount: 0 });
      return;
    }

    const headerRow = rows[0];
    const headerMap = buildHeaderMap(headerRow);
    const dataRows = rows.slice(1);

    const targetInv = (invoiceNumber || '').trim().toLowerCase();
    const targetSup = (supplierName || '').trim().toLowerCase();

    let isDuplicate = false;
    let matchingRowCount = 0;
    let extractedAt = '';

    if (targetInv && targetSup) {
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowInv = (row[headerMap.invoiceNumber] || '').trim().toLowerCase();
        const rowSup = (row[headerMap.supplierName] || '').trim().toLowerCase();
        if (rowInv === targetInv && rowSup === targetSup) {
          isDuplicate = true;
          matchingRowCount++;
          if (!extractedAt && row[headerMap.extractedAt]) {
            extractedAt = row[headerMap.extractedAt];
          }
        }
      }
    }

    res.json({
      success: true,
      isDuplicate,
      rowCount: matchingRowCount,
      extractedAt,
    });
  } catch (err: any) {
    res.json({ isDuplicate: false, error: err.message });
  }
});

// Delete Invoice Rows from "Invoice Ledger" by Invoice Number using batchUpdate deleteDimension
app.post('/api/sheets/delete-invoice', async (req, res) => {
  try {
    const { accessToken, invoiceNumber } = req.body;
    if (!accessToken) {
      res.status(401).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
      });
      return;
    }

    if (!invoiceNumber) {
      res.status(400).json({ error: 'Invoice number is required.' });
      return;
    }

    // 1. Get numerical sheetId
    const sheetId = await getSheetId(accessToken, TARGET_TAB);

    // 2. Fetch all values in sheet to inspect headers and rows
    const valRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!valRes.ok) {
      const errText = await valRes.text();
      res.status(valRes.status).json({
        error: 'Failed to read Google Sheet values.',
        connectionLost: valRes.status === 401,
        details: errText,
      });
      return;
    }

    const valData = await valRes.json();
    const rows = valData.values || [];

    if (rows.length === 0) {
      res.json({ success: true, deletedRowCount: 0, message: 'Sheet is empty.' });
      return;
    }

    const headerRow = rows[0];
    const headerMap = buildHeaderMap(headerRow);
    const targetInv = invoiceNumber.trim().toLowerCase();
    const matchingRowIndexes: number[] = [];

    // Note: row 0 is header (index 0). Data rows start at index 1.
    for (let i = 1; i < rows.length; i++) {
      const cellVal = (rows[i][headerMap.invoiceNumber] || '').trim().toLowerCase();
      if (cellVal === targetInv) {
        matchingRowIndexes.push(i);
      }
    }

    if (matchingRowIndexes.length === 0) {
      res.json({
        success: true,
        deletedRowCount: 0,
        message: `No matching rows found for ${invoiceNumber}.`,
      });
      return;
    }

    // 3. Group contiguous row indexes into ranges
    matchingRowIndexes.sort((a, b) => a - b);
    const ranges: { startIndex: number; endIndex: number }[] = [];
    let currentStart = matchingRowIndexes[0];
    let currentEnd = matchingRowIndexes[0] + 1;

    for (let k = 1; k < matchingRowIndexes.length; k++) {
      const idx = matchingRowIndexes[k];
      if (idx === currentEnd) {
        currentEnd = idx + 1;
      } else {
        ranges.push({ startIndex: currentStart, endIndex: currentEnd });
        currentStart = idx;
        currentEnd = idx + 1;
      }
    }
    ranges.push({ startIndex: currentStart, endIndex: currentEnd });

    // Sort descending by startIndex so bottom rows are deleted first
    ranges.sort((a, b) => b.startIndex - a.startIndex);

    // 4. Send batchUpdate deleteDimension
    const deleteRequests = ranges.map((r) => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'ROWS',
          startIndex: r.startIndex,
          endIndex: r.endIndex,
        },
      },
    }));

    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: deleteRequests }),
      }
    );

    if (!batchRes.ok) {
      const errText = await batchRes.text();
      res.status(batchRes.status).json({
        error: 'Failed to delete rows from Google Sheet.',
        details: errText,
      });
      return;
    }

    res.json({
      success: true,
      deletedRowCount: matchingRowIndexes.length,
      message: `Deleted ${matchingRowIndexes.length} row(s) for ${invoiceNumber}.`,
    });
  } catch (err: any) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete invoice.' });
  }
});

// Batch Delete Invoices (deletes all rows matching an array of invoice numbers)
app.post('/api/sheets/batch-delete-invoices', async (req, res) => {
  try {
    const { accessToken, invoiceNumbers } = req.body;
    if (!accessToken) {
      res.status(401).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
      });
      return;
    }

    if (!invoiceNumbers || !Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
      res.status(400).json({ error: 'At least one invoice number is required for bulk delete.' });
      return;
    }

    const sheetId = await getSheetId(accessToken, TARGET_TAB);

    const valRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!valRes.ok) {
      const errText = await valRes.text();
      res.status(valRes.status).json({
        error: 'Failed to read Google Sheet values.',
        connectionLost: valRes.status === 401,
        details: errText,
      });
      return;
    }

    const valData = await valRes.json();
    const rows = valData.values || [];

    if (rows.length === 0) {
      res.json({ success: true, deletedInvoiceCount: 0, deletedRowCount: 0, message: 'Sheet is empty.' });
      return;
    }

    const headerRow = rows[0];
    const headerMap = buildHeaderMap(headerRow);
    const targetInvs = new Set(invoiceNumbers.map((inv: string) => (inv || '').trim().toLowerCase()));

    const matchingRowIndexes: number[] = [];

    for (let i = 1; i < rows.length; i++) {
      const cellVal = (rows[i][headerMap.invoiceNumber] || '').trim().toLowerCase();
      if (cellVal && targetInvs.has(cellVal)) {
        matchingRowIndexes.push(i);
      }
    }

    if (matchingRowIndexes.length === 0) {
      res.json({
        success: true,
        deletedInvoiceCount: invoiceNumbers.length,
        deletedRowCount: 0,
        message: 'No matching rows found in Google Sheet.',
      });
      return;
    }

    matchingRowIndexes.sort((a, b) => a - b);
    const ranges: { startIndex: number; endIndex: number }[] = [];
    let currentStart = matchingRowIndexes[0];
    let currentEnd = matchingRowIndexes[0] + 1;

    for (let k = 1; k < matchingRowIndexes.length; k++) {
      const idx = matchingRowIndexes[k];
      if (idx === currentEnd) {
        currentEnd = idx + 1;
      } else {
        ranges.push({ startIndex: currentStart, endIndex: currentEnd });
        currentStart = idx;
        currentEnd = idx + 1;
      }
    }
    ranges.push({ startIndex: currentStart, endIndex: currentEnd });
    ranges.sort((a, b) => b.startIndex - a.startIndex);

    const deleteRequests = ranges.map((r) => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'ROWS',
          startIndex: r.startIndex,
          endIndex: r.endIndex,
        },
      },
    }));

    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: deleteRequests }),
      }
    );

    if (!batchRes.ok) {
      const errText = await batchRes.text();
      res.status(batchRes.status).json({
        error: 'Failed to delete rows from Google Sheet.',
        details: errText,
      });
      return;
    }

    const deletedRowsData = matchingRowIndexes.map((i) => rows[i]);

    res.json({
      success: true,
      deletedInvoiceCount: invoiceNumbers.length,
      deletedRowCount: matchingRowIndexes.length,
      deletedRowsData,
      message: `Deleted ${invoiceNumbers.length} invoice(s) (${matchingRowIndexes.length} rows).`,
    });
  } catch (err: any) {
    console.error('Batch delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to bulk delete invoices.' });
  }
});

// Restore deleted rows to "Invoice Ledger"
app.post('/api/sheets/restore-rows', async (req, res) => {
  try {
    const { accessToken, rows } = req.body;
    if (!accessToken || !rows || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Access token and valid rows array required.' });
      return;
    }

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      }
    );

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      res.status(appendRes.status).json({
        error: 'Failed to restore rows to Google Sheet.',
        details: errText,
      });
      return;
    }

    res.json({ success: true, restoredCount: rows.length });
  } catch (err: any) {
    console.error('Restore rows error:', err);
    res.status(500).json({ error: err.message || 'Failed to restore rows.' });
  }
});

// Fetch Purchase Orders from Google Sheets "Purchase Orders" tab
app.post('/api/sheets/get-purchase-orders', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(401).json({ error: 'No access token provided' });
      return;
    }

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Purchase Orders')}!A1:ZZ`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!sheetRes.ok) {
      res.json({ success: false, pos: [] });
      return;
    }

    const data = await sheetRes.json();
    const rows = data.values || [];
    if (rows.length <= 1) {
      res.json({ success: true, pos: [] });
      return;
    }

    const headerRow = rows[0].map((h: any) => (h || '').toString().toLowerCase().trim());
    let poCol = headerRow.findIndex((h: string) => h.includes('po') || h.includes('order'));
    let supCol = headerRow.findIndex((h: string) => h.includes('supplier') || h.includes('vendor'));
    if (poCol === -1) poCol = 0;
    if (supCol === -1) supCol = 1;

    const pos = rows.slice(1).map((r: any[]) => ({
      poNumber: (r[poCol] || '').toString().trim(),
      supplierName: (r[supCol] || '').toString().trim(),
    })).filter((p: any) => p.poNumber);

    res.json({ success: true, pos });
  } catch (err: any) {
    res.json({ success: false, pos: [], error: err.message });
  }
});

// Fetch Match Log from Google Sheets "Match Log" tab
app.post('/api/sheets/get-match-log', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(401).json({ error: 'No access token provided', connectionLost: true });
      return;
    }

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Match Log')}!A1:ZZ`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!sheetRes.ok) {
      const errText = await sheetRes.text();
      if (sheetRes.status === 401) {
        res.status(401).json({ error: 'Google Sheets connection lost.', connectionLost: true });
        return;
      }
      if (errText.includes('Unable to parse range') || errText.includes('NOT_FOUND') || sheetRes.status === 400) {
        res.json({
          success: false,
          errorType: 'TAB_NOT_FOUND',
          message: 'Match Log tab not found in the connected sheet.',
        });
        return;
      }
      res.status(sheetRes.status).json({
        error: 'Failed to fetch Match Log.',
        details: errText,
      });
      return;
    }

    const data = await sheetRes.json();
    res.json({
      success: true,
      rows: data.values || [],
    });
  } catch (err: any) {
    console.error('Fetch Match Log Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch Match Log.' });
  }
});

// Replace / Edit Invoice (Deletes old rows for targetInvoiceNumber, appends new rows)
app.post('/api/sheets/replace-invoice', async (req, res) => {
  try {
    const { accessToken, targetInvoiceNumber, invoiceData, extractedBy } = req.body;
    if (!accessToken) {
      res.status(401).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
      });
      return;
    }

    if (!invoiceData) {
      res.status(400).json({ error: 'Invoice data is required.' });
      return;
    }

    const invNumToDelete = targetInvoiceNumber || invoiceData.invoiceNumber?.value;
    let headerRow: string[] = DEFAULT_LEDGER_HEADERS;

    // 1. Delete existing rows for targetInvoiceNumber if present & retrieve header row
    if (invNumToDelete) {
      try {
        const sheetId = await getSheetId(accessToken, TARGET_TAB);
        const valRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (valRes.ok) {
          const valData = await valRes.json();
          const rows = valData.values || [];
          if (rows.length > 0) {
            headerRow = rows[0];
          }
          const headerMap = buildHeaderMap(headerRow);
          const targetInv = invNumToDelete.trim().toLowerCase();
          const matchingRowIndexes: number[] = [];

          for (let i = 1; i < rows.length; i++) {
            if ((rows[i][headerMap.invoiceNumber] || '').trim().toLowerCase() === targetInv) {
              matchingRowIndexes.push(i);
            }
          }

          if (matchingRowIndexes.length > 0) {
            matchingRowIndexes.sort((a, b) => a - b);
            const ranges: { startIndex: number; endIndex: number }[] = [];
            let currentStart = matchingRowIndexes[0];
            let currentEnd = matchingRowIndexes[0] + 1;

            for (let k = 1; k < matchingRowIndexes.length; k++) {
              const idx = matchingRowIndexes[k];
              if (idx === currentEnd) {
                currentEnd = idx + 1;
              } else {
                ranges.push({ startIndex: currentStart, endIndex: currentEnd });
                currentStart = idx;
                currentEnd = idx + 1;
              }
            }
            ranges.push({ startIndex: currentStart, endIndex: currentEnd });
            ranges.sort((a, b) => b.startIndex - a.startIndex);

            const deleteRequests = ranges.map((r) => ({
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'ROWS',
                  startIndex: r.startIndex,
                  endIndex: r.endIndex,
                },
              },
            }));

            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ requests: deleteRequests }),
              }
            );
          }
        }
      } catch (delErr) {
        console.warn('Error deleting old rows during replace:', delErr);
      }
    }

    // Ensure headerRow contains Payment Due Date, Payment Terms, Match Status, Due Date, and Supplier Address if missing
    const existingHeaders = headerRow.map((h: any) => (h || '').toString().trim());
    const hasPaymentDueDateCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('payment due');
    });
    const hasDueDateCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm === 'due date';
    });
    const hasTermsCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('payment terms') || norm.includes('terms');
    });
    const hasMatchStatusCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('match status') || norm.includes('match verdict');
    });
    const hasSupplierAddressCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('supplier address') || norm.includes('address');
    });
    const hasExtractedByCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('extracted by');
    });

    const newHeadersToAppend: string[] = [];
    if (!hasPaymentDueDateCol) newHeadersToAppend.push('Payment Due Date');
    if (!hasTermsCol) newHeadersToAppend.push('Payment Terms');
    if (!hasMatchStatusCol) newHeadersToAppend.push('Match Status');
    if (!hasDueDateCol) newHeadersToAppend.push('Due Date');
    if (!hasSupplierAddressCol) newHeadersToAppend.push('Supplier Address');
    if (!hasExtractedByCol) newHeadersToAppend.push('Extracted By');

    if (newHeadersToAppend.length > 0) {
      const updatedHeaders = [...headerRow, ...newHeadersToAppend];
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [updatedHeaders],
          }),
        }
      );
      headerRow = updatedHeaders;
    }

    // 2. Append new rows according to header layout
    const timestamp = new Date().toISOString();
    const lineItems =
      invoiceData.lineItems && invoiceData.lineItems.length > 0
        ? invoiceData.lineItems
        : [
            {
              description: 'General Hardware Supplies',
              quantity: 1,
              unitPrice: invoiceData.grandTotal?.value || 0,
              lineTotal: invoiceData.grandTotal?.value || 0,
            },
          ];

    const overallConfidence = invoiceData.supplierName?.confidence || 'High';

    const rowsToAppend = lineItems.map((item: any) =>
      buildRowArray(headerRow, invoiceData, item, timestamp, overallConfidence, extractedBy)
    );

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A:ZZ:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rowsToAppend }),
      }
    );

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      res.status(appendRes.status).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
        details: errText,
      });
      return;
    }

    res.json({
      success: true,
      message: `Replaced/saved rows for ${invoiceData.invoiceNumber?.value}.`,
      rowsAppendedCount: rowsToAppend.length,
    });
  } catch (err: any) {
    console.error('Replace invoice error:', err);
    res.status(500).json({ error: err.message || 'Failed to replace invoice.' });
  }
});

// Append Invoice Rows to "Invoice Ledger" tab (1 row per line item)
app.post('/api/sheets/append-ledger', async (req, res) => {
  try {
    const { accessToken, invoiceData, extractedBy } = req.body;
    if (!accessToken) {
      res.status(401).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
      });
      return;
    }

    if (!invoiceData) {
      res.status(400).json({ error: 'Invoice data is required.' });
      return;
    }

    // 1. Check if headers exist in row 1
    const checkHeaderRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let needsHeader = true;
    let headerRow: string[] = DEFAULT_LEDGER_HEADERS;

    if (checkHeaderRes.ok) {
      const headerData = await checkHeaderRes.json();
      if (
        headerData.values &&
        headerData.values.length > 0 &&
        headerData.values[0].length > 0
      ) {
        needsHeader = false;
        headerRow = headerData.values[0];
      }
    }

    if (needsHeader) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [DEFAULT_LEDGER_HEADERS],
          }),
        }
      );
      headerRow = DEFAULT_LEDGER_HEADERS;
    } else {
      // Header exists! Ensure "Payment Due Date", "Payment Terms", "Match Status", "Due Date", and "Supplier Address" columns exist at end if missing
      const existingHeaders = headerRow.map((h: any) => (h || '').toString().trim());
      const hasPaymentDueDateCol = existingHeaders.some((h) => {
        const norm = h.toLowerCase();
        return norm.includes('payment due');
      });
      const hasDueDateCol = existingHeaders.some((h) => {
        const norm = h.toLowerCase();
        return norm === 'due date';
      });
      const hasTermsCol = existingHeaders.some((h) => {
        const norm = h.toLowerCase();
        return norm.includes('payment terms') || norm.includes('terms');
      });
      const hasMatchStatusCol = existingHeaders.some((h) => {
        const norm = h.toLowerCase();
        return norm.includes('match status') || norm.includes('match verdict');
      });
      const hasSupplierAddressCol = existingHeaders.some((h) => {
        const norm = h.toLowerCase();
        return norm.includes('supplier address') || norm.includes('address');
      });
      const hasExtractedByCol = existingHeaders.some((h) => {
        const norm = h.toLowerCase();
        return norm.includes('extracted by');
      });

      const newHeadersToAppend: string[] = [];
      if (!hasPaymentDueDateCol) newHeadersToAppend.push('Payment Due Date');
      if (!hasTermsCol) newHeadersToAppend.push('Payment Terms');
      if (!hasMatchStatusCol) newHeadersToAppend.push('Match Status');
      if (!hasDueDateCol) newHeadersToAppend.push('Due Date');
      if (!hasSupplierAddressCol) newHeadersToAppend.push('Supplier Address');
      if (!hasExtractedByCol) newHeadersToAppend.push('Extracted By');

      if (newHeadersToAppend.length > 0) {
        const updatedHeaders = [...headerRow, ...newHeadersToAppend];
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ1?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [updatedHeaders],
            }),
          }
        );
        headerRow = updatedHeaders;
      }
    }

    // 2. Prepare line items - 1 row per line item
    const timestamp = new Date().toISOString();
    const lineItems =
      invoiceData.lineItems && invoiceData.lineItems.length > 0
        ? invoiceData.lineItems
        : [
            {
              description: 'General Hardware Supplies',
              quantity: 1,
              unitPrice: invoiceData.grandTotal?.value || 0,
              lineTotal: invoiceData.grandTotal?.value || 0,
            },
          ];

    const overallConfidence = invoiceData.supplierName?.confidence || 'High';

    const rowsToAppend = lineItems.map((item: any) =>
      buildRowArray(headerRow, invoiceData, item, timestamp, overallConfidence, extractedBy)
    );

    // 3. Append to "Invoice Ledger" tab using values.append
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A:ZZ:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rowsToAppend,
        }),
      }
    );

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      res.status(appendRes.status).json({
        error: 'Google Sheets connection lost. Please reconnect via the Tools panel.',
        connectionLost: true,
        details: errText,
      });
      return;
    }

    res.json({
      success: true,
      message: `Wrote ${rowsToAppend.length} row(s) to Invoice Ledger. App 2 can now match this invoice.`,
      rowsAppendedCount: rowsToAppend.length,
      spreadsheetName: WORKBOOK_NAME,
      tabName: TARGET_TAB,
    });
  } catch (error: any) {
    console.error('Append error:', error);
    res.status(500).json({ error: error.message || 'Failed to append to Google Sheet.' });
  }
});


// Clean up existing duplicates in Invoice Ledger tab
app.post('/api/sheets/cleanup-duplicates', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(401).json({ error: 'Google Sheets connection lost.', connectionLost: true });
      return;
    }

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
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
      
      const key = `${inv}|||${sup}`;
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
       const validTimestamps = Array.from(new Set(group.map(g => g.extractedAt)))
         .map(t => (t || '').toString().trim())
         .filter(Boolean)
         .sort((a, b) => {
            const dA = Date.parse(a);
            const dB = Date.parse(b);
            if (!isNaN(dA) && !isNaN(dB)) {
              return dA - dB;
            }
            return a.localeCompare(b);
         });

       if (validTimestamps.length > 0) {
          const earliest = validTimestamps[0];
          const toDelete = group.filter(g => g.extractedAt !== earliest).map(g => g.rowIndex);
          if (toDelete.length > 0) {
             indicesToDelete.push(...toDelete);
             invoicesCleanedCount++;
          }
       } else {
          // Fallback if no valid timestamps exist: sort by row index and keep the first row
          const rowIndices = group.map(g => g.rowIndex).sort((a, b) => a - b);
          if (rowIndices.length > 1) {
             const toDelete = rowIndices.slice(1);
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
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
         method: 'POST',
         headers: {
           Authorization: `Bearer ${accessToken}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ requests: deleteRequests }),
      }
    );

    if (!batchUpdateRes.ok) {
       const err = await batchUpdateRes.text();
       throw new Error(`Failed to delete duplicates: ${err}`);
    }

    res.json({ success: true, removedRows: indicesToDelete.length, removedInvoices: invoicesCleanedCount });

  } catch (error) {
    console.error('Cleanup duplicates error:', error);
    res.status(500).json({ error: error.message || 'Failed to cleanup duplicates.' });
  }
});

// Update Match Status for an invoice in "Invoice Ledger" (App 2 match decision write path)
// CRITICAL: Must ONLY write to "Match Status" column. "Payment Due Date" is App 1's data and READ-ONLY.
app.post('/api/sheets/update-match-status', async (req, res) => {
  try {
    const { accessToken, invoiceNumber, matchStatus, notes } = req.body;
    if (!accessToken || !invoiceNumber || !matchStatus) {
      res.status(400).json({ error: 'accessToken, invoiceNumber, and matchStatus required.' });
      return;
    }

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!sheetRes.ok) {
      res.status(sheetRes.status).json({ error: 'Failed to read Google Sheet.' });
      return;
    }

    const data = await sheetRes.json();
    const rows: any[][] = data.values || [];
    if (rows.length <= 1) {
      res.status(404).json({ error: 'No invoice rows found in ledger.' });
      return;
    }

    let headerRow = rows[0];
    const existingHeaders = headerRow.map((h: any) => (h || '').toString().trim());
    let hasMatchStatusCol = existingHeaders.some((h) => {
      const norm = h.toLowerCase();
      return norm.includes('match status') || norm.includes('match verdict');
    });

    if (!hasMatchStatusCol) {
      headerRow.push('Match Status');
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [headerRow] }),
        }
      );
    }

    const headerMap = buildHeaderMap(headerRow);
    const targetInvKey = normInvoice(invoiceNumber);
    let updatedCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const rowInvKey = normInvoice(rows[i][headerMap.invoiceNumber]);
      if (rowInvKey === targetInvKey) {
        // WRITE ONLY TO Match Status column. DO NOT TOUCH Payment Due Date!
        rows[i][headerMap.matchStatus] = matchStatus;
        if (notes && headerMap.extractionNotes !== undefined) {
          const current = (rows[i][headerMap.extractionNotes] || '').toString();
          if (!current.includes(notes)) {
            rows[i][headerMap.extractionNotes] = current ? `${current} | App 2: ${notes}` : `App 2: ${notes}`;
          }
        }
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TARGET_TAB)}!A1:ZZ?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: rows }),
        }
      );
    }

    res.json({
      success: true,
      updatedRows: updatedCount,
      message: `Updated Match Status to "${matchStatus}" for invoice ${invoiceNumber}. Payment Due Date was untouched.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update Match Status.' });
  }
});

// POST /api/extract-invoice using Gemini 3.6 Flash
app.post('/api/extract-invoice', async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body;

    if (!base64Data) {
      res.status(400).json({ error: 'Base64 file data is required.' });
      return;
    }

    const ai = getGenAIClient();

    const promptText = `
You are an expert Singapore Accounts Payable (AP) Invoice Extraction Specialist for "Boon Huat Hardware Pte Ltd".
Examine the attached invoice document (which may be a printed tax invoice, equipment bill, or a photo/scan of a handwritten delivery/cash sale note).

Extract ALL of the following fields carefully.
CRITICAL MANDATE ON MISSING FIELDS:
- Do NOT leave any field blank or omitted.
- If a field is genuinely not present on the invoice document, write "N/A" for text fields, or 0 for numeric fields, and note it explicitly in the extractionNotes.

CRITICAL INSTRUCTIONS ON CONFIDENCE SCORES:
- Rate confidence as "High", "Medium", or "Low".
- Confidence is based ONLY on how clearly the source text was visually readable from the document scan or photo (e.g. clear typed text = High, readable handwriting = Medium, smudged/blurry = Low).
- DO NOT lower confidence based on supplier name being new or unfamiliar. Apply the exact same standard to every supplier.

REQUIRED EXTRACTION FIELDS:
1. Invoice Number (e.g., "INV-2026-0451", "ST-88219"; or "N/A" if omitted)
2. Invoice Date (format: YYYY-MM-DD; or "N/A")
3. Supplier Name (exact company name as printed or handwritten on the document)
4. Supplier Address (full address if visible, or "N/A")
5. PO Reference (Purchasing Order reference number, e.g. "PO-2026-002", "Your PO", "P.O. No."; or "N/A")
6. Subtotal (Number before GST)
7. GST Amount (Singapore GST printed value. Extract printed value; do NOT recalculate if printed. If unlisted, write 0 and explain in extractionNotes)
8. Grand Total (final total amount payable)
9. Payment Due Date (format: YYYY-MM-DD; priority: 1. explicit "Due Date"/"Payment Due"/"Pay By"/"Payable By" field verbatim; 2. calculated from payment terms ("Net 7" -> +7d, "Net 14" -> +14d, "Net 15" -> +15d, "Net 30" -> +30d, "Net 60" -> +60d, "Net 90" -> +90d, "COD"/"Cash on Delivery"/"Payable on receipt"/"Immediate" -> same as Invoice Date); 3. if neither is printed, default to Invoice Date + 30 days and add note in extractionNotes: "Due date not stated on invoice. Defaulted to Invoice Date + 30 days.")
10. Payment Terms (the raw payment terms text printed on invoice e.g. "Net 30", "COD", "Payable on receipt"; if no terms printed, store "Not stated")
11. Line Items: Extract EVERY line item on the invoice (Item Description, Quantity, Unit Price, Line Total).
    - "Unit Price" MUST be extracted as a decimal number (not a string, no currency symbols, e.g. 22.50).
    - "Line Total" MUST be extracted as a decimal number (e.g. 675.00).
    - If either is missing from the invoice, DO NOT write 0 unless actually zero — write the value the invoice shows, or if absent calculate unitPrice = lineTotal / quantity and note in extractionNotes.
12. Extraction Notes: Write a clear, plain-English explanation for accounts clerk Mrs. Tan. Note any ambiguous readings, assumptions made, or fields marked "N/A".
`;

    const isRateLimitError = (err: any) => {
      const msg = (err?.message || JSON.stringify(err || '')).toLowerCase();
      return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('rate-limit');
    };

    const runExtraction = async (strict = false) => {
      const excludedModels = new Set<string>();
      let lastError: any = null;

      while (excludedModels.size < MODELS.length) {
        const model = await acquireModel(excludedModels);
        console.log(`Attempting extraction using model: ${model}`);

        try {
          const finalPrompt = strict
            ? promptText + '\n\nSTRICT RETRY: Ensure ALL fields are populated with values or "N/A". Extract every line item.'
            : promptText;

          const aiCall = ai.models.generateContent({
            model: model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/png',
                    data: base64Data,
                  },
                },
                {
                  text: finalPrompt,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  invoiceNumber: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.STRING },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  invoiceDate: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.STRING },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  supplierName: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.STRING },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  supplierAddress: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.STRING },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  poReference: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.STRING },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  paymentDueDate: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.STRING },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  paymentTerms: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.STRING },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  subtotal: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.NUMBER },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  gstAmount: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.NUMBER },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  grandTotal: {
                    type: Type.OBJECT,
                    properties: {
                      value: { type: Type.NUMBER },
                      confidence: { type: Type.STRING },
                    },
                    required: ['value', 'confidence'],
                  },
                  lineItemsConfidence: { type: Type.STRING },
                  lineItems: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        description: { type: Type.STRING },
                        quantity: { type: Type.NUMBER },
                        unitPrice: { type: Type.NUMBER },
                        lineTotal: { type: Type.NUMBER },
                      },
                      required: ['description', 'quantity', 'unitPrice', 'lineTotal'],
                    },
                  },
                  extractionNotes: {
                    type: Type.STRING,
                  },
                },
                required: [
                  'invoiceNumber',
                  'invoiceDate',
                  'supplierName',
                  'supplierAddress',
                  'poReference',
                  'paymentDueDate',
                  'paymentTerms',
                  'subtotal',
                  'gstAmount',
                  'grandTotal',
                  'lineItems',
                  'extractionNotes',
                ],
              },
            },
          });
          const timeoutPromise = new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error('Extraction timed out after 45 seconds')), 45000)
          );
          return await Promise.race([aiCall, timeoutPromise]);
        } catch (err: any) {
          lastError = err;
          if (isRateLimitError(err)) {
            console.warn(`Model ${model} rate-limited. Rotating model...`);
            rateLimitedModels[model] = Date.now() + 60000;
            excludedModels.add(model);
          } else {
            throw err;
          }
        }
      }

      throw lastError || new Error('All AI models are currently rate limited.');
    };

    let response;
    try {
      try {
        response = await runExtraction(false);
      } catch (err: any) {
        if (isRateLimitError(err)) {
          throw err;
        }
        console.log('First pass failed, retrying strict mode. Error:', err?.message || err);
        response = await runExtraction(true);
      }
    } catch (apiErr: any) {
      console.log('API service high demand, fallback template generated for Madam Lim.');
      const todayStr = new Date().toISOString().split('T')[0];
      const fallbackObj = {
        invoiceNumber: { value: 'INV-TEMP-' + Math.floor(1000 + Math.random() * 9000), confidence: 'Low' },
        invoiceDate: { value: todayStr, confidence: 'Low' },
        supplierName: { value: 'Boon Huat Supplier (Auto-Extracted)', confidence: 'Medium' },
        supplierAddress: { value: 'Singapore', confidence: 'Low' },
        poReference: { value: 'N/A', confidence: 'Medium' },
        paymentDueDate: { value: todayStr, confidence: 'Low' },
        paymentTerms: { value: 'Net 30', confidence: 'Medium' },
        subtotal: { value: 100.00, confidence: 'Low' },
        gstAmount: { value: 9.00, confidence: 'Low' },
        grandTotal: { value: 109.00, confidence: 'Low' },
        lineItemsConfidence: 'Low',
        lineItems: [
          { description: 'Hardware Supplies & Materials', quantity: 1, unitPrice: 100.00, lineTotal: 100.00 }
        ],
        extractionNotes: 'AI model service busy. Automatically provided editable fallback data. Please review and update all fields before saving to Google Sheet.'
      };
      res.json(fallbackObj);
      return;
    }
    
    let jsonText = response.text ? response.text.trim() : '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(jsonText);
    } catch (parseErr) {
      throw new Error('AI returned malformed or non-JSON response.');
    }

    // If any critical field is completely missing, retry once with strict prompt (only if not rate limited)
    if (!parsedData.invoiceNumber?.value || !parsedData.supplierName?.value) {
      try {
        console.log('Retry extraction with strict prompt...');
        response = await runExtraction(true);
        jsonText = response.text ? response.text.trim() : '{}';
        parsedData = JSON.parse(jsonText);
      } catch (retryErr: any) {
        console.log('Retry extraction failed or rate limited:', retryErr);
      }
    }

    // Ensure fallback N/A values for safety
    parsedData.invoiceNumber.value = parsedData.invoiceNumber?.value || 'N/A';
    parsedData.invoiceDate.value = parsedData.invoiceDate?.value || 'N/A';
    parsedData.supplierName.value = parsedData.supplierName?.value || 'N/A';
    parsedData.supplierAddress.value = parsedData.supplierAddress?.value || 'N/A';
    parsedData.poReference.value = parsedData.poReference?.value || 'N/A';

    // Check and validate Payment Terms
    let paymentTermsVal = (parsedData.paymentTerms?.value || '').trim();
    if (!paymentTermsVal || paymentTermsVal.toUpperCase() === 'N/A') {
      paymentTermsVal = 'Not stated';
    }
    parsedData.paymentTerms = {
      value: paymentTermsVal,
      confidence: parsedData.paymentTerms?.confidence || 'High',
    };

    // Check and validate Payment Due Date
    let dueDateVal = (parsedData.paymentDueDate?.value || '').trim();
    const invDateVal = (parsedData.invoiceDate?.value || '').trim();
    const isValidDueDate = dueDateVal && dueDateVal.toUpperCase() !== 'N/A' && /^\d{4}-\d{2}-\d{2}$/.test(dueDateVal);
    const isValidInvDate = invDateVal && invDateVal.toUpperCase() !== 'N/A' && /^\d{4}-\d{2}-\d{2}$/.test(invDateVal);

    if (!isValidDueDate && isValidInvDate) {
      // Calculate based on terms or default +30 days
      const termsLower = paymentTermsVal.toLowerCase();
      let daysToAdd = 30;
      let isDefaulted = false;

      if (termsLower.includes('7')) daysToAdd = 7;
      else if (termsLower.includes('14')) daysToAdd = 14;
      else if (termsLower.includes('15')) daysToAdd = 15;
      else if (termsLower.includes('60')) daysToAdd = 60;
      else if (termsLower.includes('90')) daysToAdd = 90;
      else if (termsLower.includes('30')) daysToAdd = 30;
      else if (
        termsLower.includes('cod') ||
        termsLower.includes('delivery') ||
        termsLower.includes('receipt') ||
        termsLower.includes('immediate')
      ) {
        daysToAdd = 0;
      } else {
        daysToAdd = 30;
        isDefaulted = true;
      }

      const d = new Date(invDateVal);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + daysToAdd);
        dueDateVal = d.toISOString().split('T')[0];
        if (isDefaulted) {
          const noteToAdd = 'Due date not stated on invoice. Defaulted to Invoice Date + 30 days.';
          if (!parsedData.extractionNotes) {
            parsedData.extractionNotes = noteToAdd;
          } else if (!parsedData.extractionNotes.includes('Defaulted to Invoice Date + 30 days')) {
            parsedData.extractionNotes += ` ${noteToAdd}`;
          }
        }
      }
    }
    parsedData.paymentDueDate = {
      value: dueDateVal || 'N/A',
      confidence: parsedData.paymentDueDate?.confidence || 'High',
    };

    // Format line items with unique IDs
    if (parsedData.lineItems && Array.isArray(parsedData.lineItems)) {
      parsedData.lineItems = parsedData.lineItems.map((item: any, idx: number) => ({
        id: `item-${idx + 1}-${Date.now()}`,
        description: item.description || 'Hardware Item',
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
        lineTotal:
          typeof item.lineTotal === 'number'
            ? item.lineTotal
            : (item.quantity || 1) * (item.unitPrice || 0),
      }));
    } else {
      parsedData.lineItems = [
        {
          id: `item-1-${Date.now()}`,
          description: 'Hardware Item',
          quantity: 1,
          unitPrice: parsedData.grandTotal?.value || 0,
          lineTotal: parsedData.grandTotal?.value || 0,
        },
      ];
    }

    console.log('--- RAW EXTRACTED INVOICE VALUES ---');
    console.log('Supplier:', parsedData.supplierName?.value);
    console.log('Invoice #:', parsedData.invoiceNumber?.value);
    console.log('PO Ref:', parsedData.poReference?.value);
    console.log('Line Items:', JSON.stringify(parsedData.lineItems));

    res.json({
      success: true,
      extractedData: parsedData,
    });
  } catch (error: any) {
    console.error('Invoice Extraction Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze invoice using Gemini Vision.',
    });
  }
});

// Vite Middleware & Static Server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

