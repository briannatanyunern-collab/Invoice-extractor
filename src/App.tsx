import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { InvoiceUploader } from './components/InvoiceUploader';
import { BatchProcessor, BatchItem } from './components/BatchProcessor';
import { BatchReviewQueue } from './components/BatchReviewQueue';
import { ManageAccountsModal } from './components/ManageAccountsModal';
import { InvoiceViewer } from './components/InvoiceViewer';
import { ExtractionForm } from './components/ExtractionForm';
import { DatabaseView } from './components/DatabaseView';
import { ManageLedgerView, ActionLogItem } from './components/ManageLedgerView';
import { GoogleSheetsConnect } from './components/GoogleSheetsConnect';
import { ReloadSyncPromptModal } from './components/ReloadSyncPromptModal';
import { initAuth, googleSignIn } from './lib/auth';
import { StatusBadge, MatchLogStatusEntry, normalizeInvoiceNumber } from './components/StatusBadge';
import { parseCurrencyNumber, buildHeaderMap } from './lib/sheetColumnMap';

const normalizeString = (str: any): string => {
  if (str === null || str === undefined) return '';
  return str.toString().toLowerCase().trim().replace(/\s+/g, ' ');
};
import {
  ExtractedInvoiceData,
  InvoiceRecord,
  UserAccount
} from './types';
import {
  FileText,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  RefreshCw,
  X,
  ArrowLeft
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'intake' | 'database' | 'manage-ledger'>('intake');

  // User Accounts State
  const [accounts, setAccounts] = useState<UserAccount[]>([
    { id: 'acc-1', name: 'Madam Lim', role: 'AP Clerk', initials: 'ML' },
    { id: 'acc-2', name: 'Mr. Boon', role: 'Owner', initials: 'MB' }
  ]);
  const [activeAccountId, setActiveAccountId] = useState<string>('acc-1');
  const [showManageAccounts, setShowManageAccounts] = useState(false);
  const activeAccount = accounts.find(a => a.id === activeAccountId) || accounts[0];

  // Batch State
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<BatchItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number>(-1); // -1 means Queue View
  const [lastReviewedIndex, setLastReviewedIndex] = useState<number | null>(null);

  // Currently Loaded Invoice File State (for review)
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [fileType, setFileType] = useState<string>('');

  // Extraction State (for single review)
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Database Records State (Loaded directly from Google Sheets "Invoice Ledger")
  const [rawLedgerRows, setRawLedgerRows] = useState<any[][]>([]);
  const [ledgerHeaderRow, setLedgerHeaderRow] = useState<string[] | null>(null);
  const [apRecords, setApRecords] = useState<InvoiceRecord[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Audit Trail Action History State (Session-only, max 20)
  const [actionHistory, setActionHistory] = useState<ActionLogItem[]>([]);

  const handleAddActionLog = (logItem: Omit<ActionLogItem, 'id' | 'user'>) => {
    const newLog: ActionLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      user: activeAccount.name,
      ...logItem,
    };
    setActionHistory((prev) => [newLog, ...prev].slice(0, 20));
  };

  // Duplicate Modal State
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [pendingData, setPendingData] = useState<ExtractedInvoiceData | null>(null);
  const [duplicateMeta, setDuplicateMeta] = useState<{
    rowCount?: number;
    extractedAt?: string;
    existingGrandTotal?: number;
    existingStatus?: string;
    hasBeenMatched?: boolean;
    amountsDiffer?: boolean;
    newGrandTotal?: number;
  } | null>(null);
  const [isReplacing, setIsReplacing] = useState<boolean>(false);

  // Supplier Mismatch Verification Modal State (Fix 4)
  const [supplierMismatch, setSupplierMismatch] = useState<{
    verifiedData: ExtractedInvoiceData;
    poNumber: string;
    invoiceSupplier: string;
    poSupplier: string;
  } | null>(null);
  const [isManualSupplierEditing, setIsManualSupplierEditing] = useState<boolean>(false);
  const [manualSupplierName, setManualSupplierName] = useState<string>('');

  // OAuth Google Sheets state & connection lost banner
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [sheetsConnectionLost, setSheetsConnectionLost] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  // App Reload Sync Prompt state
  const [showReloadSyncPrompt, setShowReloadSyncPrompt] = useState<boolean>(false);
  const [hasSyncedThisSession, setHasSyncedThisSession] = useState<boolean>(false);
  const [isSyncingPrompt, setIsSyncingPrompt] = useState<boolean>(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Check on app load/reload if we need to show the sync prompt
  useEffect(() => {
    const lastSyncStr = sessionStorage.getItem('bh_ap_last_sync_timestamp');
    const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    const now = Date.now();
    const TWO_MINUTES = 2 * 60 * 1000;

    if (lastSyncTime && (now - lastSyncTime < TWO_MINUTES)) {
      setShowReloadSyncPrompt(false);
      setHasSyncedThisSession(true);
    } else {
      setShowReloadSyncPrompt(true);
      setHasSyncedThisSession(false);
    }
  }, []);

  // Shared Match Log state for Tab 2 and Tab 3
  const [matchLogMap, setMatchLogMap] = useState<Record<string, MatchLogStatusEntry>>({});
  const [matchLogBanner, setMatchLogBanner] = useState<string | null>(null);
  const [matchLogLastSynced, setMatchLogLastSynced] = useState<string | null>(null);
  const [isLoadingMatchLog, setIsLoadingMatchLog] = useState<boolean>(false);

  
  const hasCleanedUp = useRef(false);

  useEffect(() => {
    if (googleAccessToken && !hasCleanedUp.current) {
      hasCleanedUp.current = true;
      fetch('/api/sheets/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: googleAccessToken }),
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.removedRows > 0) {
          setSaveSuccessMessage(`Removed ${data.removedRows} duplicate rows across ${data.removedInvoices} invoices.`);
          setTimeout(() => setSaveSuccessMessage(null), 10000);
          fetchAllDataWithToken(googleAccessToken);
        }
      })
      .catch(err => console.error('Failed to cleanup duplicates', err));
    }
  }, [googleAccessToken]);

  // Initialize Firebase Auth listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleAccessToken(token);
        setSheetsConnectionLost(false);
      },
      () => {
        // Token not available yet
      }
    );
    return () => unsubscribe();
  }, []);

  const handleConnectGoogleSheets = async () => {
    setIsSigningIn(true);
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        setGoogleAccessToken(res.accessToken);
        setSheetsConnectionLost(false);
        await fetchLedgerRowsWithToken(res.accessToken);
      }
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setExtractionError('Could not connect to Google Sheets: ' + (err.message || 'Please try again.'));
    } finally {
      setIsSigningIn(false);
    }
  };

  // Fetch Match Log from Google Sheet "Match Log" tab
  const fetchMatchLogWithToken = async (tokenOverride?: string) => {
    const tokenToUse = tokenOverride || googleAccessToken;
    if (!tokenToUse) return;

    setIsLoadingMatchLog(true);
    try {
      const res = await fetch('/api/sheets/get-match-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: tokenToUse }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.connectionLost || res.status === 401) {
          setMatchLogBanner('Google Sheets connection lost or authentication expired. Reconnect via Tools.');
          setMatchLogMap({});
          return;
        }
        setMatchLogBanner(data.error || 'Failed to fetch Match Log from Google Sheet.');
        setMatchLogMap({});
        return;
      }

      if (!data.success && data.errorType === 'TAB_NOT_FOUND') {
        setMatchLogBanner('Match Log tab not found in the connected sheet. Status column will default to Pending Match for all rows.');
        setMatchLogMap({});
        return;
      }

      const rows: any[][] = data.rows || [];
      if (rows.length === 0) {
        setMatchLogBanner(null);
        setMatchLogMap({});
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
        setMatchLogBanner('Status column not found in Match Log tab. Check the sheet structure.');
        setMatchLogMap({});
        return;
      }

      setMatchLogBanner(null);

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

      setMatchLogMap(map);
      const timeStr = new Date().toLocaleTimeString('en-SG', { hour12: false });
      setMatchLogLastSynced(timeStr);
    } catch (err: any) {
      console.error('Fetch Match Log error:', err);
      setMatchLogBanner('Failed to connect to Google Sheets Match Log.');
      setMatchLogMap({});
    } finally {
      setIsLoadingMatchLog(false);
    }
  };

  // Fetch rows directly from Google Sheet "Invoice Ledger" tab
  const fetchLedgerRowsWithToken = async (tokenOverride?: string) => {
    const tokenToUse = tokenOverride || googleAccessToken;
    if (!tokenToUse) {
      setSheetsConnectionLost(true);
      return;
    }

    setIsRefreshing(true);
    try {
      const res = await fetch('/api/sheets/get-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: tokenToUse }),
      });

      const data = await res.json();
      if (!res.ok || data.connectionLost) {
        setSheetsConnectionLost(true);
        return;
      }

      setSheetsConnectionLost(false);
      if (data.rawRows && Array.isArray(data.rawRows)) {
        setRawLedgerRows(data.rawRows);
      }
      if (data.headerRow && Array.isArray(data.headerRow)) {
        setLedgerHeaderRow(data.headerRow);
      }

      const timeStr = new Date().toLocaleTimeString('en-SG', { hour12: false });
      setLastSyncedTime(timeStr);
    } catch (err) {
      console.error('Failed to fetch Google Sheet ledger rows:', err);
      setSheetsConnectionLost(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchAllDataWithToken = async (tokenOverride?: string): Promise<boolean> => {
    const tokenToUse = tokenOverride || googleAccessToken;
    if (!tokenToUse) {
      setSheetsConnectionLost(true);
      return false;
    }
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchLedgerRowsWithToken(tokenToUse),
        fetchMatchLogWithToken(tokenToUse),
      ]);
      const timeStr = new Date().toLocaleTimeString('en-SG', { hour12: false });
      setLastSyncedTime(timeStr);
      sessionStorage.setItem('bh_ap_last_sync_timestamp', Date.now().toString());
      setHasSyncedThisSession(true);
      setSheetsConnectionLost(false);
      return true;
    } catch (err) {
      console.error('Failed to fetch all data with token:', err);
      setSheetsConnectionLost(true);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePromptSyncNow = async () => {
    setIsSyncingPrompt(true);
    setPromptError(null);
    try {
      let tokenToUse = googleAccessToken;
      if (!tokenToUse) {
        const res = await googleSignIn();
        tokenToUse = res?.accessToken || null;
      }

      if (!tokenToUse) {
        setSheetsConnectionLost(true);
        setPromptError('Google Sign In is required to sync with Google Sheets. Please click Re-authenticate.');
        setIsSyncingPrompt(false);
        return;
      }

      setGoogleAccessToken(tokenToUse);
      const success = await fetchAllDataWithToken(tokenToUse);

      if (success) {
        setShowReloadSyncPrompt(false);
        setHasSyncedThisSession(true);
        setSheetsConnectionLost(false);
      } else {
        setSheetsConnectionLost(true);
        setPromptError('Could not sync with Google Sheets. Please re-authenticate and try again.');
      }
    } catch (err: any) {
      console.error('Prompt sync error:', err);
      setSheetsConnectionLost(true);
      setPromptError(err.message || 'Failed to sync with Google Sheets.');
    } finally {
      setIsSyncingPrompt(false);
    }
  };

  const handlePromptSkip = () => {
    setShowReloadSyncPrompt(false);
    setHasSyncedThisSession(false);
  };

  const fetchLedgerRows = () => fetchAllDataWithToken();

  useEffect(() => {
    if (googleAccessToken) {
      if (activeTab === 'database' || activeTab === 'manage-ledger') {
        fetchAllDataWithToken();
      }
    }
  }, [googleAccessToken, activeTab]);

  // Handle Custom File Upload (Batch)
  const handleBatchUpload = (files: File[]) => {
    if (files.length > 10) {
      return;
    }
    setBatchFiles(files);
    setBatchResults([]);
    setReviewIndex(-1);
    setExtractionError(null);
    setSaveSuccessMessage(null);
  };

  const handleBatchComplete = (results: BatchItem[]) => {
    const headerMap: Record<string, number> = {};
    if (ledgerHeaderRow) {
      ledgerHeaderRow.forEach((h, i) => {
        const norm = h.toLowerCase().replace(/\s+/g, '').trim();
        if (norm.includes('invoicenumber') || norm.includes('invoice#')) headerMap['invoiceNumber'] = i;
        if (norm.includes('suppliername') || norm.includes('vendorname') || norm.includes('supplier')) headerMap['supplierName'] = i;
      });
    }

    const seenInBatch = new Set<string>();

    const updatedResults = results.map(item => {
      // Only check items that were just successfully extracted. If it already has an error, leave it.
      if (item.status === 'success' && item.data) {
        const invNum = item.data.invoiceNumber?.value?.trim().toLowerCase();
        const supName = item.data.supplierName?.value?.trim().toLowerCase();

        if (invNum && supName) {
          const key = `${invNum}|||${supName}`;

          // Check within batch
          if (seenInBatch.has(key)) {
            return {
               ...item,
               status: 'duplicate',
               error: '⚠ Needs Attention: duplicate within this batch.'
            } as BatchItem;
          }
          seenInBatch.add(key);

          // Check in Invoice Ledger
          if (headerMap.invoiceNumber !== undefined && headerMap.supplierName !== undefined && rawLedgerRows.length > 0) {
            let isDuplicate = false;
            for (let i = 0; i < rawLedgerRows.length; i++) {
              const row = rawLedgerRows[i];
              const rowInv = (row[headerMap.invoiceNumber] || '').toString().trim().toLowerCase();
              const rowSup = (row[headerMap.supplierName] || '').toString().trim().toLowerCase();
              if (rowInv === invNum && rowSup === supName) {
                isDuplicate = true;
                break;
              }
            }
            if (isDuplicate) {
              return {
                 ...item,
                 status: 'duplicate',
                 error: '⚠ Needs Attention: Possible duplicate of an existing invoice. Review before importing.'
              } as BatchItem;
            }
          }
        }
      }
      return item;
    });

    setBatchResults(updatedResults);
    setReviewIndex(-1); // Show Queue view
  };

  const handleImportReady = async (readyItems: BatchItem[]) => {
    setIsSaving(true);
    let successCount = 0;
    
    // Process sequentially to avoid sheet conflicts
    for (const item of readyItems) {
      if (item.data) {
        try {
          const success = await executeAppendToSheet(item.data);
          if (success) {
            successCount++;
          } else {
            // Halted due to duplicate or auth failure, break loop so user can resolve modal
            break;
          }
        } catch (err) {
          console.error('Failed to import item', err);
        }
      }
    }
    
    setSaveSuccessMessage(`Imported ${successCount} invoices.`);
    setIsSaving(false);
    
    // Remove the imported items from batchResults
    const readyIds = new Set(readyItems.map(i => i.id));
    const remaining = batchResults.filter(i => !readyIds.has(i.id) && i.status !== 'failed');
    if (remaining.length === 0) {
       cancelBatch(); // all done
    } else {
       setBatchResults(remaining);
       setReviewIndex(-1);
    }
  };

  const handleFormChange = (updatedData: ExtractedInvoiceData) => {
    setExtractedData(updatedData);
    if (reviewIndex >= 0 && reviewIndex < batchResults.length) {
      setBatchResults((prev) => {
        const copy = [...prev];
        copy[reviewIndex] = {
          ...copy[reviewIndex],
          data: updatedData,
        };
        return copy;
      });
    }
  };

  const handleBackToQueue = () => {
    if (reviewIndex >= 0 && reviewIndex < batchResults.length && extractedData) {
      // Ensure draft edits are saved to batchResults before returning to queue
      setBatchResults((prev) => {
        const copy = [...prev];
        copy[reviewIndex] = {
          ...copy[reviewIndex],
          data: extractedData,
        };
        return copy;
      });
    }
    setReviewIndex(-1);
  };

  const loadReviewItem = (item: BatchItem, index: number) => {
    setReviewIndex(index);
    setLastReviewedIndex(index);
    setFilename(item.file.name);
    setFileType(item.file.type || 'image/png');
    setExtractedData(item.data || null);

    try {
      window.history.pushState({ batchReviewIndex: index }, '');
    } catch (err) {
      // ignore
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      setFileUrl(reader.result as string);
    };
    reader.readAsDataURL(item.file);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        reviewIndex >= 0 &&
        !showDuplicateModal &&
        !supplierMismatch &&
        !showManageAccounts
      ) {
        handleBackToQueue();
      }
    };

    const handlePopState = () => {
      if (reviewIndex >= 0) {
        setReviewIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [reviewIndex, showDuplicateModal, supplierMismatch, showManageAccounts, extractedData, batchResults]);

  const cancelBatch = () => {
    setBatchFiles([]);
    setBatchResults([]);
    setReviewIndex(-1);
    setLastReviewedIndex(null);
    setFileUrl(null);
    setExtractedData(null);
  };

  // Perform actual Append to "Invoice Ledger" (includes mandatory live fresh duplicate check)
  const executeAppendToSheet = async (
    verifiedData: ExtractedInvoiceData,
    options?: { allowDuplicate?: boolean }
  ): Promise<boolean> => {
    setIsSaving(true);
    setSaveSuccessMessage(null);

    let tokenToUse = googleAccessToken;

    if (!tokenToUse) {
      try {
        const signInRes = await googleSignIn();
        if (signInRes?.accessToken) {
          tokenToUse = signInRes.accessToken;
          setGoogleAccessToken(tokenToUse);
          setSheetsConnectionLost(false);
        } else {
          setSheetsConnectionLost(true);
          setIsSaving(false);
          return false;
        }
      } catch (err: any) {
        setSheetsConnectionLost(true);
        setIsSaving(false);
        setExtractionError('Google Sign In is required to write to Google Sheets: ' + (err.message || ''));
        return false;
      }
    }

    // 1. Mandatory LIVE fresh duplicate check immediately before writing
    if (!options?.allowDuplicate) {
      try {
        const res = await fetch('/api/sheets/get-ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: tokenToUse }),
        });
        const freshData = await res.json();

        if (res.ok && freshData.rawRows && Array.isArray(freshData.rawRows)) {
          const freshHeaderRow: string[] = freshData.headerRow || [];
          const freshRawRows: any[][] = freshData.rawRows || [];

          const headerMap = buildHeaderMap(freshHeaderRow);

          const normalisedNew = {
            inv: normalizeString(verifiedData.invoiceNumber?.value),
            sup: normalizeString(verifiedData.supplierName?.value),
          };

          console.log('Checking for duplicate:', normalisedNew, 'against', freshRawRows.length, 'existing rows');

          if (normalisedNew.inv && normalisedNew.sup) {
            let isDuplicate = false;
            let matchingRowCount = 0;
            let extractedAt = '';
            let existingGrandTotal = 0;

            for (let i = 0; i < freshRawRows.length; i++) {
              const row = freshRawRows[i];
              if (!row || !Array.isArray(row)) continue;

              const rowInv = normalizeString(row[headerMap.invoiceNumber]);
              const rowSup = normalizeString(row[headerMap.supplierName]);

              if (rowInv && rowSup && rowInv === normalisedNew.inv && rowSup === normalisedNew.sup) {
                isDuplicate = true;
                matchingRowCount++;
                if (!extractedAt && headerMap.extractedAt !== undefined && row[headerMap.extractedAt]) {
                  extractedAt = row[headerMap.extractedAt];
                }
                if (existingGrandTotal === 0 && headerMap.grandTotal !== undefined && row[headerMap.grandTotal] !== undefined) {
                  existingGrandTotal = parseCurrencyNumber(row[headerMap.grandTotal]);
                }
              }
            }

            if (isDuplicate) {
              console.log(`DUPLICATE FOUND! Invoice "${normalisedNew.inv}" from Supplier "${normalisedNew.sup}" already exists in ${matchingRowCount} row(s). Halting write.`);
              const normTargetInv = normalizeInvoiceNumber(verifiedData.invoiceNumber?.value || '');
              const matchEntry = matchLogMap[normTargetInv];
              const rawStatus = matchEntry?.rawStatus || '';
              const statusLower = rawStatus.toLowerCase().trim();
              const displayStatus = rawStatus ? rawStatus : 'Pending Match';
              const isApproved = ['approved', 'auto approved', 'auto-approved', 'auto-approve', 'auto approve', 'autoapproved'].some(s => statusLower.includes(s));
              const isDeclined = ['rejected', 'declined', 'auto rejected', 'auto-rejected', 'auto reject', 'auto-reject'].some(s => statusLower.includes(s));
              const isHold = ['hold', 'under review'].some(s => statusLower.includes(s));
              const hasBeenMatched = (isApproved || isDeclined || isHold) && statusLower !== 'pending' && statusLower !== 'pending match';

              const newTotal = verifiedData.grandTotal?.value || 0;
              const amountsDiffer = Math.abs(existingGrandTotal - newTotal) > 0.01;

              setPendingData(verifiedData);
              setDuplicateMeta({
                rowCount: matchingRowCount || 1,
                extractedAt: extractedAt || '',
                existingGrandTotal,
                existingStatus: displayStatus,
                hasBeenMatched,
                amountsDiffer,
                newGrandTotal: newTotal,
              });
              setShowDuplicateModal(true);
              setIsSaving(false);
              return false; // HALT WRITE
            }
          }
        }
      } catch (err) {
        console.warn('Live fresh duplicate check error:', err);
      }
    }

    try {
      const response = await fetch('/api/sheets/append-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceData: verifiedData,
          accessToken: tokenToUse,
          extractedBy: activeAccount.name
        }),
      });

      const resData = await response.json();
      if (!response.ok || resData.connectionLost) {
        setSheetsConnectionLost(true);
        throw new Error(resData.error || 'Google Sheets connection lost. Please reconnect.');
      }

      setSheetsConnectionLost(false);
      setSaveSuccessMessage(resData.message || 'Successfully written to Invoice Ledger!');
      setIsSaving(false);

      // Refresh Ledger rows from Google Sheets
      await fetchLedgerRowsWithToken(tokenToUse);

      // Clear success banner after 8 seconds
      setTimeout(() => {
        setSaveSuccessMessage(null);
      }, 8000);
      return true;
    } catch (err: any) {
      console.error('Append error:', err);
      setExtractionError(`Error writing to Google Sheet: ${err.message}`);
      setIsSaving(false);
      return false;
    }
  };

  const proceedWithVerifiedData = async (verifiedData: ExtractedInvoiceData) => {
    const invNum = verifiedData.invoiceNumber?.value;
    const supName = verifiedData.supplierName?.value;

    // Secondary prefix soft-warning check
    if (invNum && supName) {
      const prefixMatch = invNum.match(/^([A-Za-z]+)[-\s]?\d+/);
      if (prefixMatch) {
        const prefix = prefixMatch[1].toUpperCase();
        if (prefix.length >= 2) {
          const supUpper = supName.toUpperCase();
          if (!supUpper.includes(prefix) && prefix !== 'INV' && prefix !== 'BILL') {
            const dateStr = new Date().toISOString().split('T')[0];
            const warningNote = `\nSoft Warning: Invoice prefix '${prefix}' differs from supplier '${supName}' on ${dateStr}.`;
            if (!verifiedData.extractionNotes.includes(warningNote)) {
              verifiedData.extractionNotes = (verifiedData.extractionNotes || '') + warningNote;
            }
          }
        }
      }
    }

    // Proceed to write via executeAppendToSheet (which runs mandatory live fresh duplicate check inline)
    await executeAppendToSheet(verifiedData);
  };

  // Handle "Accept & Send to Matching" (Includes Duplicate & PO Supplier Verification Check)
  const handleAcceptAndSend = async (verifiedData: ExtractedInvoiceData) => {
    const poRef = verifiedData.poReference?.value;
    const extractedSup = verifiedData.supplierName?.value;

    // Fix 4: Cross-check PO Reference against Purchase Orders tab
    if (poRef && poRef !== 'N/A' && googleAccessToken) {
      try {
        const poRes = await fetch('/api/sheets/get-purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: googleAccessToken }),
        });
        const poData = await poRes.json();
        if (poData.success && Array.isArray(poData.pos)) {
          const matchedPo = poData.pos.find(
            (p: any) => (p.poNumber || '').trim().toLowerCase() === poRef.trim().toLowerCase()
          );

          if (matchedPo && matchedPo.supplierName) {
            const poSup = matchedPo.supplierName.trim();
            if (extractedSup && extractedSup.trim().toLowerCase() !== poSup.toLowerCase()) {
              setSupplierMismatch({
                verifiedData,
                poNumber: matchedPo.poNumber,
                invoiceSupplier: extractedSup.trim(),
                poSupplier: poSup,
              });
              setManualSupplierName(extractedSup.trim());
              return;
            }
          }
        }
      } catch (err) {
        console.warn('PO cross-check error:', err);
      }
    }

    await proceedWithVerifiedData(verifiedData);
  };

  // Replace Existing Duplicate Invoice Flow
  const handleReplaceDuplicate = async () => {
    if (!pendingData) return;
    setIsReplacing(true);

    try {
      const invNum = pendingData.invoiceNumber?.value;
      const supName = pendingData.supplierName?.value;

      const res = await fetch('/api/sheets/replace-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          targetInvoiceNumber: invNum,
          invoiceData: pendingData,
          extractedBy: activeAccount.name
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.connectionLost) {
        setSheetsConnectionLost(true);
        throw new Error(resData.error || 'Failed to replace duplicate invoice in Google Sheet.');
      }

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      handleAddActionLog({
        timestamp: nowStr,
        description: `Replaced duplicate invoice ${invNum} (${supName})`,
        type: 'replace',
      });

      setSaveSuccessMessage(`Successfully replaced existing rows for invoice ${invNum}!`);
      setShowDuplicateModal(false);
      setPendingData(null);
      setDuplicateMeta(null);

      await fetchLedgerRowsWithToken(googleAccessToken || undefined);
    } catch (err: any) {
      setExtractionError(`Replace Error: ${err.message || 'Could not replace duplicate invoice.'}`);
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 text-charcoal-900 font-sans flex flex-col antialiased">
      {/* App Reload Sync Prompt Modal */}
      <ReloadSyncPromptModal
        isOpen={showReloadSyncPrompt}
        onSyncNow={handlePromptSyncNow}
        onSkip={handlePromptSkip}
        isSyncing={isSyncingPrompt}
        errorMessage={promptError}
      />

      {/* Top Application Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedCount={rawLedgerRows.length}
        googleSheetsConnected={!sheetsConnectionLost}
        onConnectSheetsClick={handleConnectGoogleSheets}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSwitchAccount={setActiveAccountId}
        onManageAccounts={() => setShowManageAccounts(true)}
      />

      {showManageAccounts && (
        <ManageAccountsModal
          accounts={accounts}
          onUpdate={setAccounts}
          onClose={() => setShowManageAccounts(false)}
        />
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* If connection is lost and user is on other tabs, show connection lost banner at top */}
        {sheetsConnectionLost && activeTab !== 'intake' && (
          <GoogleSheetsConnect
            recordCount={rawLedgerRows.length}
            onViewDatabaseClick={() => setActiveTab('database')}
            isConnected={false}
            onConnectClick={handleConnectGoogleSheets}
            isConnecting={isSigningIn || isSyncingPrompt}
            hasSyncedThisSession={hasSyncedThisSession}
            onSyncNowClick={handlePromptSyncNow}
            lastSyncedTime={lastSyncedTime}
          />
        )}

        {activeTab === 'intake' ? (
          <div className="space-y-6">
            {/* Top Bar of Tab 1: Google Sheets Connection Status & Reconnect / Sync Control */}
            <GoogleSheetsConnect
              recordCount={rawLedgerRows.length}
              onViewDatabaseClick={() => setActiveTab('database')}
              isConnected={!sheetsConnectionLost}
              onConnectClick={handleConnectGoogleSheets}
              isConnecting={isSigningIn || isSyncingPrompt}
              hasSyncedThisSession={hasSyncedThisSession}
              onSyncNowClick={handlePromptSyncNow}
              lastSyncedTime={lastSyncedTime}
            />

            {/* Top Bar: Upload Invoice */}
            {batchFiles.length === 0 ? (
              <InvoiceUploader
                onFilesUpload={handleBatchUpload}
                isProcessing={isProcessing}
              />
            ) : batchResults.length === 0 ? (
              <BatchProcessor
                files={batchFiles}
                onComplete={handleBatchComplete}
                onCancel={cancelBatch}
              />
            ) : reviewIndex === -1 ? (
              <BatchReviewQueue
                items={batchResults}
                onImportReady={handleImportReady}
                onReviewItem={(index) => loadReviewItem(batchResults[index], index)}
                onCancel={cancelBatch}
                isSaving={isSaving}
                lastReviewedIndex={lastReviewedIndex}
              />
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-sand-200 rounded-2xl p-4 shadow-xs gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleBackToQueue}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-sage-100 hover:bg-sage-200 active:bg-sage-300 text-sage-900 border border-sage-300 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs shrink-0"
                      title="Return to Review Queue list (Press Esc)"
                    >
                      <ArrowLeft className="w-4 h-4 text-sage-700" />
                      <span>Back to Review Queue</span>
                    </button>
                    <div>
                      <h2 className="text-base font-bold text-charcoal-900">
                        Reviewing Invoice {reviewIndex + 1} of {batchResults.length}
                      </h2>
                      <p className="text-xs text-charcoal-500 mt-0.5">
                        Verify AI extracted data before sending to Google Sheets.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const next = reviewIndex - 1;
                        if (next >= 0) loadReviewItem(batchResults[next], next);
                      }}
                      disabled={reviewIndex === 0}
                      className="px-3 py-1.5 text-xs font-bold bg-sand-100 hover:bg-sand-200 text-charcoal-700 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => {
                        const next = reviewIndex + 1;
                        if (next < batchResults.length) loadReviewItem(batchResults[next], next);
                      }}
                      disabled={reviewIndex === batchResults.length - 1}
                      className="px-3 py-1.5 text-xs font-bold bg-sand-100 hover:bg-sand-200 text-charcoal-700 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Skip Next
                    </button>
                    <button
                      onClick={cancelBatch}
                      className="px-3.5 py-1.5 text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg cursor-pointer"
                      title="Exit the entire batch upload flow"
                    >
                      Cancel Batch
                    </button>
                  </div>
                </div>

                {/* Error Message Alert */}
                {extractionError && (
                  <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold">Extraction Error</h4>
                      <p className="text-xs text-rose-700 mt-0.5">{extractionError}</p>
                    </div>
                  </div>
                )}

                {/* SIDE-BY-SIDE VIEW: Invoice Document (Left) & Extracted Form (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Panel: Invoice Previewer (5 cols / ~42%) */}
                  <div className="lg:col-span-5 h-full">
                    <InvoiceViewer
                      fileUrl={fileUrl}
                      filename={filename}
                      fileType={fileType}
                      isProcessing={isProcessing}
                    />
                  </div>

                  {/* Right Panel: Editable Verification Form (7 cols / ~58%) */}
                  <div className="lg:col-span-7 h-full">
                    <ExtractionForm
                      initialData={extractedData}
                      activeAccountName={activeAccount.name}
                      onFormChange={handleFormChange}
                      onAcceptAndSend={async (data) => {
                        await handleAcceptAndSend(data);
                        // Auto-advance
                        if (!isReplacing && !supplierMismatch && !showDuplicateModal) {
                          const next = reviewIndex + 1;
                          if (next < batchResults.length) {
                            loadReviewItem(batchResults[next], next);
                          } else {
                            cancelBatch(); // Done
                          }
                        }
                      }}
                      isSaving={isSaving}
                      saveSuccessMessage={saveSuccessMessage}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'database' ? (
          /* Tab 2: AP Database View (Google Sheet "Invoice Ledger") */
          <DatabaseView
            records={apRecords}
            rawRows={rawLedgerRows}
            headerRow={ledgerHeaderRow}
            googleAccessToken={googleAccessToken}
            onRefresh={fetchAllDataWithToken}
            isRefreshing={isRefreshing || isLoadingMatchLog}
            lastSyncedTime={matchLogLastSynced || lastSyncedTime}
            googleSheetsConnected={!sheetsConnectionLost}
            onConnectSheetsClick={handleConnectGoogleSheets}
            onAddActionLog={handleAddActionLog}
            matchLogMap={matchLogMap}
            matchLogBanner={matchLogBanner}
          />
        ) : (
          /* Tab 3: Manage Ledger View */
          <ManageLedgerView
            rawRows={rawLedgerRows}
            headerRow={ledgerHeaderRow}
            googleAccessToken={googleAccessToken}
            onRefresh={fetchAllDataWithToken}
            isRefreshing={isRefreshing || isLoadingMatchLog}
            lastSyncedTime={matchLogLastSynced || lastSyncedTime}
            actionHistory={actionHistory}
            onAddActionLog={handleAddActionLog}
            onConnectSheetsClick={handleConnectGoogleSheets}
            matchLogMap={matchLogMap}
          />
        )}
      </main>

      {/* Supplier Mismatch Review Modal (Fix 4) */}
      {supplierMismatch && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border-2 border-amber-400">
            <div className="flex items-center gap-3 text-amber-900">
              <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-charcoal-900">
                  ⚠ Supplier Mismatch Detected
                </h3>
                <p className="text-xs text-charcoal-600 font-medium">Cross-check against Purchase Orders tab</p>
              </div>
            </div>

            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-2">
              <div className="space-y-1 font-mono bg-white p-3 rounded-lg border border-amber-200 text-charcoal-800">
                <p><strong>Invoice Number:</strong> {supplierMismatch.verifiedData.invoiceNumber?.value}</p>
                <p><strong>PO Reference:</strong> <span className="text-sage-800 font-bold">{supplierMismatch.poNumber}</span></p>
                <hr className="my-2 border-sand-200" />
                <p><strong>Supplier read from invoice:</strong> <span className="text-rose-700 font-bold">{supplierMismatch.invoiceSupplier}</span></p>
                <p><strong>Supplier on record for PO:</strong> <span className="text-emerald-700 font-bold">{supplierMismatch.poSupplier}</span></p>
              </div>

              {isManualSupplierEditing ? (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-charcoal-900">Enter Correct Supplier Name:</label>
                  <input
                    type="text"
                    value={manualSupplierName}
                    onChange={(e) => setManualSupplierName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-charcoal-600 font-medium pt-1">
                  Which supplier name should be written to the Invoice Ledger?
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {isManualSupplierEditing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsManualSupplierEditing(false)}
                    className="flex-1 py-2.5 bg-sand-100 text-charcoal-800 font-bold text-xs uppercase rounded-xl border border-sand-300 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const updated = { ...supplierMismatch.verifiedData };
                      const dateStr = new Date().toISOString().split('T')[0];
                      updated.supplierName = { value: manualSupplierName, confidence: 'High' };
                      updated.extractionNotes =
                        (updated.extractionNotes || '') +
                        `\nSupplier mismatch resolved: manually edited to '${manualSupplierName}' on ${dateStr}.`;
                      setSupplierMismatch(null);
                      setIsManualSupplierEditing(false);
                      await proceedWithVerifiedData(updated);
                    }}
                    className="flex-1 py-2.5 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs uppercase rounded-xl cursor-pointer"
                  >
                    Save &amp; Continue
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const updated = { ...supplierMismatch.verifiedData };
                      const dateStr = new Date().toISOString().split('T')[0];
                      updated.supplierName = { value: supplierMismatch.invoiceSupplier, confidence: 'High' };
                      updated.extractionNotes =
                        (updated.extractionNotes || '') +
                        `\nSupplier mismatch resolved: chose invoice value ('${supplierMismatch.invoiceSupplier}') on ${dateStr}.`;
                      setSupplierMismatch(null);
                      await proceedWithVerifiedData(updated);
                    }}
                    className="py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>Use invoice value ({supplierMismatch.invoiceSupplier})</span>
                    <span className="text-[10px] opacity-80 uppercase font-sans">&larr; trust extraction</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const updated = { ...supplierMismatch.verifiedData };
                      const dateStr = new Date().toISOString().split('T')[0];
                      updated.supplierName = { value: supplierMismatch.poSupplier, confidence: 'High' };
                      updated.extractionNotes =
                        (updated.extractionNotes || '') +
                        `\nSupplier mismatch resolved: chose PO record ('${supplierMismatch.poSupplier}') on ${dateStr}.`;
                      setSupplierMismatch(null);
                      await proceedWithVerifiedData(updated);
                    }}
                    className="py-2.5 px-3 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs rounded-xl transition-colors text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>Use PO record ({supplierMismatch.poSupplier})</span>
                    <span className="text-[10px] opacity-80 uppercase font-sans">&larr; trust master data</span>
                  </button>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsManualSupplierEditing(true)}
                      className="flex-1 py-2 px-3 bg-sand-100 hover:bg-sand-200 text-charcoal-800 font-bold text-xs rounded-xl border border-sand-300 transition-colors text-center cursor-pointer"
                    >
                      Let me edit manually
                    </button>

                    <button
                      type="button"
                      onClick={() => setSupplierMismatch(null)}
                      className="flex-1 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs rounded-xl border border-rose-200 transition-colors text-center cursor-pointer"
                    >
                      Cancel this upload
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Invoice Warning Modal */}
      {showDuplicateModal && pendingData && (
        <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border-2 border-amber-400">
            <div className="flex items-center gap-3 text-amber-900">
              <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-charcoal-900">⚠ Possible Duplicate Invoice</h3>
                <p className="text-xs text-charcoal-600 font-medium">Invoice Ledger Duplicate Check</p>
              </div>
            </div>

            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-3">
              <p className="font-bold text-amber-900 text-sm">
                Invoice {pendingData.invoiceNumber?.value} from {pendingData.supplierName?.value} already exists in the ledger.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-1 text-charcoal-800">
                  <p className="font-bold text-[11px] text-amber-800 uppercase tracking-wide">Already in ledger:</p>
                  <p><strong>Extracted:</strong> {duplicateMeta?.extractedAt ? duplicateMeta.extractedAt.slice(0, 16) : 'N/A'}</p>
                  <p><strong>Grand Total:</strong> ${duplicateMeta?.existingGrandTotal?.toFixed(2) || '0.00'}</p>
                  <p><strong>Status:</strong> <span className="font-bold text-charcoal-900">{duplicateMeta?.existingStatus || 'Pending Match'}</span></p>
                </div>

                <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-1 text-charcoal-800">
                  <p className="font-bold text-[11px] text-sage-800 uppercase tracking-wide">You're trying to add:</p>
                  <p><strong>Invoice Number:</strong> {pendingData.invoiceNumber?.value}</p>
                  <p><strong>Supplier:</strong> {pendingData.supplierName?.value}</p>
                  <p><strong>Grand Total:</strong> ${pendingData.grandTotal?.value?.toFixed?.(2) || pendingData.grandTotal?.value}</p>
                </div>
              </div>

              {duplicateMeta?.amountsDiffer && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>⚠ Amount differs from existing record (Existing: ${duplicateMeta.existingGrandTotal?.toFixed(2)}, New: ${duplicateMeta.newGrandTotal?.toFixed(2)})</span>
                </div>
              )}

              {duplicateMeta?.hasBeenMatched && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 space-y-1">
                  <p className="font-bold">
                    ⚠ This invoice has already been reviewed by App 2 with status: {duplicateMeta.existingStatus}. Uploading again may cause confusion in the matching workflow. Recommend Cancel unless you know this is a genuine correction.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold text-charcoal-900">What would you like to do?</p>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setPendingData(null);
                    setDuplicateMeta(null);
                  }}
                  disabled={isReplacing || isSaving}
                  className="flex-1 py-2.5 px-3 bg-sand-100 hover:bg-sand-200 text-charcoal-800 font-bold text-xs uppercase rounded-xl border border-sand-300 transition-colors cursor-pointer text-center"
                >
                  Cancel Upload
                </button>

                <button
                  type="button"
                  onClick={handleReplaceDuplicate}
                  disabled={isReplacing || isSaving}
                  className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 text-center"
                >
                  {isReplacing ? 'Replacing...' : 'Replace Existing'}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const dataToAppend = pendingData;
                    setShowDuplicateModal(false);
                    setPendingData(null);
                    setDuplicateMeta(null);
                    if (dataToAppend) {
                      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
                      handleAddActionLog({
                        timestamp: nowStr,
                        description: `Appended duplicate invoice ${dataToAppend.invoiceNumber?.value} (${dataToAppend.supplierName?.value})`,
                        type: 'add',
                      });
                      await executeAppendToSheet(dataToAppend, { allowDuplicate: true });
                    }
                  }}
                  disabled={isReplacing || isSaving}
                  className="flex-1 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase rounded-xl shadow-xs transition-colors cursor-pointer text-center"
                >
                  Add Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saveSuccessMessage && (
        <div id="app-wide-toast" className="fixed bottom-6 right-6 z-50 bg-emerald-800 text-white px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn border border-emerald-600 max-w-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-white text-xs">{saveSuccessMessage}</p>
          </div>
          <button
            onClick={() => setSaveSuccessMessage(null)}
            className="text-white/70 hover:text-white ml-2 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-sand-100 border-t border-sand-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-charcoal-600 font-medium">
          <p>
            &copy; 2026 Boon Huat Hardware Pte Ltd &bull; Target Sheet: <strong className="text-charcoal-900 font-bold">Boon Huat AP Master Data</strong> &rarr; <strong className="text-sage-800 font-bold underline">Invoice Ledger</strong>
          </p>
        </div>
      </footer>
    </div>
  );
}

