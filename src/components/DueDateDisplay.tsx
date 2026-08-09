import React from 'react';
import { getValidatedDueDate } from '../lib/sheetColumnMap';

interface DueDateDisplayProps {
  dateVal: any;
  className?: string;
  showIcon?: boolean;
}

export const DueDateDisplay: React.FC<DueDateDisplayProps> = ({
  dateVal,
  className = '',
}) => {
  const valid = getValidatedDueDate(dateVal);

  if (valid) {
    return <span className={`font-semibold text-charcoal-900 ${className}`}>{valid}</span>;
  }

  return (
    <span
      className={`font-extrabold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 decoration-dotted cursor-help inline-flex items-center gap-1 ${className}`}
      title="Due date missing or corrupted. Edit this invoice in Manage Ledger to restore it."
    >
      <span>—</span>
    </span>
  );
};
