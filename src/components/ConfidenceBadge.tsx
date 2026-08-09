import React from 'react';
import { ConfidenceLevel } from '../types';
import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  fieldName?: string;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ level, fieldName }) => {
  let badgeStyle = '';
  let icon = null;
  let text = '';

  switch (level) {
    case 'High':
      badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      text = 'High Clarity';
      break;
    case 'Medium':
      badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
      icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
      text = 'Medium Clarity';
      break;
    case 'Low':
      badgeStyle = 'bg-rose-50 text-rose-800 border-rose-200';
      icon = <AlertCircle className="w-3.5 h-3.5 text-rose-600" />;
      text = 'Low Clarity (Review)';
      break;
    default:
      badgeStyle = 'bg-slate-50 text-slate-700 border-slate-200';
      icon = <HelpCircle className="w-3.5 h-3.5 text-slate-500" />;
      text = level || 'Unrated';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border shadow-2xs ${badgeStyle}`}
      title={`Legibility confidence for ${fieldName || 'this field'}: ${text}. Based purely on document text clarity.`}
    >
      {icon}
      <span>{text}</span>
    </span>
  );
};
