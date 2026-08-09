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

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Building,
  Calendar,
  Layers,
  Sparkles,
  RotateCcw,
  X,
  Wrench
} from 'lucide-react';
import { ExtractedInvoiceData, LineItem } from '../types';
import { ExtractionForm } from './ExtractionForm';
import { buildHeaderMap, parseCurrencyNumber, getValidatedDueDate, recalculateDueDate, isValidDateFormat } from '../lib/sheetColumnMap';
import { StatusBadge, MatchLogStatusEntry } from './StatusBadge';
import { DueDateDisplay } from './DueDateDisplay';

export interface ActionLogItem {
  id: string;
  timestamp: string;
  description: string;
  type: 'delete' | 'edit' | 'add' | 'replace';
  user?: string;
}

interface InvoiceGroup {
  invoiceNumber: string;
  invoiceDate: string;
  supplierName: string;
  supplierAddress: string;
  poReference: string;
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  hasGrandTotal: boolean;
  paymentDueDate: string;
  paymentTerms: string;
  extractionConfidence: string;
  extractionNotes: string;
  extractedAt: string;
  status: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  totalRows: number;
}

interface ManageLedgerViewProps {
  rawRows: any[][];
  headerRow?: string[] | null;
  googleAccessToken: string | null;
  onRefresh: () => void | Promise<void>;
  isRefreshing?: boolean;
  lastSyncedTime?: string | null;
  actionHistory: ActionLogItem[];
  onAddActionLog: (log: Omit<ActionLogItem, 'id' | 'user'>) => void;
  onConnectSheetsClick?: () => void;
  matchLogMap: Record<string, MatchLogStatusEntry>;
}

