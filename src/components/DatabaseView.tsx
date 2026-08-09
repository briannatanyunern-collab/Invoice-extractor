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
import { InvoiceRecord } from '../types';
import {
  FileSpreadsheet,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  ExternalLink,
  RefreshCw,
  FileText,
  X,
  Eye,
  AlertTriangle,
  RotateCcw,
  Info
} from 'lucide-react';
import { buildHeaderMap, parseCurrencyNumber } from '../lib/sheetColumnMap';
import { StatusBadge, MatchLogStatusEntry, normalizeInvoiceNumber } from './StatusBadge';
import { DueDateDisplay } from './DueDateDisplay';

interface DatabaseViewProps {
  records: InvoiceRecord[];
  rawRows?: any[][];
  headerRow?: string[] | null;
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  lastSyncedTime?: string | null;
  googleAccessToken?: string | null;
  googleSheetsConnected: boolean;
  onConnectSheetsClick?: () => void;
  onAddActionLog?: (log: any) => void;
  matchLogMap?: Record<string, MatchLogStatusEntry>;
  matchLogBanner?: string | null;
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  records,
  rawRows,
  headerRow,
  onRefresh,
  isRefreshing = false,
  lastSyncedTime,
  googleAccessToken,
  googleSheetsConnected,
  onConnectSheetsClick,
  onAddActionLog,
  matchLogMap: propMatchLogMap,
  matchLogBanner: propMatchLogBanner,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [activeRow, setActiveRow] = useState<any[] | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Fallback Match Log status lookup state if not passed from parent
  const [internalMatchLogMap, setInternalMatchLogMap] = useState<Record<string, MatchLogStatusEntry>>({});
  const [internalMatchLogBanner, setInternalMatchLogBanner] = useState<string | null>(null);
  const [matchLogLastSynced, setMatchLogLastSynced] = useState<string | null>(null);
  const [isLoadingMatchLog, setIsLoadingMatchLog] = useState<boolean>(false);

  const activeMatchLogMap = propMatchLogMap || internalMatchLogMap;
  const activeMatchLogBanner = propMatchLogBanner !== undefined ? propMatchLogBanner : internalMatchLogBanner;

  const headerMap = useMemo(() => buildHeaderMap(headerRow), [headerRow]);

  const displayRows = rawRows && rawRows.length > 0 ? rawRows : [];

  // Extract unique suppliers
  const suppliers = Array.from(
    new Set(
      displayRows.length > 0
        ? displayRows.map((r) => r[headerMap.supplierName]).filter(Boolean)
        : records.map((r) => r.supplierName?.value).filter(Boolean)
    )
  );

