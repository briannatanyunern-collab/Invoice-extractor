import React, { useRef, useState } from 'react';
import { Upload, FileText, Camera, FileUp, AlertTriangle } from 'lucide-react';

interface InvoiceUploaderProps {
  onFilesUpload: (files: File[]) => void;
  isProcessing: boolean;
}

export const InvoiceUploader: React.FC<InvoiceUploaderProps> = ({ onFilesUpload, isProcessing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [limitError, setLimitError] = useState<string | null>(null);

  const processSelectedFiles = (selectedFiles: FileList | File[]) => {
    const filesArray = Array.from(selectedFiles);
    const N = filesArray.length;
    if (N > 10) {
      const overage = N - 10;
      const msg = `⚠ Maximum 10 invoices per batch. You selected ${N}. Please remove ${overage} file(s) or split this into smaller batches.`;
      setLimitError(msg);
      return;
    }
    setLimitError(null);
    onFilesUpload(filesArray);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="bg-white border border-sand-200 rounded-2xl p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-sand-100">
        <div>
          <h2 className="text-base font-bold text-charcoal-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-sage-600" />
            <span>Upload Invoice Documents (Batch)</span>
          </h2>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Accepts PDF, PNG, JPG. Select up to 10 invoices at once.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-charcoal-700">
          <span className="inline-flex items-center gap-1 bg-sage-100 text-sage-800 px-2.5 py-1 rounded-md border border-sage-200">
            <Camera className="w-3.5 h-3.5 text-sage-600" />
            Handwritten OK
          </span>
          <span className="inline-flex items-center gap-1 bg-sand-100 text-charcoal-800 px-2.5 py-1 rounded-md border border-sand-200">
            <FileText className="w-3.5 h-3.5 text-sage-600" />
            PDF &amp; Scans
          </span>
        </div>
      </div>

      {limitError && (
        <div className="bg-amber-50 border-2 border-amber-400 text-amber-950 p-4 rounded-xl flex items-start gap-3 shadow-xs animate-in fade-in zoom-in-95 duration-150">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-sm text-amber-900">{limitError}</p>
            <p className="text-xs text-amber-800">
              To ensure optimal extraction accuracy and processing speed for Madam Lim, batch uploads are capped at 10 files.
            </p>
          </div>
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
          isProcessing
            ? 'bg-sage-50/70 border-sage-300'
            : 'bg-sand-100/60 hover:bg-sand-100 border-sand-300 hover:border-sage-500'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/png,image/jpeg,image/jpg,application/pdf"
          className="hidden"
          multiple
        />

        <div className="w-14 h-14 rounded-2xl bg-sage-100 text-sage-700 flex items-center justify-center mb-3 shadow-xs">
          <FileUp className="w-7 h-7" />
        </div>

        <p className="text-sm font-bold text-charcoal-900">
          Click to upload invoices or drag &amp; drop
        </p>
        <p className="text-xs text-charcoal-500 mt-1">
          Select up to 10 invoices at once (PDF, JPG, PNG)
        </p>

        <button
          type="button"
          className="mt-4 px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Select Files (Max 10)</span>
        </button>
      </div>
    </div>
  );
};
