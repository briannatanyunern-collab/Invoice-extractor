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

export interface HeaderIndexMap {
  invoiceNumber: number;
  invoiceDate: number;
  supplierName: number;
  poReference: number;
  lineItemDescription: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  paymentDueDate: number;
  paymentTerms: number;
  extractionConfidence: number;
  extractionNotes: number;
  extractedAt: number;
  status: number;
  supplierAddress: number;
  matchStatus: number;
  dueDate: number;
  extractedBy: number;
}

export const DEFAULT_LEDGER_HEADERS = [
  'Invoice Number',
  'Invoice Date',
  'Supplier Name',
  'PO Reference',
  'Line Item Description',
  'Quantity',
  'Unit Price',
  'Line Total',
  'Subtotal',
  'GST Amount',
  'Grand Total',
  'Extraction Confidence',
  'Extraction Notes',
  'Extracted At',
  'Status',
  'Supplier Address',
  'Payment Due Date',
  'Payment Terms',
  'Match Status',
  'Due Date',
  'Extracted By',
];

/**
 * Helper to check if a string matches YYYY-MM-DD date format strictly.
 */
export function isValidDateFormat(val: any): boolean {
  if (!val) return false;
  const str = val.toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

/**
 * Returns valid YYYY-MM-DD string if valid, or null if missing/corrupted/status word.
 */
export function getValidatedDueDate(val: any): string | null {
  if (!val) return null;
  const str = val.toString().trim();
  if (isValidDateFormat(str)) {
    return str;
  }
  return null;
}

/**
 * Recalculates Payment Due Date based on Invoice Date and Payment Terms.
 * If terms are blank or "Not stated", defaults to Invoice Date + 30 days.
 */
export function recalculateDueDate(invoiceDateStr: string, paymentTermsStr: string): string {
  const invDate = (invoiceDateStr || '').trim();
  let baseDate = new Date(invDate);
  if (isNaN(baseDate.getTime())) {
    baseDate = new Date();
  }

  const terms = (paymentTermsStr || '').trim().toLowerCase();
  let daysToAdd = 30;

  if (/\b90\b|90\s*days?/i.test(terms)) daysToAdd = 90;
  else if (/\b60\b|60\s*days?/i.test(terms)) daysToAdd = 60;
  else if (/\b30\b|30\s*days?/i.test(terms)) daysToAdd = 30;
  else if (/\b15\b|15\s*days?/i.test(terms)) daysToAdd = 15;
  else if (/\b14\b|14\s*days?/i.test(terms)) daysToAdd = 14;
  else if (/\b7\b|7\s*days?/i.test(terms)) daysToAdd = 7;
  else if (
    terms.includes('cod') ||
    terms.includes('cash on delivery') ||
    terms.includes('payable on receipt') ||
    terms.includes('receipt') ||
    terms.includes('immediate')
  ) {
    daysToAdd = 0;
  } else {
    daysToAdd = 30;
  }

  const resultDate = new Date(baseDate.getTime());
  resultDate.setDate(resultDate.getDate() + daysToAdd);

  const yyyy = resultDate.getFullYear();
  const mm = String(resultDate.getMonth() + 1).padStart(2, '0');
  const dd = String(resultDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Helper to safely parse numbers from strings that may contain currency symbols ($), commas, or whitespace.
 */
export function parseCurrencyNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = val.toString().replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses header row (row 1 of Google Sheet) and returns a map of field keys to column indices.
 */
export function buildHeaderMap(headerRow?: string[] | null): HeaderIndexMap {
  // Default indices assuming DEFAULT_LEDGER_HEADERS order
  const map: HeaderIndexMap = {
    invoiceNumber: 0,
    invoiceDate: 1,
    supplierName: 2,
    poReference: 3,
    lineItemDescription: 4,
    quantity: 5,
    unitPrice: 6,
    lineTotal: 7,
    subtotal: 8,
    gstAmount: 9,
    grandTotal: 10,
    extractionConfidence: 11,
    extractionNotes: 12,
    extractedAt: 13,
    status: 14,
    supplierAddress: 15,
    paymentDueDate: 16,
    paymentTerms: 17,
    matchStatus: 18,
    dueDate: 19,
    extractedBy: 20,
  };

  if (!headerRow || !Array.isArray(headerRow) || headerRow.length === 0) {
    return map;
  }

  const foundKeys = new Set<keyof HeaderIndexMap>();

  headerRow.forEach((colName, index) => {
    const raw = (colName || '').toString().trim().toLowerCase();
    if (!raw) return;

    if ((raw.includes('invoice number') || raw.includes('invoice #') || raw === 'inv #') && !foundKeys.has('invoiceNumber')) {
      map.invoiceNumber = index;
      foundKeys.add('invoiceNumber');
    } else if (raw.includes('invoice date') && !foundKeys.has('invoiceDate')) {
      map.invoiceDate = index;
      foundKeys.add('invoiceDate');
    } else if (raw.includes('supplier name') && !foundKeys.has('supplierName')) {
      map.supplierName = index;
      foundKeys.add('supplierName');
    } else if ((raw.includes('supplier address') || raw.includes('address')) && !foundKeys.has('supplierAddress')) {
      map.supplierAddress = index;
      foundKeys.add('supplierAddress');
    } else if ((raw.includes('po ref') || raw.includes('po number') || raw === 'po') && !foundKeys.has('poReference')) {
      map.poReference = index;
      foundKeys.add('poReference');
    } else if ((raw.includes('line item') || raw.includes('description')) && !foundKeys.has('lineItemDescription')) {
      map.lineItemDescription = index;
      foundKeys.add('lineItemDescription');
    } else if ((raw.includes('quantity') || raw === 'qty') && !foundKeys.has('quantity')) {
      map.quantity = index;
      foundKeys.add('quantity');
    } else if (raw.includes('line total') && !foundKeys.has('lineTotal')) {
      map.lineTotal = index;
      foundKeys.add('lineTotal');
    } else if ((raw.includes('unit price') || raw.includes('price')) && !foundKeys.has('unitPrice')) {
      map.unitPrice = index;
      foundKeys.add('unitPrice');
    } else if (raw.includes('subtotal') && !foundKeys.has('subtotal')) {
      map.subtotal = index;
      foundKeys.add('subtotal');
    } else if (raw.includes('gst') && !foundKeys.has('gstAmount')) {
      map.gstAmount = index;
      foundKeys.add('gstAmount');
    } else if (raw.includes('grand total') && !foundKeys.has('grandTotal')) {
      map.grandTotal = index;
      foundKeys.add('grandTotal');
    } else if ((raw === 'due date' || (raw.includes('due date') && !raw.includes('payment'))) && !foundKeys.has('dueDate')) {
      map.dueDate = index;
      foundKeys.add('dueDate');
    } else if ((raw.includes('payment due') || raw.includes('payment due date')) && !foundKeys.has('paymentDueDate')) {
      map.paymentDueDate = index;
      foundKeys.add('paymentDueDate');
    } else if ((raw.includes('terms') || raw.includes('payment terms')) && !foundKeys.has('paymentTerms')) {
      map.paymentTerms = index;
      foundKeys.add('paymentTerms');
    } else if (raw.includes('confidence') && !foundKeys.has('extractionConfidence')) {
      map.extractionConfidence = index;
      foundKeys.add('extractionConfidence');
    } else if (raw.includes('notes') && !foundKeys.has('extractionNotes')) {
      map.extractionNotes = index;
      foundKeys.add('extractionNotes');
    } else if ((raw.includes('extracted at') || raw.includes('timestamp')) && !foundKeys.has('extractedAt')) {
      map.extractedAt = index;
      foundKeys.add('extractedAt');
    } else if ((raw.includes('match status') || raw.includes('match verdict')) && !foundKeys.has('matchStatus')) {
      map.matchStatus = index;
      foundKeys.add('matchStatus');
    } else if (raw.includes('extracted by') && !foundKeys.has('extractedBy')) {
      map.extractedBy = index;
      foundKeys.add('extractedBy');
    } else if (raw.includes('status') && !foundKeys.has('status')) {
      map.status = index;
      foundKeys.add('status');
    }
  });

  return map;
}

/**
 * Builds a single row array to write to Google Sheets matching headerRow column layout.
 */
export function buildRowArray(
  headerRow: string[] | null,
  invoiceData: any,
  item: { description?: string; quantity?: number; unitPrice?: number; lineTotal?: number },
  timestamp: string,
  overallConfidence: string,
  extractedBy: string = ''
): any[] {
  const map = buildHeaderMap(headerRow);
  const maxIdx = Math.max(
    headerRow ? headerRow.length - 1 : 0,
    ...Object.values(map)
  );

  const row = new Array(maxIdx + 1).fill('');

  let rawDueDate = invoiceData.dueDate?.value ?? invoiceData.dueDate ?? invoiceData.paymentDueDate?.value ?? invoiceData.paymentDueDate ?? '';
  if (typeof rawDueDate === 'object' && rawDueDate !== null && 'value' in rawDueDate) {
    rawDueDate = rawDueDate.value;
  }
  rawDueDate = (rawDueDate || '').toString().trim();
  if (rawDueDate === 'N/A') rawDueDate = '';

  let notes = invoiceData.extractionNotes || 'N/A';

  let finalDueDate = '';
  if (rawDueDate) {
    if (isValidDateFormat(rawDueDate)) {
      finalDueDate = rawDueDate;
    } else {
      finalDueDate = '';
      const warningNote = `Attempted to write invalid due date '${rawDueDate}' — write blocked.`;
      if (!notes.includes('Attempted to write invalid due date')) {
        notes = notes && notes !== 'N/A' ? `${notes} ${warningNote}` : warningNote;
      }
    }
  }

  // If finalDueDate is missing, calculate from Payment Terms or Invoice Date
  if (!finalDueDate) {
    const invDateStr = invoiceData.invoiceDate?.value || invoiceData.invoiceDate || '';
    const termsStr = invoiceData.paymentTerms?.value || invoiceData.paymentTerms || '';
    finalDueDate = recalculateDueDate(invDateStr, termsStr);
  }

  row[map.invoiceNumber] = invoiceData.invoiceNumber?.value || 'N/A';
  row[map.invoiceDate] = invoiceData.invoiceDate?.value || 'N/A';
  row[map.supplierName] = invoiceData.supplierName?.value || 'N/A';
  row[map.poReference] = invoiceData.poReference?.value || 'N/A';
  row[map.lineItemDescription] = item.description || 'N/A';
  row[map.quantity] = item.quantity ?? 0;
  row[map.unitPrice] = item.unitPrice ?? 0;
  row[map.lineTotal] = item.lineTotal ?? 0;
  row[map.subtotal] = invoiceData.subtotal?.value ?? 0;
  row[map.gstAmount] = invoiceData.gstAmount?.value ?? 0;
  row[map.grandTotal] = invoiceData.grandTotal?.value ?? 0;
  row[map.paymentTerms] = invoiceData.paymentTerms?.value || 'N/A';

  // Write new payment due date value into the new "Due Date" column instead of "Payment Due Date"
  if (map.dueDate !== undefined && map.dueDate >= 0) {
    row[map.dueDate] = finalDueDate;
    if (map.paymentDueDate !== undefined && map.paymentDueDate >= 0) {
      row[map.paymentDueDate] = '';
    }
  } else if (map.paymentDueDate !== undefined && map.paymentDueDate >= 0) {
    row[map.paymentDueDate] = finalDueDate;
  }

  row[map.extractionConfidence] = overallConfidence;
  row[map.extractionNotes] = notes;
  row[map.extractedAt] = timestamp;
  row[map.status] = 'Pending Match';
  row[map.supplierAddress] = invoiceData.supplierAddress?.value || 'N/A';
  if (map.matchStatus !== undefined && map.matchStatus >= 0) {
    row[map.matchStatus] = '';
  }

  if (map.extractedBy !== undefined && map.extractedBy >= 0) {
    row[map.extractedBy] = extractedBy;
  }
  return row;
}