  // Fetch Match Log from Google Sheets
  const fetchMatchLog = async () => {
    if (!googleAccessToken) return;
    setIsLoadingMatchLog(true);

    try {
      const res = await fetch('/api/sheets/get-match-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: googleAccessToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.connectionLost || res.status === 401) {
          setInternalMatchLogBanner('Google Sheets connection lost or authentication expired. Reconnect via Tools.');
          setInternalMatchLogMap({});
          return;
        }
        setInternalMatchLogBanner(data.error || 'Failed to fetch Match Log from Google Sheet.');
        setInternalMatchLogMap({});
        return;
      }

      if (!data.success && data.errorType === 'TAB_NOT_FOUND') {
        setInternalMatchLogBanner('Match Log tab not found in the connected sheet. Status column will default to Pending Match for all rows.');
        setInternalMatchLogMap({});
        return;
      }

      const rows: any[][] = data.rows || [];
      if (rows.length === 0) {
        setInternalMatchLogBanner(null);
        setInternalMatchLogMap({});
        return;
      }

      // Inspect header row
      const hRow = (rows[0] || []).map((h: any) => (h || '').toString().trim());

      let invColIdx = hRow.findIndex((h: string) => {
        const norm = h.toLowerCase();
        return norm.includes('invoice number') || norm.includes('invoice #') || norm.includes('invoice no') || norm.includes('inv #');
      });
      if (invColIdx === -1) {
        invColIdx = hRow.findIndex((h: string) => h.toLowerCase().includes('invoice') || h.toLowerCase().includes('inv'));
      }

      const statusColIdx = hRow.findIndex((h: string) => h.trim() === 'Status');

      let dateColIdx = hRow.findIndex((h: string) => {
        const norm = h.toLowerCase();
        return norm.includes('date') || norm.includes('time') || norm.includes('timestamp');
      });

      let notesColIdx = hRow.findIndex((h: string) => {
        const norm = h.toLowerCase();
        return norm.includes('note') || norm.includes('reason') || norm.includes('comment') || norm.includes('remark');
      });

      if (statusColIdx === -1) {
        setInternalMatchLogBanner('Status column not found in Match Log tab. Check the sheet structure.');
        setInternalMatchLogMap({});
        return;
      }

      setInternalMatchLogBanner(null);

      const invCountMap: Record<string, number> = {};
      const map: Record<string, MatchLogStatusEntry> = {};

      const dataRows = rows.slice(1);
      dataRows.forEach((row) => {
        const invRaw = invColIdx !== -1 ? row[invColIdx] : '';
        const normKey = normalizeInvoiceNumber(invRaw);
        if (!normKey) return;

        const rawStatus = (row[statusColIdx] || '').toString().trim();
        const dateVal = dateColIdx !== -1 ? (row[dateColIdx] || '').toString().trim() : '';
        const notesVal = notesColIdx !== -1 ? (row[notesColIdx] || '').toString().trim() : '';

        invCountMap[normKey] = (invCountMap[normKey] || 0) + 1;

        map[normKey] = {
          rawStatus,
          date: dateVal,
          notes: notesVal,
          count: invCountMap[normKey],
          isRevised: invCountMap[normKey] > 1,
        };
      });

      setInternalMatchLogMap(map);
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
      setMatchLogLastSynced(timeStr);
    } catch (err: any) {
      console.error('Fetch Match Log error:', err);
      setInternalMatchLogBanner('Failed to connect to Google Sheets Match Log.');
      setInternalMatchLogMap({});
    } finally {
      setIsLoadingMatchLog(false);
    }
  };

  useEffect(() => {
    fetchMatchLog();
  }, [googleAccessToken, rawRows, lastSyncedTime]);

  const handleCombinedRefresh = async () => {
    if (onRefresh) {
      await onRefresh();
    }
    await fetchMatchLog();
  };

  // Filter rows
  const filteredRows = displayRows.filter((row) => {
    const invNum = (row[headerMap.invoiceNumber] || '').toString().toLowerCase();
    const supName = (row[headerMap.supplierName] || '').toString().toLowerCase();
    const poRef = (row[headerMap.poReference] || '').toString().toLowerCase();
    const desc = (row[headerMap.lineItemDescription] || '').toString().toLowerCase();
    const term = searchTerm.toLowerCase();

    const matchesSearch =
      invNum.includes(term) || supName.includes(term) || poRef.includes(term) || desc.includes(term);

    const matchesSupplier = selectedSupplier === 'ALL' || row[headerMap.supplierName] === selectedSupplier;

    return matchesSearch && matchesSupplier;
  });

  // Calculate total AP value from line totals or grand totals using parseCurrencyNumber
  const totalApValue = filteredRows.reduce((sum, row) => {
    const lTotal = parseCurrencyNumber(row[headerMap.lineTotal]);
    const gTotal = parseCurrencyNumber(row[headerMap.grandTotal]);
    const totalVal = lTotal > 0 ? lTotal : gTotal;
    return sum + totalVal;
  }, 0);

  const renderStatusBadge = (invNum: string, row?: any[]) => {
    let ledgerMatchStatus = '';
    if (row && headerMap.matchStatus !== undefined && row[headerMap.matchStatus]) {
      ledgerMatchStatus = row[headerMap.matchStatus].toString().trim();
    }
    return <StatusBadge invoiceNumber={invNum} matchLogMap={activeMatchLogMap} ledgerMatchStatus={ledgerMatchStatus} />;
  };

  return (
    <div className="space-y-6">
      {/* Banner Notification */}
      {bannerMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold">{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-xs cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Match Log Edge Case Warning Banner */}
      {activeMatchLogBanner && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 flex items-center justify-between shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-xs font-bold leading-relaxed">{activeMatchLogBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setInternalMatchLogBanner(null)}
            className="text-amber-800 hover:text-amber-950 font-bold text-xs p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner & Summary Cards */}
      <div className="bg-white border border-sand-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-sand-100">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-sage-600" />
              <h2 className="text-lg font-bold text-charcoal-900">
                Google Sheet: Boon Huat AP Master Data
              </h2>
            </div>
            <p className="text-xs text-charcoal-600 font-medium mt-1">
              Read-only view of the master ledger &bull; Tab: <strong className="text-sage-800 underline font-bold">Invoice Ledger</strong> &bull; Editing &amp; deletions live in <span className="font-bold text-charcoal-900">Manage Ledger</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCombinedRefresh}
              disabled={isRefreshing || isLoadingMatchLog}
              className="px-3 py-2 bg-cream-100 hover:bg-sand-200 text-charcoal-800 border border-sand-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sage-600 ${isRefreshing || isLoadingMatchLog ? 'animate-spin' : ''}`} />
              <span>{isRefreshing || isLoadingMatchLog ? 'Refreshing...' : '🔄 Refresh from Sheet'}</span>
            </button>

            {(lastSyncedTime || matchLogLastSynced) && (
              <span className="text-[11px] font-mono font-medium text-charcoal-500 bg-sand-100 px-2.5 py-1.5 rounded-lg border border-sand-200">
                Last refreshed: {matchLogLastSynced || lastSyncedTime}
              </span>
            )}

            <a
              href="https://docs.google.com/spreadsheets/d/1EokXlmMYiu1_BeYIziSeWneEaKV_PAFmyQR3USuGwQc/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-sage-50 hover:bg-sage-100 text-sage-800 border border-sage-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
            >
              <span>Open Google Sheet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="bg-cream-100 p-4 rounded-xl border border-sand-200">
            <span className="text-xs font-bold uppercase tracking-wider text-charcoal-500">Total Item Rows Logged</span>
            <div className="text-2xl font-black text-charcoal-900 mt-1">{filteredRows.length}</div>
          </div>

          <div className="bg-sage-50 p-4 rounded-xl border border-sage-200">
            <span className="text-xs font-bold uppercase tracking-wider text-sage-800">Total Itemized AP Amount</span>
            <div className="text-2xl font-black text-sage-900 mt-1 font-mono">
              ${totalApValue.toFixed(2)}
            </div>
          </div>

          <div className="bg-sand-100 p-4 rounded-xl border border-sand-200">
            <span className="text-xs font-bold uppercase tracking-wider text-charcoal-500">Target Tab Status</span>
            <div className="text-sm font-bold text-sage-800 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-sage-600" />
              <span>Read-Only View (1 Row/Line Item)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-sand-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-charcoal-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search invoice #, supplier, or item description..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-cream-100 border border-sand-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sage-500 text-charcoal-900"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="px-3 py-2 text-xs bg-cream-100 border border-sand-200 rounded-xl text-charcoal-900 font-medium focus:bg-white focus:ring-2 focus:ring-sage-500"
          >
            <option value="ALL">All Suppliers ({suppliers.length})</option>
            {suppliers.map((sup) => (
              <option key={sup} value={sup}>
                {sup}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Google Sheet Invoice Ledger Table */}
      <div className="bg-white border border-sand-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-sand-100 border-b border-sand-200 text-charcoal-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-3">PO Ref</th>
                <th className="py-3 px-4">Line Description</th>
                <th className="py-3 px-2 text-center">Qty</th>
                <th className="py-3 px-3 text-right">Price ($)</th>
                <th className="py-3 px-3 text-right font-bold">Line Total ($)</th>
                <th className="py-3 px-3">Extracted By</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100 bg-white">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-charcoal-500">
                    <FileText className="w-8 h-8 text-sand-300 mx-auto mb-2" />
                    <p className="font-bold text-sm text-charcoal-900">No Rows in Invoice Ledger</p>
                    <p className="text-xs text-charcoal-500 mt-1">
                      Upload an invoice in the &quot;1. Invoice Upload &amp; Verification&quot; tab and click &quot;Accept &amp; Send to Matching&quot; to append rows here.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const invNum = (row[headerMap.invoiceNumber] || '').toString().trim();
                  const priceNum = parseCurrencyNumber(row[headerMap.unitPrice]);
                  const lineTotalNum = parseCurrencyNumber(row[headerMap.lineTotal]);

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-sage-50/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-charcoal-900">
                        {invNum || 'N/A'}
                      </td>
                      <td className="py-3 px-3 text-charcoal-600">
                        {row[headerMap.invoiceDate] || 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-charcoal-900">
                        {row[headerMap.supplierName] || 'N/A'}
                      </td>
                      <td className="py-3 px-3 font-semibold text-sage-800">
                        {row[headerMap.poReference] || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-charcoal-800 font-medium max-w-xs truncate">
                        {row[headerMap.lineItemDescription] || 'N/A'}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-charcoal-900">
                        {row[headerMap.quantity] ?? 1}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-charcoal-900">
                        ${priceNum.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-sage-900">
                        ${lineTotalNum.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 font-medium text-charcoal-700">
                        {row[headerMap.extractedBy] || 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        {renderStatusBadge(invNum, row)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveRow(row)}
                          className="px-2.5 py-1 text-xs font-semibold text-sage-800 hover:text-sage-900 bg-sage-100 hover:bg-sage-200 rounded-lg border border-sage-300 transition-colors cursor-pointer flex items-center gap-1 mx-auto"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Transparency Note */}
        <div className="p-3 bg-sand-50 border-t border-sand-200 text-center text-[11px] font-mono text-charcoal-600 flex items-center justify-center gap-1.5 flex-wrap">
          <Info className="w-3.5 h-3.5 text-sage-600 shrink-0" />
          <span>
            Status column values read live from: <strong className="text-charcoal-900">Boon Huat AP Master Data &rarr; Match Log &rarr; Status</strong>. Last synced: <strong className="text-charcoal-900">{matchLogLastSynced || lastSyncedTime || 'HH:MM:SS'}</strong>.
          </span>
        </div>
      </div>

      {/* Row Inspection Modal */}
      {activeRow && (
        <div className="fixed inset-0 bg-charcoal-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-sand-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-sand-200">
              <div>
                <h3 className="text-base font-bold text-charcoal-900">
                  Ledger Row Detail: Invoice {activeRow[headerMap.invoiceNumber]}
                </h3>
                <p className="text-xs text-charcoal-500">
                  Supplier: {activeRow[headerMap.supplierName]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRow(null)}
                className="text-charcoal-500 hover:text-charcoal-900 text-sm font-bold p-1 rounded-lg hover:bg-sand-100 cursor-pointer"
              >
                &times; Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-cream-100 p-3 rounded-xl border border-sand-200">
                <div>
                  <span className="text-charcoal-500 font-medium">Invoice Number:</span>
                  <p className="font-bold text-charcoal-900">{activeRow[headerMap.invoiceNumber]}</p>
                </div>
                <div>
                  <span className="text-charcoal-500 font-medium">Invoice Date:</span>
                  <p className="font-bold text-charcoal-900">{activeRow[headerMap.invoiceDate]}</p>
                </div>
                <div>
                  <span className="text-charcoal-500 font-medium">Supplier Address:</span>
                  <p className="font-bold text-charcoal-900">{activeRow[headerMap.supplierAddress]}</p>
                </div>
                <div>
                  <span className="text-charcoal-500 font-medium">PO Reference:</span>
                  <p className="font-bold text-sage-800">{activeRow[headerMap.poReference]}</p>
                </div>
                <div>
                  <span className="text-charcoal-500 font-medium">Payment Terms:</span>
                  <p className="font-bold text-charcoal-900">{activeRow[headerMap.paymentTerms]}</p>
                </div>
                <div>
                  <span className="text-charcoal-500 font-medium">Due Date:</span>
                  <div className="pt-0.5">
                    <DueDateDisplay dateVal={activeRow[headerMap.dueDate] || activeRow[headerMap.paymentDueDate]} />
                  </div>
                </div>
              </div>

              <div className="bg-sage-50/70 p-3 rounded-xl border border-sage-200 space-y-2">
                <h4 className="font-bold text-sage-900 text-xs">Line Item Details</h4>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-charcoal-500">Description:</span>
                    <p className="font-semibold text-charcoal-900">{activeRow[headerMap.lineItemDescription]}</p>
                  </div>
                  <div>
                    <span className="text-charcoal-500">Quantity:</span>
                    <p className="font-bold text-charcoal-900">{activeRow[headerMap.quantity]}</p>
                  </div>
                  <div>
                    <span className="text-charcoal-500">Unit Price:</span>
                    <p className="font-mono font-bold text-charcoal-900">${parseCurrencyNumber(activeRow[headerMap.unitPrice]).toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-charcoal-500">Line Total:</span>
                    <p className="font-mono font-black text-sage-900">${parseCurrencyNumber(activeRow[headerMap.lineTotal]).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-cream-50 p-3 rounded-xl border border-sand-200 text-center font-mono">
                <div>
                  <span className="text-[10px] text-charcoal-500 uppercase font-sans">Subtotal</span>
                  <p className="font-bold text-charcoal-900">${parseCurrencyNumber(activeRow[headerMap.subtotal]).toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[10px] text-charcoal-500 uppercase font-sans">GST</span>
                  <p className="font-bold text-charcoal-900">${parseCurrencyNumber(activeRow[headerMap.gstAmount]).toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[10px] text-sage-700 uppercase font-sans">Grand Total</span>
                  <p className="font-black text-sage-900">${parseCurrencyNumber(activeRow[headerMap.grandTotal]).toFixed(2)}</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-charcoal-900 mb-1">Extraction Notes</h4>
                <p className="p-3 bg-cream-100 border border-sand-200 rounded-xl text-charcoal-900 leading-relaxed">
                  {activeRow[headerMap.extractionNotes] || 'No notes attached.'}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-sand-200 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveRow(null)}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
