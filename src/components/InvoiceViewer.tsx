import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  FileText,
  Eye,
  CheckCircle,
  FileCheck
} from 'lucide-react';

interface InvoiceViewerProps {
  fileUrl: string | null;
  filename: string;
  fileType: string;
  isProcessing?: boolean;
}

export const InvoiceViewer: React.FC<InvoiceViewerProps> = ({
  fileUrl,
  filename,
  fileType,
  isProcessing = false,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showHighlights, setShowHighlights] = useState<boolean>(true);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleResetZoom = () => setZoom(100);

  if (!fileUrl) {
    return (
      <div className="h-full min-h-[480px] bg-sand-100/60 border-2 border-dashed border-sand-300 rounded-2xl flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-sand-200 text-charcoal-500 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-sage-600" />
        </div>
        <h3 className="text-lg font-bold text-charcoal-900">No Document Loaded</h3>
        <p className="text-sm text-charcoal-500 max-w-sm mt-1">
          Upload an invoice above to view the original file side-by-side.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`bg-sand-100 border border-sand-200 rounded-2xl flex flex-col overflow-hidden shadow-sm transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 rounded-2xl' : 'h-full min-h-[600px]'
      }`}
    >
      {/* Viewer Toolbar */}
      <div className="bg-sand-200/90 border-b border-sand-300 px-4 py-2.5 flex items-center justify-between text-charcoal-900 text-xs select-none">
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <FileCheck className="w-4 h-4 text-sage-600 shrink-0" />
          <span className="font-semibold truncate max-w-[200px]" title={filename}>
            {filename || 'Uploaded_Invoice.pdf'}
          </span>
          <span className="bg-white text-charcoal-700 border border-sand-300 text-[10px] font-mono px-2 py-0.5 rounded uppercase shrink-0">
            {fileType || 'Image'}
          </span>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHighlights(!showHighlights)}
            className={`px-2.5 py-1 rounded font-medium text-xs flex items-center gap-1 transition-colors ${
              showHighlights ? 'bg-sage-600 text-white shadow-xs' : 'bg-white border border-sand-300 text-charcoal-700 hover:bg-sand-100'
            }`}
            title="Toggle AI Extracted Region Highlights"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Highlights</span>
          </button>

          <div className="h-4 w-px bg-sand-300 mx-1"></div>

          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-sand-300/60 rounded text-charcoal-700 hover:text-charcoal-900 transition-colors"
            title="Zoom Out (-25%)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-charcoal-900 w-12 text-center text-xs font-bold">
            {zoom}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-sand-300/60 rounded text-charcoal-700 hover:text-charcoal-900 transition-colors"
            title="Zoom In (+25%)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1.5 hover:bg-sand-300/60 rounded text-charcoal-700 hover:text-charcoal-900 transition-colors ml-1"
            title="Reset Zoom (100%)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 hover:bg-sand-300/60 rounded text-charcoal-700 hover:text-charcoal-900 transition-colors ml-1"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 bg-cream-100/80 overflow-auto p-4 flex items-center justify-center relative min-h-[520px]">
        {isProcessing && (
          <div className="absolute inset-0 bg-sand-100/80 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 border-4 border-sage-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <h4 className="text-charcoal-900 font-bold text-base">Gemini Multimodal Scanning...</h4>
            <p className="text-charcoal-500 text-xs mt-1 max-w-xs">
              Reading printed/handwritten fields, line items, and totals.
            </p>
          </div>
        )}

        <div
          className="transition-transform duration-150 ease-out relative shadow-md rounded-sm bg-white overflow-hidden max-w-none border border-sand-300"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
        >
          {fileUrl.startsWith('data:image') ||
          fileUrl.endsWith('.png') ||
          fileUrl.endsWith('.jpg') ||
          fileUrl.endsWith('.jpeg') ||
          fileType.includes('image') ||
          fileType.includes('svg') ? (
            <div className="relative">
              <img
                src={fileUrl}
                alt="Invoice Document Preview"
                className="max-w-none object-contain block"
                style={{ width: '680px' }}
              />

              {/* AI Detection Overlay Highlight Boxes */}
              {showHighlights && !isProcessing && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Vendor Overlay */}
                  <div className="absolute top-[4%] left-[4%] width-[50%] height-[12%] border-2 border-sage-600/70 bg-sage-500/10 rounded px-1.5 py-0.5 text-[9px] font-bold text-sage-900 bg-white/90 shadow-xs flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-sage-600" />
                    Vendor Info Read
                  </div>
                  {/* Inv # Box */}
                  <div className="absolute top-[5%] right-[4%] width-[30%] height-[14%] border-2 border-sage-600/70 bg-sage-500/10 rounded px-1.5 py-0.5 text-[9px] font-bold text-sage-900 bg-white/90 shadow-xs flex items-center gap-1">
                    Invoice # &amp; Date
                  </div>
                  {/* Table Box */}
                  <div className="absolute top-[22%] left-[4%] right-[4%] height-[45%] border-2 border-sage-600/70 bg-sage-500/10 rounded px-2 py-1 text-[10px] font-bold text-sage-900 bg-white/90 shadow-xs flex items-start gap-1">
                    Line Items Extracted
                  </div>
                  {/* Totals Box */}
                  <div className="absolute bottom-[10%] right-[4%] width-[35%] height-[18%] border-2 border-sage-600/70 bg-sage-500/10 rounded px-2 py-1 text-[10px] font-bold text-sage-900 bg-white/90 shadow-xs">
                    Totals &amp; GST 7%
                  </div>
                </div>
              )}
            </div>
          ) : (
            <iframe
              src={fileUrl}
              title="PDF Invoice Preview"
              className="w-[680px] h-[880px] border-none bg-white"
            />
          )}
        </div>
      </div>

      {/* Footer Helper Note */}
      <div className="bg-sand-200/90 border-t border-sand-300 px-4 py-2 text-[11px] text-charcoal-500 flex items-center justify-between">
        <span>Tip: Use zoom controls above to inspect fine print or handwritten notes clearly.</span>
        <span className="font-mono text-charcoal-700">Side-by-Side Review Mode</span>
      </div>
    </div>
  );
};
