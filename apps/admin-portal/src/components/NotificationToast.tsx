'use client';

import toast from 'react-hot-toast';
import { Bell, X, ArrowRight } from 'lucide-react';

export function NotificationToast({
  t,
  title,
  body,
  onNavigate,
}: {
  t: { id: string; visible: boolean };
  title: string;
  body: string;
  onNavigate?: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 max-w-sm w-full cursor-pointer transition-all duration-300 ${
        t.visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-95'
      }`}
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f0f4ff 100%)',
        borderRadius: '14px',
        border: '1px solid #e0e7ff',
        borderLeft: '4px solid #6366f1',
        padding: '14px 14px 14px 12px',
        boxShadow: '0 8px 32px rgba(99, 102, 241, 0.15), 0 2px 8px rgba(0,0,0,0.06)',
      }}
      onClick={() => {
        toast.dismiss(t.id);
        onNavigate?.();
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5"
        style={{ background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)' }}
      >
        <Bell size={16} style={{ color: '#6366f1' }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug" style={{ color: '#1e1b4b' }}>
          {title}
        </p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#4b5563' }}>
          {body}
        </p>
        {onNavigate && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium mt-2"
            style={{ color: '#6366f1' }}
          >
            View details <ArrowRight size={11} />
          </span>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast.dismiss(t.id);
        }}
        className="flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-indigo-50 mt-0.5"
        style={{ color: '#a5b4fc' }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
