import React from 'react';
import { CheckCircle2, XCircle, Clock, HelpCircle, RotateCcw } from 'lucide-react';

export interface MatchLogStatusEntry {
  rawStatus: string;
  date?: string;
  notes?: string;
  count: number;
  isRevised: boolean;
}

export const normalizeInvoiceNumber = (inv: string | undefined | null): string => {
  if (!inv) return '';
  return inv.toString().toLowerCase().replace(/\s+/g, '').trim();
};

interface StatusBadgeProps {
  invoiceNumber: string;
  matchLogMap: Record<string, MatchLogStatusEntry>;
  ledgerMatchStatus?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ invoiceNumber, matchLogMap = {}, ledgerMatchStatus }) => {
  const normKey = normalizeInvoiceNumber(invoiceNumber);
  const entry = matchLogMap ? matchLogMap[normKey] : undefined;

  const rawStatus = entry?.rawStatus || ledgerMatchStatus || '';

  if (!rawStatus) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap" title="Not yet processed by App 2. Run a 3-way match to proceed.">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sand-100 text-charcoal-700 border border-sand-300">
          <span className="w-1.5 h-1.5 rounded-full bg-charcoal-400 shrink-0"></span>
          <span>Pending Match</span>
        </span>
      </div>
    );
  }

  const rawClean = rawStatus.trim().toLowerCase();
  
  // Categorization
  const isApproved = ['approved', 'auto approved', 'auto-approved', 'auto-approve', 'auto approve', 'autoapproved', 'auto ✓'].some(s => rawClean === s) || 
                     (rawClean.includes('auto') && (rawClean.includes('approve') || rawClean.includes('approved') || rawClean.includes('✓')));
  
  const isDeclined = ['rejected', 'declined', 'auto rejected', 'auto-rejected', 'auto reject', 'auto-reject'].some(s => rawClean === s) ||
                     rawClean.includes('reject') || rawClean.includes('decline');

  const isPending = ['hold', 'hold for review', 'pending', 'under review', 'hold for review'].some(s => rawClean === s) ||
                    rawClean.includes('hold') || rawClean.includes('pending') || (rawClean.includes('under') && rawClean.includes('review'));

  let badgeElement = null;

  if (isApproved) {
    const isAuto = rawClean.includes('auto');
    if (isAuto) {
      const tooltip = entry?.date
        ? `Auto-approved by App 2 on ${entry?.date} — perfect three-way match, amount under $500 threshold, no duplicates flagged. Madam Lim's review was not required.`
        : `Auto-approved by App 2 — perfect three-way match, amount under $500 threshold, no duplicates flagged. Madam Lim's review was not required.`;
      badgeElement = (
        <span
          title={tooltip}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 cursor-help"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>✓ Approved (auto)</span>
        </span>
      );
    } else {
      const tooltip = entry?.date
        ? `Approved by Madam Lim in App 2 on ${entry?.date}. Ready for payment scheduling.`
        : `Approved by Madam Lim in App 2. Ready for payment scheduling.`;
      badgeElement = (
        <span
          title={tooltip}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 cursor-help"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>✓ Approved</span>
        </span>
      );
    }
  } else if (isDeclined) {
    const reasonText = entry?.notes ? entry?.notes : 'See Match Log for details';
    const tooltip = entry?.date
      ? `Declined by App 2 on ${entry?.date}. Reason: ${reasonText}.`
      : `Declined by App 2. Reason: ${reasonText}.`;
    badgeElement = (
      <span
        title={tooltip}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 cursor-help"
      >
        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span>✗ Declined</span>
      </span>
    );
  } else if (isPending) {
    const tooltip = "Under review in App 2's Match Reports queue. Awaiting Madam Lim's decision.";
    badgeElement = (
      <span
        title={tooltip}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 cursor-help"
      >
        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>⏳ Pending</span>
      </span>
    );
  } else {
    const tooltip = `Status: ${entry?.rawStatus || rawStatus}. Read from Match Log.`;
    badgeElement = (
      <span
        title={tooltip}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sand-100 text-charcoal-800 border border-sand-300 cursor-help"
      >
        <HelpCircle className="w-3.5 h-3.5 text-charcoal-500 shrink-0" />
        <span>? Unknown ({entry?.rawStatus || rawStatus})</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {badgeElement}
      {entry?.isRevised && (
        <span
          title="This invoice has been re-decided in Match Log"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-200 rounded-md"
        >
          <RotateCcw className="w-2.5 h-2.5 text-purple-700" />
          <span>revised</span>
        </span>
      )}
    </div>
  );
};
