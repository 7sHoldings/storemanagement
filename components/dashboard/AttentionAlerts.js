'use client';
import { AlertTriangle } from 'lucide-react';
import AlertCard from './shared/AlertCard';

// Promoted to the top of the dashboard. `alerts` is the existing derived
// array of { type, text, link }; `onAction` receives the alert's link.
export default function AttentionAlerts({ alerts, onAction }) {
  const n = alerts.length;
  return (
    <div
      className="mb-4 rounded-xl p-4 sm:px-5"
      style={{
        background: 'linear-gradient(135deg, rgba(239,159,39,0.08), rgba(226,75,74,0.08))',
        border: '1px solid rgba(239,159,39,0.2)',
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0 text-[#EF9F27]" />
        <h2 className="text-[14px] font-medium text-white">
          {n} thing{n === 1 ? '' : 's'} need{n === 1 ? 's' : ''} your attention
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.map((a, i) => (
          <AlertCard key={i} type={a.type} text={a.text} onAction={() => onAction(a.link)} />
        ))}
      </div>
    </div>
  );
}
