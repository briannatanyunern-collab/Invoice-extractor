import React, { useState, useEffect } from 'react';
import {
  ExtractedInvoiceData,
  LineItem,
  ConfidenceLevel,
  FieldWithConfidence
} from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import {
  CheckCircle2,
  Plus,
  Trash2,
  Calculator,
  Send,
  FileSpreadsheet,
  Building,
  Calendar,
  Hash,
  MapPin,
  Clock,
  Sparkles,
  Info,
  Check,
  AlertCircle
} from 'lucide-react';

interface ExtractionFormProps {
  initialData: ExtractedInvoiceData | null;
  onAcceptAndSend: (verifiedData: ExtractedInvoiceData) => Promise<void>;
  onFormChange?: (formData: ExtractedInvoiceData) => void;
  isSaving: boolean;
  saveSuccessMessage?: string | null;
  submitButtonLabel?: string;
  isManualAdd?: boolean;
  formTitle?: string;
  onCancel?: () => void;
  showPaymentFields?: boolean;
  activeAccountName?: string;
  dueDateWarningBannerMessage?: string | null;
}

export const ExtractionForm: React.FC<ExtractionFormProps> = ({
  initialData,
  onAcceptAndSend,
  onFormChange,
  isSaving,
  saveSuccessMessage,
  submitButtonLabel = 'Accept & Send to Matching',
  isManualAdd = false,
  formTitle,
  onCancel,
  showPaymentFields = false,
  dueDateWarningBannerMessage,
  activeAccountName,
}) => {
  // Form State
  const [formData, setFormData] = useState<ExtractedInvoiceData | null>(initialData);
  const [autoCalculateGST, setAutoCalculateGST] = useState<boolean>(true);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const updateFormData = (newForm: ExtractedInvoiceData) => {
    setFormData(newForm);
    if (onFormChange) {
      onFormChange(newForm);
    }
  };

  if (!formData) {
    return (
      <div className="h-full min-h-[480px] bg-white border border-sand-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-xs">
        <div className="w-16 h-16 rounded-full bg-sage-100 text-sage-600 flex items-center justify-center mb-4 border border-sage-200">
          <Sparkles className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-charcoal-900">Awaiting Invoice Extraction</h3>
        <p className="text-sm text-charcoal-500 max-w-sm mt-1">
          Upload an invoice file to extract fields automatically.
        </p>
      </div>
    );
  }

  // Handle Simple Field Changes
  const handleFieldChange = (
    fieldKey: keyof ExtractedInvoiceData,
    newValue: any
  ) => {
    if (!formData) return;
    const current = formData[fieldKey] as FieldWithConfidence<any>;
    const updated: ExtractedInvoiceData = {
      ...formData,
      [fieldKey]: {
        ...current,
        value: newValue,
      },
    };
    updateFormData(updated);
  };

  // Handle Line Item Updates & Auto-calculate Totals
  const handleLineItemChange = (
    index: number,
    field: keyof LineItem,
    val: any
  ) => {
    if (!formData) return;
    const updatedItems = [...formData.lineItems];
    const currentItem = { ...updatedItems[index] };

    if (field === 'quantity') {
      currentItem.quantity = Math.max(0, parseFloat(val) || 0);
      currentItem.lineTotal = parseFloat((currentItem.quantity * currentItem.unitPrice).toFixed(2));
    } else if (field === 'unitPrice') {
      currentItem.unitPrice = Math.max(0, parseFloat(val) || 0);
      currentItem.lineTotal = parseFloat((currentItem.quantity * currentItem.unitPrice).toFixed(2));
    } else if (field === 'lineTotal') {
      currentItem.lineTotal = parseFloat(val) || 0;
    } else if (field === 'description') {
      currentItem.description = val;
    }

    updatedItems[index] = currentItem;

    // Recalculate Subtotal, GST, Grand Total
    const newSubtotal = updatedItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    const newGst = autoCalculateGST ? parseFloat((newSubtotal * 0.07).toFixed(2)) : formData.gstAmount.value;
    const newGrandTotal = parseFloat((newSubtotal + newGst).toFixed(2));

    const updated: ExtractedInvoiceData = {
      ...formData,
      lineItems: updatedItems,
      subtotal: { ...formData.subtotal, value: newSubtotal },
      gstAmount: { ...formData.gstAmount, value: newGst },
      grandTotal: { ...formData.grandTotal, value: newGrandTotal },
    };
    updateFormData(updated);
  };

  const handleAddLineItem = () => {
    if (!formData) return;
    const newItem: LineItem = {
      id: `item-new-${Date.now()}`,
      description: 'New Hardware Item',
      quantity: 1,
      unitPrice: 0,
      lineTotal: 0,
    };
    const updated: ExtractedInvoiceData = {
      ...formData,
      lineItems: [...formData.lineItems, newItem],
    };
    updateFormData(updated);
  };

  const handleDeleteLineItem = (index: number) => {
    if (!formData) return;
    const updatedItems = formData.lineItems.filter((_, i) => i !== index);
    const newSubtotal = updatedItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    const newGst = autoCalculateGST ? parseFloat((newSubtotal * 0.07).toFixed(2)) : formData.gstAmount.value;
    const newGrandTotal = parseFloat((newSubtotal + newGst).toFixed(2));

    const updated: ExtractedInvoiceData = {
      ...formData,
      lineItems: updatedItems,
      subtotal: { ...formData.subtotal, value: newSubtotal },
      gstAmount: { ...formData.gstAmount, value: newGst },
      grandTotal: { ...formData.grandTotal, value: newGrandTotal },
    };
    updateFormData(updated);
  };

  const handleRecalculateTotals = () => {
    if (!formData) return;
    const newSubtotal = formData.lineItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    const newGst = parseFloat((newSubtotal * 0.07).toFixed(2));
    const newGrandTotal = parseFloat((newSubtotal + newGst).toFixed(2));

    setFormData({
      ...formData,
      subtotal: { ...formData.subtotal, value: newSubtotal },
      gstAmount: { ...formData.gstAmount, value: newGst },
      grandTotal: { ...formData.grandTotal, value: newGrandTotal },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    
    const finalData = { ...formData };
    if (JSON.stringify(formData) !== JSON.stringify(initialData) && activeAccountName) {
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
      finalData.extractionNotes = (finalData.extractionNotes || '') + `\n[Edited by ${activeAccountName} at ${timestamp}]`;
    }
    
    await onAcceptAndSend(finalData);
  };

  return (
    <div className="bg-white border border-sand-200 rounded-2xl shadow-xs flex flex-col h-full">
      {/* Header Bar */}
      <div className="bg-sand-100/60 border-b border-sand-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-charcoal-900 flex items-center gap-2">
            <span>{formTitle || 'Verified Extraction Form'}</span>
            <span className="text-xs bg-sage-100 text-sage-800 font-semibold px-2.5 py-0.5 rounded-full border border-sage-200">
              {isManualAdd ? 'Manual Entry' : 'Editable Review'}
            </span>
          </h2>
          <p className="text-xs text-charcoal-600 font-medium mt-0.5">
            Writing to: <strong className="text-charcoal-900">Boon Huat AP Master Data</strong> &rarr; <strong className="text-sage-800 underline font-bold">Invoice Ledger</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-charcoal-700 hover:text-charcoal-900 bg-sand-200 hover:bg-sand-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleRecalculateTotals}
            className="text-xs font-semibold text-sage-800 hover:text-sage-900 bg-sage-100 hover:bg-sage-200 border border-sage-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Recalculate Subtotal, GST and Grand Total"
          >
            <Calculator className="w-3.5 h-3.5 text-sage-600" />
            <span>Recalc Totals</span>
          </button>
        </div>
      </div>

      {/* Main Form Content */}
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
        {/* FIX 4: Warning Banner for missing / repaired due date */}
        {dueDateWarningBannerMessage && (
          <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-950 text-xs font-medium flex items-start gap-2.5 shadow-xs">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {dueDateWarningBannerMessage}
            </p>
          </div>
        )}
        {/* Success Banner */}
        {saveSuccessMessage && (
          <div className="p-4 bg-sage-50 border-2 border-sage-400 rounded-xl text-sage-900 flex items-start gap-3 animate-fadeIn shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-sage-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">{saveSuccessMessage}</p>
              <p className="text-xs text-sage-700 mt-0.5">
                Appended directly to sheet <strong>Boon Huat AP Master Data</strong> &rarr; tab{' '}
                <strong>Invoice Ledger</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Section 1: Supplier & Invoice Identifiers */}
        <div className="bg-cream-100/80 border border-sand-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-sand-200">
            <h3 className="text-xs font-bold uppercase tracking-widest text-sage-600 flex items-center gap-2">
              <Building className="w-4 h-4 text-sage-600" />
              <span>Supplier &amp; Document Info</span>
            </h3>
            <span className="text-[11px] text-charcoal-500 font-medium">
              *Confidence based on visual readability
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supplier Name */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-charcoal-500 flex items-center gap-1">
                  Supplier Name
                </label>
                <ConfidenceBadge level={formData.supplierName.confidence} fieldName="Supplier Name" />
              </div>
              <input
                type="text"
                value={formData.supplierName.value}
                onChange={(e) => handleFieldChange('supplierName', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-sage-500 font-semibold text-charcoal-900 shadow-2xs"
                required
              />
            </div>

            {/* Invoice Number */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-charcoal-500 flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-charcoal-500" />
                  Invoice Number
                </label>
                <ConfidenceBadge level={formData.invoiceNumber.confidence} fieldName="Invoice Number" />
              </div>
              <input
                type="text"
                value={formData.invoiceNumber.value}
                onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-sage-500 font-mono font-bold text-charcoal-900 shadow-2xs"
                required
              />
            </div>

            {/* Supplier Address */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-charcoal-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-charcoal-500" />
                  Supplier Address
                </label>
                <ConfidenceBadge level={formData.supplierAddress.confidence} fieldName="Supplier Address" />
              </div>
              <input
                type="text"
                value={formData.supplierAddress.value}
                onChange={(e) => handleFieldChange('supplierAddress', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-sand-200 rounded-lg focus:ring-2 focus:ring-sage-500 text-charcoal-900 shadow-2xs"
              />
            </div>

            {/* Invoice Date */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-charcoal-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-charcoal-500" />
                  Invoice Date
                </label>
                <ConfidenceBadge level={formData.invoiceDate.confidence} fieldName="Invoice Date" />
              </div>
              <input
                type="text"
                value={formData.invoiceDate.value}
                onChange={(e) => handleFieldChange('invoiceDate', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg focus:ring-2 focus:ring-sage-500 text-charcoal-900 shadow-2xs font-medium"
              />
            </div>

            {/* PO Reference */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-charcoal-500 flex items-center gap-1">
                  PO Reference
                </label>
                <ConfidenceBadge level={formData.poReference.confidence} fieldName="PO Reference" />
              </div>
              <input
                type="text"
                value={formData.poReference.value}
                onChange={(e) => handleFieldChange('poReference', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg focus:ring-2 focus:ring-sage-500 text-sage-800 font-bold shadow-2xs"
                placeholder="e.g. PO-BH-0412"
              />
            </div>

            {/* Payment Terms & Payment Due Date (Shown ONLY in Manage Ledger Edit Form) */}
            {showPaymentFields && (
              <>
                {/* Payment Terms */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-charcoal-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-charcoal-500" />
                      Payment Terms
                    </label>
                    <ConfidenceBadge level={formData.paymentTerms.confidence} fieldName="Payment Terms" />
                  </div>
                  <input
                    type="text"
                    value={formData.paymentTerms.value}
                    onChange={(e) => handleFieldChange('paymentTerms', e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg focus:ring-2 focus:ring-sage-500 text-charcoal-900 shadow-2xs"
                    placeholder="e.g. Net 30 Days, COD"
                  />
                </div>

                {/* Payment Due Date */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-charcoal-500 flex items-center gap-1">
                      Payment Due Date
                    </label>
                    <ConfidenceBadge level={formData.paymentDueDate.confidence} fieldName="Payment Due Date" />
                  </div>
                  <input
                    type="text"
                    value={formData.paymentDueDate.value}
                    onChange={(e) => handleFieldChange('paymentDueDate', e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg focus:ring-2 focus:ring-sage-500 text-charcoal-900 shadow-2xs font-semibold"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Section 2: Line Items Table Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-sage-600">
                Itemized Line Items Table
              </h3>
              <ConfidenceBadge level={formData.lineItemsConfidence || 'High'} fieldName="Line Items Table" />
            </div>
            <button
              type="button"
              onClick={handleAddLineItem}
              className="text-xs font-bold text-sage-800 bg-sage-100 hover:bg-sage-200 border border-sage-300 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line Item</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-sand-200 rounded-xl bg-cream-50">
            <table className="w-full text-left text-xs">
              <thead className="bg-sand-100 text-charcoal-500 font-bold border-b border-sand-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 min-w-[180px]">Item Description</th>
                  <th className="py-2.5 px-2 w-20 text-center">Qty</th>
                  <th className="py-2.5 px-2 w-28 text-right">Unit Price ($)</th>
                  <th className="py-2.5 px-3 w-28 text-right">Line Total ($)</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200 bg-white">
                {formData.lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-charcoal-500 italic">
                      No line items added. Click &quot;Add Line Item&quot; above to create one.
                    </td>
                  </tr>
                ) : (
                  formData.lineItems.map((item, index) => (
                    <tr key={item.id || index} className="hover:bg-sage-50/40">
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-sand-200 rounded focus:border-sage-500 text-charcoal-900 font-medium"
                          placeholder="Hardware item description"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-sand-200 rounded focus:border-sage-500 text-center font-semibold text-charcoal-900"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-sand-200 rounded focus:border-sage-500 text-right font-mono text-charcoal-900"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.lineTotal}
                          onChange={(e) => handleLineItemChange(index, 'lineTotal', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-sage-50/50 border border-sand-300 rounded focus:border-sage-500 text-right font-mono font-bold text-charcoal-900"
                          required
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteLineItem(index)}
                          className="p-1 text-charcoal-500 hover:text-rose-600 transition-colors rounded hover:bg-rose-50"
                          title="Delete line item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Totals & GST Summary Box */}
        <div className="bg-cream-100/90 border border-sand-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-sage-600">
              Financial Summary (SGD)
            </span>
            <label className="flex items-center gap-2 text-xs text-charcoal-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCalculateGST}
                onChange={(e) => setAutoCalculateGST(e.target.checked)}
                className="w-3.5 h-3.5 text-sage-600 rounded border-sand-300 focus:ring-sage-500"
              />
              <span>Auto-calc 7% GST</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Subtotal */}
            <div className="bg-white p-3 rounded-lg border border-sand-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase text-charcoal-500">Subtotal</span>
                <ConfidenceBadge level={formData.subtotal.confidence} fieldName="Subtotal" />
              </div>
              <div className="flex items-center gap-1 font-mono font-bold text-base text-charcoal-900">
                <span>$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.subtotal.value}
                  onChange={(e) => handleFieldChange('subtotal', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent outline-none font-mono font-bold text-charcoal-900"
                />
              </div>
            </div>

            {/* GST 7% */}
            <div className="bg-white p-3 rounded-lg border border-sand-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase text-charcoal-500">GST (7%)</span>
                <ConfidenceBadge level={formData.gstAmount.confidence} fieldName="GST" />
              </div>
              <div className="flex items-center gap-1 font-mono font-bold text-base text-charcoal-900">
                <span>$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.gstAmount.value}
                  onChange={(e) => handleFieldChange('gstAmount', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent outline-none font-mono font-bold text-charcoal-900"
                />
              </div>
            </div>

            {/* Grand Total */}
            <div className="bg-white p-3 rounded-lg border-2 border-sage-600">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase text-sage-700">Grand Total</span>
                <ConfidenceBadge level={formData.grandTotal.confidence} fieldName="Grand Total" />
              </div>
              <div className="flex items-center gap-1 font-mono font-black text-xl text-sage-900">
                <span>$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.grandTotal.value}
                  onChange={(e) => handleFieldChange('grandTotal', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent outline-none font-mono font-black text-sage-900"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Plain-English Extraction Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-charcoal-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-charcoal-500 text-[10px]">
              <Info className="w-4 h-4 text-sage-600" />
              Extraction Notes &amp; Observations
            </span>
            <span className="text-[11px] font-normal text-charcoal-500">
              Editable clerk notes
            </span>
          </label>
          <textarea
            value={formData.extractionNotes}
            onChange={(e) => updateFormData({ ...formData, extractionNotes: e.target.value })}
            rows={3}
            className="w-full p-3 text-xs bg-cream-100/90 border border-sand-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sage-500 text-charcoal-900 leading-relaxed"
            placeholder="AI notes regarding read clarity, handwritten items, or GST assumptions..."
          />
        </div>

        {/* Section 5: Primary Action Button */}
        <div className="pt-2 border-t border-sand-200 flex flex-col sm:flex-row items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto py-3.5 px-5 bg-sand-200 hover:bg-sand-300 text-charcoal-800 font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 w-full py-3.5 px-6 bg-sage-600 hover:bg-sage-700 active:bg-sage-800 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-60 cursor-pointer"
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving to Google Sheet...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{submitButtonLabel}</span>
                <FileSpreadsheet className="w-4 h-4 opacity-80" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
