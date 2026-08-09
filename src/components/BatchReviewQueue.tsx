import React, { useState } from 'react';
import { BatchItem } from './BatchProcessor';
import { ExtractedInvoiceData } from '../types';
import { FileText, CheckCircle2, AlertTriangle, XCircle, Send, FileEdit } from 'lucide-react';

interface BatchReviewQueueProps {
  items: BatchItem[];
  onImportReady: (readyItems: BatchItem[]) => void;
  onReviewItem: (index: number) => void;
  onCancel: () => void;
  isSaving: boolean;
  lastReviewedIndex?: number | null;
}

export const BatchReviewQueue: React.FC<BatchReviewQueueProps> = ({ items, onImportReady, onReviewItem, onCancel, isSaving, lastReviewedIndex }) => {
  const getStatus = (item: BatchItem) => {
    if (item.status === 'failed') return 'failed';
    const data = item.data;
    if (!data) return 'failed';
    
    // Check for low confidence or N/A
    const hasLowConfidence = Object.values(data).some((field: any) => field?.confidence === 'Low');
    const hasMissing = !data.invoiceNumber?.value || data.invoiceNumber?.value === 'N/A' || !data.supplierName?.value || data.supplierName?.value === 'N/A';
    
    if (hasLowConfidence || hasMissing || item.status === 'duplicate' || item.status === 'supplier_mismatch') {
      return 'needs_attention';
    }
    
    return 'ready';
  };

  const readyItems = items.filter(i => getStatus(i) === 'ready');
  const attentionItems = items.filter(i => getStatus(i) === 'needs_attention');
  const failedItems = items.filter(i => getStatus(i) === 'failed');

  return (
    <div className="bg-white border border-sand-200 rounded-2xl p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-sand-100">
        <div>
          <h2 className="text-base font-bold text-charcoal-900">
            Batch Review Queue
          </h2>
          <p className="text-xs text-charcoal-500 mt-0.5">
            {items.length} invoices processed. Review and import.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="p-3 bg-sage-50 border border-sage-200 rounded-xl">
          <div className="flex items-center gap-2 text-sage-800 font-bold mb-1">
            <CheckCircle2 className="w-4 h-4" /> Ready
          </div>
          <p className="text-2xl font-black text-sage-900">{readyItems.length}</p>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 text-amber-800 font-bold mb-1">
            <AlertTriangle className="w-4 h-4" /> Needs Attention
          </div>
          <p className="text-2xl font-black text-amber-900">{attentionItems.length}</p>
        </div>
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <div className="flex items-center gap-2 text-rose-800 font-bold mb-1">
            <XCircle className="w-4 h-4" /> Failed
          </div>
          <p className="text-2xl font-black text-rose-900">{failedItems.length}</p>
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {items.map((item, index) => {
          const status = getStatus(item);
          const data = item.data;
          const isRecentlyReviewed = lastReviewedIndex === index;
          return (
            <div
              key={item.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-xl gap-4 transition-all ${
                isRecentlyReviewed
                  ? 'bg-sage-50/80 border-sage-400 shadow-xs ring-1 ring-sage-400/50'
                  : 'bg-cream-100 border-sand-200'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <FileText className="w-5 h-5 text-sage-500 shrink-0" />
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-charcoal-900 truncate">
                      {data ? `${data.supplierName?.value} - ${data.invoiceNumber?.value}` : item.file.name}
                    </p>
                    {isRecentlyReviewed && (
                      <span className="text-[10px] uppercase font-extrabold tracking-wider bg-sage-200 text-sage-800 px-1.5 py-0.5 rounded-md shrink-0">
                        Last Viewed
                      </span>
                    )}
                  </div>
                  {data && (
                    <p className="text-xs text-charcoal-500 truncate">
                      Grand Total: ${data.grandTotal?.value}
                    </p>
                  )}
                  {item.error ? (
                    <p className="text-xs text-rose-600 font-semibold truncate">{item.error}</p>
                  ) : (
                    (() => {
                      if (!data) return null;
                      const hasLowConfidence = Object.values(data).some((field: any) => field?.confidence === 'Low');
                      const hasMissing = !data.invoiceNumber?.value || data.invoiceNumber?.value === 'N/A' || !data.supplierName?.value || data.supplierName?.value === 'N/A';
                      if (hasMissing) {
                        return <p className="text-xs text-amber-600 font-semibold truncate">⚠ Needs Attention: Missing critical fields (Invoice # or Supplier Name).</p>;
                      }
                      if (hasLowConfidence) {
                        return <p className="text-xs text-amber-600 font-semibold truncate">⚠ Needs Attention: Low extraction confidence in some fields.</p>;
                      }
                      return null;
                    })()
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                {status === 'ready' && <span className="text-xs text-sage-800 font-semibold px-2 py-1 bg-sage-200 border border-sage-300 rounded-md flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Ready</span>}
                {status === 'needs_attention' && <span className="text-xs text-amber-800 font-semibold px-2 py-1 bg-amber-100 border border-amber-300 rounded-md flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Needs Attention</span>}
                {status === 'failed' && <span className="text-xs text-rose-800 font-semibold px-2 py-1 bg-rose-100 border border-rose-200 rounded-md flex items-center gap-1"><XCircle className="w-3 h-3"/> Failed</span>}
                
                {status !== 'failed' && (
                  <button onClick={() => onReviewItem(index)} className="px-3 py-1.5 bg-white border border-sand-300 hover:border-sage-500 rounded-md text-xs font-bold text-charcoal-800 flex items-center gap-1.5 transition-colors">
                    <FileEdit className="w-3.5 h-3.5" />
                    Review
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-sand-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <button onClick={onCancel} className="w-full sm:w-auto py-2.5 px-5 bg-sand-200 hover:bg-sand-300 text-charcoal-800 font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer">
          Cancel Batch
        </button>
        <button 
          onClick={() => onImportReady(readyItems)} 
          disabled={readyItems.length === 0 || isSaving}
          className="w-full sm:w-auto py-2.5 px-6 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span>Import {readyItems.length} Ready</span>
        </button>
      </div>
    </div>
  );
};
