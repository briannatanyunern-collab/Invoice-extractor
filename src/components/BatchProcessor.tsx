import React, { useState, useEffect } from 'react';
import { ExtractedInvoiceData } from '../types';
import { FileText, CheckCircle2, AlertCircle, XCircle, RefreshCw, Loader2, Send } from 'lucide-react';

export interface BatchItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'duplicate' | 'supplier_mismatch';
  data?: ExtractedInvoiceData;
  error?: string;
  poMatchDetails?: any;
}

interface BatchProcessorProps {
  files: File[];
  onComplete: (results: BatchItem[]) => void;
  onCancel: () => void;
}

export const BatchProcessor: React.FC<BatchProcessorProps> = ({ files, onComplete, onCancel }) => {
  const [items, setItems] = useState<BatchItem[]>(
    files.map((f, i) => ({ id: `batch-${i}-${Date.now()}`, file: f, status: 'pending' }))
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    startBatch(items.filter(i => i.status === 'pending' || i.status === 'failed'));
  }, []);

  const startBatch = async (itemsToProcess: BatchItem[]) => {
    if (itemsToProcess.length === 0) return;
    setIsProcessing(true);

    // Concurrency of 1 (SEQUENTIAL)
    const queue = [...itemsToProcess];
    const active = new Set<Promise<void>>();
    
    const processItem = async (item: BatchItem) => {
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'processing', error: undefined } : p));
      
      try {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = () => reject(new Error('File read error'));
          reader.readAsDataURL(item.file);
        });

        const mime = item.file.type || 'image/png';
        const response = await fetch('/api/extract-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data, mimeType: mime }),
        });

        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and retry.');
        }

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to extract invoice.');
        }

        setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'success', data: data.extractedData } : p));
      } catch (err: any) {
        setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'failed', error: err.message } : p));
      }
    };

    while (queue.length > 0) {
      if (active.size >= 1) {
        await Promise.race(active);
      }
      const nextItem = queue.shift();
      if (nextItem) {
        const p = processItem(nextItem).then(() => { active.delete(p); });
        active.add(p);
      }
    }
    await Promise.all(active);
    
    // Once extraction is done, pass back to App to do the local matching pass
    setIsProcessing(false);
    setIsDone(true);
  };

  const handleRetryFailed = () => {
    const failed = items.filter(i => i.status === 'failed');
    if (failed.length > 0) {
      setIsDone(false);
      startBatch(failed);
    }
  };

  const handleContinue = () => {
    onComplete(items);
  };

  const successCount = items.filter(i => i.status === 'success').length;
  const failCount = items.filter(i => i.status === 'failed').length;
  const processingCount = items.filter(i => i.status === 'processing').length;

  return (
    <div className="bg-white border border-sand-200 rounded-2xl p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-sand-100">
        <div>
          <h2 className="text-base font-bold text-charcoal-900 flex items-center gap-2">
            <Loader2 className={`w-5 h-5 text-sage-600 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>Batch Invoice Processing</span>
          </h2>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Processing {items.length} file(s). Rotating AI models for maximum throughput.
          </p>
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between p-3 bg-cream-100 border border-sand-200 rounded-xl">
            <div className="flex items-center gap-3 overflow-hidden">
              <FileText className="w-5 h-5 text-sage-500 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-bold text-charcoal-900 truncate">{item.file.name}</p>
                {item.error && <p className="text-xs text-rose-600 truncate">{item.error}</p>}
                {item.status === 'success' && item.data && (
                  <p className="text-xs text-sage-700 truncate">
                    {item.data.supplierName?.value} - {item.data.invoiceNumber?.value}
                  </p>
                )}
              </div>
            </div>
            <div className="shrink-0 ml-4">
              {item.status === 'pending' && <span className="text-xs text-charcoal-500 font-semibold px-2 py-1 bg-sand-200 rounded-md">Pending</span>}
              {item.status === 'processing' && <span className="text-xs text-blue-700 font-semibold px-2 py-1 bg-blue-100 border border-blue-200 rounded-md flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Processing</span>}
              {item.status === 'success' && <span className="text-xs text-sage-800 font-semibold px-2 py-1 bg-sage-200 border border-sage-300 rounded-md flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Success</span>}
              {item.status === 'failed' && <span className="text-xs text-rose-800 font-semibold px-2 py-1 bg-rose-100 border border-rose-200 rounded-md flex items-center gap-1"><XCircle className="w-3 h-3"/> Failed</span>}
            </div>
          </div>
        ))}
      </div>

      {isDone && (
        <div className="pt-4 border-t border-sand-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm font-semibold text-charcoal-800">
            {successCount} Successful • {failCount} Failed
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {failCount > 0 && (
              <button onClick={handleRetryFailed} className="flex-1 sm:flex-none py-2 px-4 bg-sand-200 hover:bg-sand-300 text-charcoal-900 font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer">
                Retry Failed
              </button>
            )}
            <button onClick={handleContinue} className="flex-1 sm:flex-none py-2 px-6 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
              <span>Review Results</span>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
