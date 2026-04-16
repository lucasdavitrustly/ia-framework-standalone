import { useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  width?: number; // px, default 288
}

/**
 * Tooltip that renders into document.body via a React Portal.
 * Immune to overflow:hidden / overflow:auto clipping and stacking context issues.
 */
export default function Tooltip({ text, children, width = 288 }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <span
      className="inline-block cursor-help"
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: pos.x,
              top: pos.y,
              transform: 'translateX(-50%)',
              width: `${width}px`,
              zIndex: 9999,
              pointerEvents: 'none',
              padding: '8px 12px',
              fontSize: '12px',
              lineHeight: '1.6',
              color: '#d1d5db',
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              whiteSpace: 'normal',
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
