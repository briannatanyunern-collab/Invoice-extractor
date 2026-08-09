export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface FieldWithConfidence<T> {
  value: T;
  confidence: ConfidenceLevel;
  reason?: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ExtractedInvoiceData {
  invoiceNumber: FieldWithConfidence<string>;
  invoiceDate: FieldWithConfidence<string>;
  supplierName: FieldWithConfidence<string>;
  supplierAddress: FieldWithConfidence<string>;
  poReference: FieldWithConfidence<string>;
  paymentDueDate: FieldWithConfidence<string>;
  paymentTerms: FieldWithConfidence<string>;
  subtotal: FieldWithConfidence<number>;
  gstAmount: FieldWithConfidence<number>;
  grandTotal: FieldWithConfidence<number>;
  lineItems: LineItem[];
  lineItemsConfidence: ConfidenceLevel;
  extractionNotes: string;
}

export interface InvoiceRecord extends ExtractedInvoiceData {
  id: string;
  filename: string;
  fileType: string;
  fileUrl: string; // Base64 or URL
  uploadedAt: string;
  status: 'Pending Review' | 'Verified' | 'Sent to Sheet' | 'Matching Pending';
  sheetSyncedAt?: string;
  sheetRowIndex?: number;
}

export interface SampleInvoice {
  id: string;
  title: string;
  subtitle: string;
  typeBadge: string;
  previewUrl: string;
  mimeType: string;
  base64Data: string;
  sampleData: ExtractedInvoiceData;
}

export interface UserAccount {
  id: string;
  name: string;
  role: string;
  initials: string;
}