export const ManageLedgerView: React.FC<ManageLedgerViewProps> = ({
  rawRows,
  headerRow,
  googleAccessToken,
  onRefresh,
  isRefreshing = false,
  lastSyncedTime,
  actionHistory,
  onAddActionLog,
  onConnectSheetsClick,
  matchLogMap,
}) => {
  // State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});
  const [deletingGroup, setDeletingGroup] = useState<InvoiceGroup | null>(null);
  const [editingGroup, setEditingGroup] = useState<InvoiceGroup | null>(null);
  const [showManualAddModal, setShowManualAddModal] = useState<boolean>(false);
  const [manualDuplicateData, setManualDuplicateData] = useState<{
    newData: ExtractedInvoiceData;
    existingGroup: InvoiceGroup;
  } | null>(null);
  const [isReplacingManual, setIsReplacingManual] = useState<boolean>(false);

  // Multi-select bulk delete state
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false);
  const [confirmDeleteInput, setConfirmDeleteInput] = useState<string>('');

  // 10-second Undo State
  const [undoState, setUndoState] = useState<{
    rows: any[][];
    deletedCount: number;
    rowCount: number;
  } | null>(null);
  const [undoCountdown, setUndoCountdown] = useState<number>(10);
  const [isRestoringUndo, setIsRestoringUndo] = useState<boolean>(false);

  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const [repairModalResult, setRepairModalResult] = useState<{ repairedCount: number; message: string } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Undo countdown timer effect
  useEffect(() => {
    let timer: any;
    if (undoState && undoCountdown > 0) {
      timer = setInterval(() => {
        setUndoCountdown((prev) => {
          if (prev <= 1) {
            setUndoState(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [undoState, undoCountdown]);

  const headerMap = useMemo(() => buildHeaderMap(headerRow), [headerRow]);

  // Group raw rows into structured InvoiceGroups
  const invoiceGroups = useMemo(() => {
    const map = new Map<string, InvoiceGroup>();

    rawRows.forEach((row) => {
      const invNum = (row[headerMap.invoiceNumber] || 'UNSPECIFIED').toString().trim();
      const invDate = (row[headerMap.invoiceDate] || 'N/A').toString();
      const supName = (row[headerMap.supplierName] || 'N/A').toString();
      const supAddr = (row[headerMap.supplierAddress] || 'N/A').toString();
      const poRef = (row[headerMap.poReference] || 'N/A').toString();
      const itemDesc = (row[headerMap.lineItemDescription] || 'N/A').toString();
      const qty = parseCurrencyNumber(row[headerMap.quantity]);
      const uPrice = parseCurrencyNumber(row[headerMap.unitPrice]);
      const lTotal = parseCurrencyNumber(row[headerMap.lineTotal]);
      const sub = parseCurrencyNumber(row[headerMap.subtotal]);
      const gst = parseCurrencyNumber(row[headerMap.gstAmount]);
      const rawGrandVal = row[headerMap.grandTotal];
      const rawGrandStr = rawGrandVal !== undefined && rawGrandVal !== null ? rawGrandVal.toString().trim() : '';
      const grand = parseCurrencyNumber(rawGrandVal);
      const rowHasGrand = rawGrandStr !== '' && rawGrandStr !== '—';

      const due = (row[headerMap.dueDate] || row[headerMap.paymentDueDate] || 'N/A').toString();
      const terms = (row[headerMap.paymentTerms] || 'N/A').toString();
      const conf = (row[headerMap.extractionConfidence] || 'High').toString();
      const notes = (row[headerMap.extractionNotes] || 'N/A').toString();
      const extAt = (row[headerMap.extractedAt] || '').toString();
      const stat = (row[headerMap.status] || 'Pending Match').toString();

      if (!map.has(invNum)) {
        map.set(invNum, {
          invoiceNumber: invNum,
          invoiceDate: invDate,
          supplierName: supName,
          supplierAddress: supAddr,
          poReference: poRef,
          subtotal: sub,
          gstAmount: gst,
          grandTotal: grand,
          hasGrandTotal: rowHasGrand,
          paymentDueDate: due,
          paymentTerms: terms,
          extractionConfidence: conf,
          extractionNotes: notes,
          extractedAt: extAt,
          status: stat,
          lineItems: [],
          totalRows: 0,
        });
      } else {
        const existingGroup = map.get(invNum)!;
        if (rowHasGrand && !existingGroup.hasGrandTotal) {
          existingGroup.hasGrandTotal = true;
          existingGroup.grandTotal = grand;
        }
      }

      const group = map.get(invNum)!;
      group.lineItems.push({
        description: itemDesc,
        quantity: qty,
        unitPrice: uPrice,
        lineTotal: lTotal,
      });
      group.totalRows += 1;
    });

    return Array.from(map.values());
  }, [rawRows, headerMap]);

  // Filtered invoice groups based on search box (live search)
  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return invoiceGroups;
    const q = searchTerm.toLowerCase().trim();
    return invoiceGroups.filter(
      (g) =>
        g.invoiceNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q)
    );
  }, [invoiceGroups, searchTerm]);

  const totalRowsCount = rawRows.length;

  // Multi-select helpers
  const allVisibleInvoiceNumbers = useMemo(
    () => filteredGroups.map((g) => g.invoiceNumber),
    [filteredGroups]
  );

  const isAllSelected =
    allVisibleInvoiceNumbers.length > 0 &&
    allVisibleInvoiceNumbers.every((inv) => selectedInvoices.includes(inv));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices([...allVisibleInvoiceNumbers]);
    }
  };

  const handleToggleSelectInvoice = (invNum: string) => {
    if (selectedInvoices.includes(invNum)) {
      setSelectedInvoices(selectedInvoices.filter((i) => i !== invNum));
    } else {
      setSelectedInvoices([...selectedInvoices, invNum]);
    }
  };

  // Selected details for bulk delete modal
  const selectedGroupDetails = useMemo(() => {
    return selectedInvoices.map((inv) => {
      const g = filteredGroups.find((group) => group.invoiceNumber === inv);
      return {
        invoiceNumber: inv,
        supplierName: g?.supplierName || 'Unknown Supplier',
      };
    });
  }, [selectedInvoices, filteredGroups]);

  const handleConfirmBulkDelete = async () => {
    if (selectedInvoices.length === 0 || selectedInvoices.length > 20) return;
    if (selectedInvoices.length > 5 && confirmDeleteInput.trim() !== 'DELETE') return;

    setIsDeleting(true);

    try {
      const res = await fetch('/api/sheets/batch-delete-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          invoiceNumbers: selectedInvoices,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.connectionLost) {
        throw new Error(data.error || 'Failed to bulk delete invoices from Google Sheet.');
      }

      const deletedCount = data.deletedInvoiceCount || selectedInvoices.length;
      const deletedRows = data.deletedRowCount || 0;
      const deletedRowsData = data.deletedRowsData || [];

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      onAddActionLog({
        timestamp: nowStr,
        description: `Bulk deleted ${deletedCount} invoice(s) (${deletedRows} rows)`,
        type: 'delete',
      });

      // Set 10-second undo state
      if (deletedRowsData.length > 0) {
        setUndoState({
          rows: deletedRowsData,
          deletedCount,
          rowCount: deletedRows,
        });
        setUndoCountdown(10);
      } else {
        triggerToast(`Bulk deleted ${deletedCount} invoice(s) (${deletedRows} rows).`);
      }

      setSelectedInvoices([]);
      setShowBulkDeleteModal(false);
      setConfirmDeleteInput('');
      await onRefresh();
    } catch (err: any) {
      alert(`Bulk Delete Error: ${err.message || 'Could not delete selected invoices.'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUndoBulkDelete = async () => {
    if (!undoState || isRestoringUndo) return;
    setIsRestoringUndo(true);

    try {
      const res = await fetch('/api/sheets/restore-rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          rows: undoState.rows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore deleted rows.');
      }

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      onAddActionLog({
        timestamp: nowStr,
        description: `Undid delete: Restored ${undoState.deletedCount} invoice(s) (${undoState.rowCount} rows)`,
        type: 'add',
      });

      triggerToast(`Successfully restored ${undoState.deletedCount} invoice(s) (${undoState.rowCount} rows) to Google Sheet.`);
      setUndoState(null);
      await onRefresh();
    } catch (err: any) {
      alert(`Undo Error: ${err.message || 'Could not restore rows.'}`);
    } finally {
      setIsRestoringUndo(false);
    }
  };

  const toggleExpand = (invNum: string) => {
    setExpandedInvoices((prev) => ({ ...prev, [invNum]: !prev[invNum] }));
  };

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 6000);
  };

  // 1. DELETE FLOW
  const handleConfirmDelete = async () => {
    if (!deletingGroup) return;
    setIsDeleting(true);

    try {
      const res = await fetch('/api/sheets/delete-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          invoiceNumber: deletingGroup.invoiceNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.connectionLost) {
        throw new Error(data.error || 'Failed to delete rows from Google Sheet.');
      }

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      onAddActionLog({
        timestamp: nowStr,
        description: `Deleted ${deletingGroup.totalRows} rows for ${deletingGroup.invoiceNumber} (${deletingGroup.supplierName})`,
        type: 'delete',
      });

      triggerToast(`Deleted ${deletingGroup.totalRows} rows for ${deletingGroup.invoiceNumber}.`);
      setDeletingGroup(null);
      await onRefresh();
    } catch (err: any) {
      alert(`Delete Error: ${err.message || 'Could not delete row.'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Repair Due Dates Flow (Fix 3)
  const handleRepairDueDates = async () => {
    if (!googleAccessToken) return;
    setIsRepairing(true);

    try {
      const res = await fetch('/api/sheets/repair-due-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: googleAccessToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to repair due dates.');
      }

      setRepairModalResult({
        repairedCount: data.repairedCount || 0,
        message: data.message || `Repaired ${data.repairedCount || 0} rows.`,
      });

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      onAddActionLog({
        timestamp: nowStr,
        description: `Triggered Repair Due Dates: Repaired ${data.repairedCount || 0} row(s)`,
        type: 'edit',
      });

      await onRefresh();
    } catch (err: any) {
      alert(`Repair Error: ${err.message || 'Could not repair due dates.'}`);
    } finally {
      setIsRepairing(false);
    }
  };

  // Get Edit Form Warning Banner Message (Fix 4)
  const getDueDateWarningMessage = (group: InvoiceGroup): string | null => {
    const validDate = getValidatedDueDate(group.paymentDueDate);
    const notes = group.extractionNotes || '';

    // Check if notes indicate it was repaired or recovered
    const repairMatch = notes.match(/Payment Due Date (repaired|recovered) on (\d{4}-\d{2}-\d{2})/i);
    if (repairMatch) {
      const repairedOnDate = repairMatch[2];
      return `⚠ This invoice's Payment Due Date was repaired on ${repairedOnDate}. The current value is a calculated default. If you have the original invoice, please verify the correct due date and update it below.`;
    }

    if (!validDate) {
      return `⚠ This invoice's Payment Due Date was missing. The current value is a calculated default. If you have the original invoice, please verify the correct due date and update it below.`;
    }

    return null;
  };

  // Convert InvoiceGroup to ExtractedInvoiceData for ExtractionForm
  const groupToFormData = (group: InvoiceGroup): ExtractedInvoiceData => {
    let dueDateVal = group.paymentDueDate;
    if (!isValidDateFormat(dueDateVal)) {
      dueDateVal = recalculateDueDate(group.invoiceDate, group.paymentTerms);
    }

    return {
      invoiceNumber: { value: group.invoiceNumber, confidence: (group.extractionConfidence as any) || 'High' },
      invoiceDate: { value: group.invoiceDate, confidence: (group.extractionConfidence as any) || 'High' },
      supplierName: { value: group.supplierName, confidence: (group.extractionConfidence as any) || 'High' },
      supplierAddress: { value: group.supplierAddress, confidence: (group.extractionConfidence as any) || 'High' },
      poReference: { value: group.poReference, confidence: (group.extractionConfidence as any) || 'High' },
      subtotal: { value: group.subtotal, confidence: (group.extractionConfidence as any) || 'High' },
      gstAmount: { value: group.gstAmount, confidence: (group.extractionConfidence as any) || 'High' },
      grandTotal: { value: group.grandTotal, confidence: (group.extractionConfidence as any) || 'High' },
      paymentDueDate: { value: dueDateVal, confidence: (group.extractionConfidence as any) || 'High' },
      paymentTerms: { value: group.paymentTerms, confidence: (group.extractionConfidence as any) || 'High' },
      lineItemsConfidence: (group.extractionConfidence as any) || 'High',
      lineItems: group.lineItems.map((item, idx) => ({
        id: `item-${idx}-${Date.now()}`,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      extractionNotes: group.extractionNotes,
    };
  };

  // Create Blank Form Data for Manual Add
  const getBlankFormData = (): ExtractedInvoiceData => {
    const today = new Date().toISOString().split('T')[0];
    return {
      invoiceNumber: { value: '', confidence: 'High' },
      invoiceDate: { value: today, confidence: 'High' },
      supplierName: { value: '', confidence: 'High' },
      supplierAddress: { value: '', confidence: 'High' },
      poReference: { value: '', confidence: 'High' },
      subtotal: { value: 0, confidence: 'High' },
      gstAmount: { value: 0, confidence: 'High' },
      grandTotal: { value: 0, confidence: 'High' },
      paymentDueDate: { value: '', confidence: 'High' },
      paymentTerms: { value: 'Net 30', confidence: 'High' },
      lineItemsConfidence: 'High',
      lineItems: [
        {
          id: `item-1-${Date.now()}`,
          description: '',
          quantity: 1,
          unitPrice: 0,
          lineTotal: 0,
        },
      ],
      extractionNotes: 'Manually entered (no source document).',
    };
  };

  // 2. EDIT SAVE FLOW
  const handleSaveEdit = async (updatedData: ExtractedInvoiceData) => {
    if (!editingGroup) return;
    setIsSavingEdit(true);

    try {
      const dateStr = new Date().toLocaleDateString('en-SG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const appendedNotes = updatedData.extractionNotes
        ? `${updatedData.extractionNotes}\nManually edited on ${dateStr}.`
        : `Manually edited on ${dateStr}.`;

      const payload = {
        ...updatedData,
        extractionNotes: appendedNotes,
      };

      const res = await fetch('/api/sheets/replace-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          targetInvoiceNumber: editingGroup.invoiceNumber,
          invoiceData: payload,
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.connectionLost) {
        throw new Error(resData.error || 'Failed to update rows in Google Sheet.');
      }

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      const grandOld = editingGroup.grandTotal;
      const grandNew = payload.grandTotal.value;

      onAddActionLog({
        timestamp: nowStr,
        description: `Edited ${editingGroup.invoiceNumber} (updated Grand Total: $${grandOld.toFixed(2)} → $${grandNew.toFixed(2)})`,
        type: 'edit',
      });

      triggerToast(`Saved changes for invoice ${payload.invoiceNumber.value}.`);
      setEditingGroup(null);
      await onRefresh();
    } catch (err: any) {
      alert(`Edit Error: ${err.message || 'Could not save edit changes.'}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 3. MANUAL ADD SAVE FLOW
  const handleSaveManualAdd = async (newData: ExtractedInvoiceData) => {
    setIsSavingManual(true);
    const newInv = (newData.invoiceNumber?.value || '').toString();
    const newSup = (newData.supplierName?.value || '').toString();
    
    const normalizeStr = (str: any): string => {
      if (str === null || str === undefined) return '';
      return str.toString().toLowerCase().trim().replace(/\s+/g, ' ');
    };

    const normalisedNew = {
      inv: normalizeStr(newInv),
      sup: normalizeStr(newSup),
    };

    // Live fresh read from Google Sheets before writing manual entry
    if (googleAccessToken && normalisedNew.inv && normalisedNew.sup) {
      try {
        const freshRes = await fetch('/api/sheets/get-ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: googleAccessToken }),
        });
        const freshData = await freshRes.json();
        if (freshRes.ok && freshData.rawRows && Array.isArray(freshData.rawRows)) {
          const freshRows: any[][] = freshData.rawRows;
          const freshHeader: string[] = freshData.headerRow || [];
          const hMap = buildHeaderMap(freshHeader);

          console.log('Checking for duplicate:', normalisedNew, 'against', freshRows.length, 'existing rows');

          if (hMap.invoiceNumber !== undefined && hMap.supplierName !== undefined) {
            const existingRow = freshRows.find(row => {
              if (!row || !Array.isArray(row)) return false;
              const rowInv = normalizeStr(row[hMap.invoiceNumber]);
              const rowSup = normalizeStr(row[hMap.supplierName]);
              return rowInv && rowSup && rowInv === normalisedNew.inv && rowSup === normalisedNew.sup;
            });

            if (existingRow) {
              console.log(`DUPLICATE MATCH DETECTED in manual add! Invoice "${normalisedNew.inv}" from Supplier "${normalisedNew.sup}". Halting write.`);
              const invNumFromRow = existingRow[hMap.invoiceNumber] || newInv;
              const supNameFromRow = existingRow[hMap.supplierName] || newSup;
              const extAt = hMap.extractedAt !== undefined ? existingRow[hMap.extractedAt] : '';
              const gTot = hMap.grandTotal !== undefined ? parseCurrencyNumber(existingRow[hMap.grandTotal]) : 0;

              const existingGroupDummy: any = {
                invoiceNumber: invNumFromRow,
                supplierName: supNameFromRow,
                extractedAt: extAt || 'N/A',
                grandTotal: gTot,
                status: 'Pending Match',
                totalRows: 1,
              };
              setManualDuplicateData({ newData, existingGroup: existingGroupDummy });
              setIsSavingManual(false);
              return; // HALT WRITE
            }
          }
        }
      } catch (err) {
        console.warn('Manual add live duplicate check error:', err);
      }
    }

    try {
      const res = await fetch('/api/sheets/append-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          invoiceData: newData,
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.connectionLost) {
        throw new Error(resData.error || 'Failed to append manual invoice to Google Sheet.');
      }

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      onAddActionLog({
        timestamp: nowStr,
        description: `Manually added ${newData.invoiceNumber.value || 'N/A'} (${newData.supplierName.value || 'N/A'})`,
        type: 'add',
      });

      triggerToast(`Manually added invoice ${newData.invoiceNumber.value} to Invoice Ledger.`);
      setShowManualAddModal(false);
      await onRefresh();
    } catch (err: any) {
      alert(`Manual Add Error: ${err.message || 'Could not add invoice.'}`);
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleReplaceManualDuplicate = async () => {
    if (!manualDuplicateData) return;
    setIsReplacingManual(true);

    try {
      const { newData, existingGroup } = manualDuplicateData;
      const res = await fetch('/api/sheets/replace-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          targetInvoiceNumber: existingGroup.invoiceNumber,
          invoiceData: newData,
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.connectionLost) {
        throw new Error(resData.error || 'Failed to replace duplicate invoice in Google Sheet.');
      }

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      onAddActionLog({
        timestamp: nowStr,
        description: `Replaced duplicate invoice ${existingGroup.invoiceNumber} (${newData.supplierName.value}) via manual entry`,
        type: 'replace',
      });

      triggerToast(`Successfully replaced existing rows for invoice ${existingGroup.invoiceNumber}!`);
      setManualDuplicateData(null);
      setShowManualAddModal(false);
      await onRefresh();
    } catch (err: any) {
      alert(`Replace Error: ${err.message || 'Could not replace duplicate invoice.'}`);
    } finally {
      setIsReplacingManual(false);
    }
  };

  const handleAppendManualDuplicate = async () => {
    if (!manualDuplicateData) return;
    setIsReplacingManual(true);

    try {
      const { newData } = manualDuplicateData;
      const res = await fetch('/api/sheets/append-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          invoiceData: newData,
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.connectionLost) {
        throw new Error(resData.error || 'Failed to append duplicate invoice to Google Sheet.');
      }

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      onAddActionLog({
        timestamp: nowStr,
        description: `Appended duplicate invoice ${newData.invoiceNumber.value} (${newData.supplierName.value}) via manual entry`,
        type: 'add',
      });

      triggerToast(`Manually added duplicate invoice ${newData.invoiceNumber.value} to Invoice Ledger.`);
      setManualDuplicateData(null);
      setShowManualAddModal(false);
      await onRefresh();
    } catch (err: any) {
      alert(`Append Error: ${err.message || 'Could not append duplicate invoice.'}`);
    } finally {
      setIsReplacingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-sage-800 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn border border-sage-600">
          <CheckCircle2 className="w-5 h-5 text-sage-300 shrink-0" />
          <p className="text-xs font-bold tracking-wide">{notification}</p>
          <button
            onClick={() => setNotification(null)}
            className="text-white/70 hover:text-white ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 10-Second Undo Toast */}
      {undoState && (
        <div className="fixed bottom-6 right-6 z-50 bg-charcoal-900 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-fadeIn border-2 border-sage-500">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <p className="font-extrabold text-white text-sm">
                Deleted {undoState.deletedCount} invoice(s) ({undoState.rowCount} rows)
              </p>
              <p className="text-[11px] text-sand-300 font-mono mt-0.5">
                Undo option expires in {undoCountdown}s
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUndoBulkDelete}
            disabled={isRestoringUndo}
            className="px-4 py-2 bg-sage-500 hover:bg-sage-600 active:bg-sage-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRestoringUndo ? 'animate-spin' : ''}`} />
            <span>{isRestoringUndo ? 'Restoring...' : 'Undo'}</span>
          </button>
          <button
            type="button"
            onClick={() => setUndoState(null)}
            className="text-charcoal-400 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* IMPORTANT NOTICE BANNER AT TOP */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-amber-950 shadow-xs flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <p className="font-bold text-amber-950 text-sm">
            Manage Invoice Ledger (Direct Sheet Management)
          </p>
          <p className="text-amber-900 font-medium leading-relaxed">
            ℹ This view manages the <strong className="font-extrabold text-amber-950">invoices tab only</strong> (Google Sheet: <em>Boon Huat AP Master Data &rarr; Invoice Ledger</em>). Rows in <strong>AP_Approved</strong> or <strong>AP_Exceptions</strong> (written by App 2) are not affected by changes here.
          </p>
        </div>
      </div>

      {/* TOP CONTROLS BAR */}
      <div className="bg-white border border-sand-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Box */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-charcoal-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Invoice Number or Supplier Name..."
            className="w-full pl-10 pr-9 py-2.5 bg-sand-50 border border-sand-300 rounded-xl text-xs font-medium text-charcoal-900 placeholder:text-charcoal-400 focus:bg-white focus:ring-2 focus:ring-sage-500 focus:outline-none transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-charcoal-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Multi-Select & Refresh & Manual Add */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="flex items-center gap-1.5 px-3 py-2 bg-cream-100 border border-sand-200 rounded-xl text-xs font-bold text-charcoal-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 text-sage-600 border-sand-300 rounded focus:ring-sage-500 cursor-pointer"
            />
            <span>Select All</span>
          </label>

          <span className="text-xs font-bold text-charcoal-700">
            Selected: {selectedInvoices.length} of {allVisibleInvoiceNumbers.length}
          </span>

          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteInput('');
                setShowBulkDeleteModal(true);
              }}
              disabled={selectedInvoices.length === 0 || selectedInvoices.length > 20}
              className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedInvoices.length > 0 && selectedInvoices.length <= 20
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                  : 'bg-sand-200 text-charcoal-400 cursor-not-allowed opacity-60'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>

          {selectedInvoices.length > 20 && (
            <div className="w-full text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Maximum 20 invoices per bulk delete. Deselect some, or delete individually.</span>
            </div>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-3 py-2 bg-cream-100 hover:bg-sand-200 text-charcoal-800 border border-sand-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sage-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : '🔄 Refresh from Sheet'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRepairDueDates}
            disabled={isRepairing}
            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Scan ledger for missing or corrupted due dates and repair them using payment terms or default rules"
          >
            <Wrench className={`w-3.5 h-3.5 text-amber-700 ${isRepairing ? 'animate-spin' : ''}`} />
            <span>{isRepairing ? 'Repairing Due Dates...' : '🛠️ Repair Due Dates'}</span>
          </button>

          {lastSyncedTime && (
            <span className="text-[11px] font-mono font-medium text-charcoal-500 bg-sand-100 px-2.5 py-1.5 rounded-lg border border-sand-200">
              Last refreshed: {lastSyncedTime}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowManualAddModal(true)}
            className="px-4 py-2 bg-sage-600 hover:bg-sage-700 active:bg-sage-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Invoice</span>
          </button>
        </div>
      </div>

      {/* INVOICE GROUPS LIST */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="bg-white border border-sand-200 rounded-2xl p-12 text-center text-charcoal-500 space-y-3">
            <FileSpreadsheet className="w-12 h-12 text-sand-400 mx-auto" />
            <h3 className="text-base font-bold text-charcoal-800">No Invoices Found</h3>
            <p className="text-xs max-w-sm mx-auto">
              {searchTerm
                ? `No invoices match "${searchTerm}". Try adjusting your search query.`
                : 'No invoice rows present in the Invoice Ledger tab yet.'}
            </p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isExpanded = !!expandedInvoices[group.invoiceNumber];
            const isChecked = selectedInvoices.includes(group.invoiceNumber);

            return (
              <div
                key={group.invoiceNumber}
                className={`bg-white border rounded-2xl shadow-2xs overflow-hidden transition-all ${
                  isChecked ? 'border-amber-400 bg-amber-50/20' : 'border-sand-200 hover:border-sand-300'
                }`}
              >
                {/* Group Summary Row */}
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleSelectInvoice(group.invoiceNumber)}
                      className="w-4 h-4 text-sage-600 border-sand-300 rounded focus:ring-sage-500 cursor-pointer"
                    />
                  </div>

                  {/* Left Metadata */}
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
                    {/* Inv # & Supplier */}
                    <div className="col-span-2 sm:col-span-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-black text-sage-900 bg-sage-50 px-2.5 py-1 rounded-md border border-sage-200">
                          {group.invoiceNumber}
                        </span>
                        <span className="text-[10px] bg-sand-100 text-charcoal-700 px-2 py-0.5 rounded-full font-bold">
                          {group.totalRows} line {group.totalRows === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <p className="text-sm font-extrabold text-charcoal-900 pt-1 line-clamp-1">
                        {group.supplierName}
                      </p>
                    </div>

                    {/* Dates */}
                    <div className="space-y-0.5 text-xs text-charcoal-600">
                      <p className="flex items-center gap-1.5 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-charcoal-400" />
                        <span>Date: <strong>{group.invoiceDate}</strong></span>
                      </p>
                      <p className="flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-charcoal-400" />
                        <span>Due Date: <DueDateDisplay dateVal={group.paymentDueDate} /></span>
                      </p>
                    </div>

                    {/* Total */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-charcoal-500">Grand Total</p>
                      {group.hasGrandTotal ? (
                        <p className="text-lg font-mono font-black text-sage-900">
                          ${group.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      ) : (
                        <p className="text-lg font-mono font-black text-amber-700 flex items-center gap-1">
                          <span>—</span>
                          <span className="text-[10px] text-amber-600 font-sans font-semibold">(value missing)</span>
                        </p>
                      )}
                      <p className="text-[10px] text-charcoal-400 font-sans">from Invoice Ledger</p>
                    </div>

                    {/* Status & Extracted At */}
                    <div className="space-y-0.5">
                      <StatusBadge invoiceNumber={group.invoiceNumber} matchLogMap={matchLogMap} />
                      <p className="text-[10px] text-charcoal-400 font-sans">from Match Log &rarr; Status</p>
                      {group.extractedAt && (
                        <p className="text-[10px] text-charcoal-500 flex items-center gap-1 pt-0.5">
                          <Clock className="w-3 h-3 text-charcoal-400" />
                          <span>{group.extractedAt.slice(0, 16)}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-sand-100 shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.invoiceNumber)}
                      className="px-3 py-1.5 bg-sand-100 hover:bg-sand-200 text-charcoal-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="View line items table"
                    >
                      <Eye className="w-3.5 h-3.5 text-charcoal-600" />
                      <span>{isExpanded ? 'Hide' : 'View'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingGroup(group)}
                      className="px-3 py-1.5 bg-sage-50 hover:bg-sage-100 border border-sage-200 text-sage-900 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Edit invoice details"
                    >
                      <Edit className="w-3.5 h-3.5 text-sage-700" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingGroup(group)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Delete duplicate or erroneous rows"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Line Items Table */}
                {isExpanded && (
                  <div className="border-t border-sand-200 bg-sand-50/70 p-4 space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs font-bold text-charcoal-700">
                      <span>Line Items breakdown ({group.lineItems.length}):</span>
                      <span className="text-[11px] text-charcoal-500 font-mono">PO Ref: {group.poReference}</span>
                    </div>

                    <div className="overflow-x-auto border border-sand-200 rounded-xl bg-white shadow-2xs">
                      <table className="w-full text-left text-xs text-charcoal-800 border-collapse">
                        <thead>
                          <tr className="bg-sand-100 text-charcoal-700 uppercase font-bold text-[10px] border-b border-sand-200">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Item Description</th>
                            <th className="py-2.5 px-3 text-right">Qty</th>
                            <th className="py-2.5 px-3 text-right">Unit Price</th>
                            <th className="py-2.5 px-3 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-sand-100">
                          {group.lineItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-sand-50/80">
                              <td className="py-2.5 px-3 text-charcoal-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-medium text-charcoal-900">{item.description}</td>
                              <td className="py-2.5 px-3 text-right font-mono">{item.quantity}</td>
                              <td className="py-2.5 px-3 text-right font-mono">${item.unitPrice.toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-sage-900">
                                ${item.lineTotal.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-sand-50 font-bold border-t border-sand-200 text-[11px]">
                          <tr>
                            <td colSpan={3} className="py-2 px-3 text-charcoal-500">
                              Notes: {group.extractionNotes}
                            </td>
                            <td className="py-2 px-3 text-right text-charcoal-600">Subtotal: ${group.subtotal.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right text-sage-900 font-mono font-extrabold">
                              Grand: ${group.grandTotal.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ACTION HISTORY AUDIT TRAIL PANEL */}
      <div className="bg-white border border-sand-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-sand-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-sage-600" />
            <h3 className="text-sm font-bold text-charcoal-900 uppercase tracking-wider">
              Action History (Audit Trail for Madam Lim)
            </h3>
          </div>
          <span className="text-xs text-charcoal-500 font-medium">
            Showing last {actionHistory.length} session actions
          </span>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {actionHistory.length === 0 ? (
            <p className="text-xs text-charcoal-500 italic py-2">
              No actions logged yet in this session.
            </p>
          ) : (
            actionHistory.map((log) => (
              <div
                key={log.id}
                className="p-2.5 bg-sand-50 border border-sand-200 rounded-xl flex items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-charcoal-500">[{log.timestamp}]</span>
                  <span className="text-charcoal-900 font-sans font-medium">{log.description}</span>
                  {log.user && (
                    <span className="ml-2 px-1.5 py-0.5 bg-sand-200 text-charcoal-700 text-[9px] rounded uppercase font-bold tracking-wider">
                      {log.user}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                    log.type === 'delete'
                      ? 'bg-rose-100 text-rose-800'
                      : log.type === 'edit'
                      ? 'bg-amber-100 text-amber-800'
                      : log.type === 'add'
                      ? 'bg-sage-100 text-sage-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {log.type}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* BULK DELETE CONFIRMATION DIALOG MODAL */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border-2 border-rose-500 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-3 text-rose-900 shrink-0">
              <div className="w-11 h-11 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-charcoal-900">
                  Delete {selectedInvoices.length} Invoice(s)?
                </h3>
                <p className="text-xs text-charcoal-600 font-medium">Bulk Delete Confirmation</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-3 overflow-y-auto flex-1">
              {selectedInvoices.length > 20 ? (
                <div className="p-3 bg-rose-100 border border-rose-300 text-rose-900 rounded-xl text-xs font-bold flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-rose-700 mt-0.5" />
                  <div>
                    <p className="text-sm font-extrabold">Maximum 20 Invoices Limit Exceeded</p>
                    <p className="font-normal text-rose-800 mt-0.5">
                      You have selected {selectedInvoices.length} invoices. Maximum 20 invoices per bulk delete. Please close this dialog and deselect some invoices, or delete them individually.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-bold text-rose-900 text-sm">
                    Are you sure you want to delete these {selectedInvoices.length} invoice(s) from the Invoice Ledger?
                  </p>
                  <p className="font-medium text-charcoal-800">
                    Full list of target Invoice Numbers &amp; Suppliers ({selectedGroupDetails.length}):
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1 bg-white p-3 rounded-lg border border-rose-200 font-mono text-xs text-charcoal-800">
                    {selectedGroupDetails.map((det, i) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-sand-100 last:border-b-0">
                        <div className="flex items-center gap-2">
                          <span className="text-rose-600 font-bold">&bull;</span>
                          <strong className="text-charcoal-900">{det.invoiceNumber}</strong>
                        </div>
                        <span className="text-charcoal-500 font-sans text-[11px] truncate max-w-[200px]">{det.supplierName}</span>
                      </div>
                    ))}
                  </div>

                  {/* Verification Input for > 5 Invoices */}
                  {selectedInvoices.length > 5 && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                      <p className="text-xs font-bold text-amber-950">
                        🛡 Safety Safeguard: Deleting {selectedInvoices.length} invoices
                      </p>
                      <p className="text-[11px] text-amber-900 font-medium leading-normal">
                        To activate the delete button, please type <strong className="font-mono text-rose-700 bg-white px-1.5 py-0.5 border border-amber-300 rounded font-black">DELETE</strong> below:
                      </p>
                      <input
                        type="text"
                        value={confirmDeleteInput}
                        onChange={(e) => setConfirmDeleteInput(e.target.value)}
                        placeholder="Type DELETE here..."
                        className="w-full px-3 py-2 bg-white border border-amber-400 rounded-lg text-xs font-mono font-bold text-charcoal-900 uppercase tracking-wider focus:ring-2 focus:ring-rose-500 focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-[11px] text-amber-900 font-medium flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Warning:</strong> Rows already flowed to AP_Approved or AP_Exceptions in App 2 will <strong>NOT</strong> be removed from those tabs.
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 shrink-0 border-t border-sand-200">
              <button
                type="button"
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setConfirmDeleteInput('');
                }}
                disabled={isDeleting}
                className="py-2.5 px-4 bg-sand-100 hover:bg-sand-200 text-charcoal-800 font-bold text-xs uppercase rounded-xl border border-sand-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                disabled={
                  isDeleting ||
                  selectedInvoices.length > 20 ||
                  (selectedInvoices.length > 5 && confirmDeleteInput.trim() !== 'DELETE')
                }
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <span>
                    Yes, Delete {selectedInvoices.length} Invoices
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG MODAL */}
      {deletingGroup && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border-2 border-rose-500">
            <div className="flex items-center gap-3 text-rose-900">
              <div className="w-12 h-12 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-charcoal-900">
                  Delete {deletingGroup.totalRows} row(s) from the invoices tab?
                </h3>
                <p className="text-xs text-charcoal-600 font-medium">Accounts Ledger Cleanup</p>
              </div>
            </div>

            <div className="p-4 bg-sand-50 border border-sand-200 rounded-xl text-xs space-y-1 font-mono text-charcoal-800">
              <p><strong>Invoice:</strong> {deletingGroup.invoiceNumber}</p>
              <p><strong>Supplier:</strong> {deletingGroup.supplierName}</p>
              <p><strong>Grand Total:</strong> ${deletingGroup.grandTotal.toFixed(2)}</p>
              <p><strong>Line items:</strong> {deletingGroup.totalRows}</p>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                ⚠ If App 2 has already matched this invoice into <strong>AP_Approved</strong> or <strong>AP_Exceptions</strong>, deleting it here will NOT remove it from those tabs. Check those tabs separately if needed.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingGroup(null)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 bg-sand-100 hover:bg-sand-200 text-charcoal-800 font-bold text-xs uppercase rounded-xl border border-sand-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <span>Deleting Rows...</span>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT INVOICE MODAL */}
      {editingGroup && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="max-w-4xl w-full my-8 bg-white rounded-2xl shadow-2xl overflow-hidden border border-sand-300 max-h-[90vh] flex flex-col">
            <ExtractionForm
              initialData={groupToFormData(editingGroup)}
              onAcceptAndSend={handleSaveEdit}
              isSaving={isSavingEdit}
              submitButtonLabel="Save Changes"
              formTitle={`Edit Invoice ${editingGroup.invoiceNumber}`}
              onCancel={() => setEditingGroup(null)}
              showPaymentFields={true}
              dueDateWarningBannerMessage={getDueDateWarningMessage(editingGroup)}
            />
          </div>
        </div>
      )}

      {/* MANUAL ADD INVOICE MODAL */}
      {showManualAddModal && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="max-w-4xl w-full my-8 bg-white rounded-2xl shadow-2xl overflow-hidden border border-sand-300 max-h-[90vh] flex flex-col">
            <ExtractionForm
              initialData={getBlankFormData()}
              onAcceptAndSend={handleSaveManualAdd}
              isSaving={isSavingManual}
              submitButtonLabel="Save & Send to Matching"
              isManualAdd={true}
              formTitle="+ Add Invoice Manually"
              onCancel={() => setShowManualAddModal(false)}
            />
          </div>
        </div>
      )}

      {/* REPAIR RESULT MODAL */}
      {repairModalResult && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border-2 border-sage-500">
            <div className="flex items-center gap-3 text-sage-900">
              <div className="w-11 h-11 rounded-xl bg-sage-100 border border-sage-300 text-sage-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-charcoal-900">
                  Due Dates Repair Complete
                </h3>
                <p className="text-xs text-charcoal-600 font-medium">Invoice Ledger Data Integrity</p>
              </div>
            </div>

            <div className="p-4 bg-sand-50 border border-sand-200 rounded-xl text-xs text-charcoal-800 space-y-2 leading-relaxed">
              <p className="font-bold text-charcoal-900">
                {repairModalResult.message}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setRepairModalResult(null)}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs uppercase rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL DUPLICATE WARNING MODAL */}
      {manualDuplicateData && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border-2 border-amber-400">
            <div className="flex items-center gap-3 text-amber-900">
              <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-charcoal-900">⚠ Possible Duplicate Invoice</h3>
                <p className="text-xs text-charcoal-600 font-medium">Manage Ledger Manual Add Check</p>
              </div>
            </div>

            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-3">
              <p className="font-bold text-amber-900 text-sm">
                Invoice {manualDuplicateData.newData.invoiceNumber?.value} from {manualDuplicateData.newData.supplierName?.value} already exists in the ledger.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-1 text-charcoal-800">
                  <p className="font-bold text-[11px] text-amber-800 uppercase tracking-wide">Already in ledger:</p>
                  <p><strong>Extracted:</strong> {manualDuplicateData.existingGroup.extractedAt ? manualDuplicateData.existingGroup.extractedAt.slice(0, 16) : 'N/A'}</p>
                  <p><strong>Grand Total:</strong> ${manualDuplicateData.existingGroup.grandTotal.toFixed(2)}</p>
                  <p><strong>Status:</strong> <span className="font-bold text-charcoal-900">{matchLogMap[manualDuplicateData.existingGroup.invoiceNumber.toLowerCase().replace(/\s+/g, '').trim()]?.rawStatus || manualDuplicateData.existingGroup.status || 'Pending Match'}</span></p>
                </div>

                <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-1 text-charcoal-800">
                  <p className="font-bold text-[11px] text-sage-800 uppercase tracking-wide">You're trying to add:</p>
                  <p><strong>Invoice Number:</strong> {manualDuplicateData.newData.invoiceNumber?.value}</p>
                  <p><strong>Supplier:</strong> {manualDuplicateData.newData.supplierName?.value}</p>
                  <p><strong>Grand Total:</strong> ${manualDuplicateData.newData.grandTotal?.value?.toFixed?.(2) || manualDuplicateData.newData.grandTotal?.value}</p>
                </div>
              </div>

              {(() => {
                const g = manualDuplicateData.existingGroup;
                const matchEntry = matchLogMap[g.invoiceNumber.toLowerCase().replace(/\s+/g, '').trim()];
                const rawStatus = matchEntry?.rawStatus || g.status || '';
                const statusLower = rawStatus.toLowerCase().trim();
                const displayStatus = rawStatus ? rawStatus : 'Pending Match';
                const isApproved = ['approved', 'auto approved', 'auto-approved', 'auto-approve', 'auto approve', 'autoapproved'].some(s => statusLower.includes(s));
                const isDeclined = ['rejected', 'declined', 'auto rejected', 'auto-rejected', 'auto reject', 'auto-reject'].some(s => statusLower.includes(s));
                const isHold = ['hold', 'under review'].some(s => statusLower.includes(s));
                const hasBeenMatched = (isApproved || isDeclined || isHold) && statusLower !== 'pending' && statusLower !== 'pending match';

                const existingAmt = g.grandTotal;
                const newAmt = manualDuplicateData.newData.grandTotal?.value || 0;
                const amountsDiffer = Math.abs(existingAmt - newAmt) > 0.01;

                return (
                  <>
                    {amountsDiffer && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-bold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>⚠ Amount differs from existing record (Existing: ${existingAmt.toFixed(2)}, New: ${newAmt.toFixed(2)})</span>
                      </div>
                    )}

                    {hasBeenMatched && (
                      <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 space-y-1">
                        <p className="font-bold">
                          ⚠ This invoice has already been reviewed by App 2 with status: {displayStatus}. Uploading again may cause confusion in the matching workflow. Recommend Cancel unless you know this is a genuine correction.
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold text-charcoal-900">What would you like to do?</p>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => setManualDuplicateData(null)}
                  disabled={isReplacingManual}
                  className="flex-1 py-2.5 px-3 bg-sand-100 hover:bg-sand-200 text-charcoal-800 font-bold text-xs uppercase rounded-xl border border-sand-300 transition-colors cursor-pointer text-center"
                >
                  Cancel Upload
                </button>

                <button
                  type="button"
                  onClick={handleReplaceManualDuplicate}
                  disabled={isReplacingManual}
                  className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 text-center"
                >
                  {isReplacingManual ? 'Replacing...' : 'Replace Existing'}
                </button>

                <button
                  type="button"
                  onClick={handleAppendManualDuplicate}
                  disabled={isReplacingManual}
                  className="flex-1 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase rounded-xl shadow-xs transition-colors cursor-pointer text-center"
                >
                  Add Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
