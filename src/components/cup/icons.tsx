import React from 'react';

/** A tick, drawn so it sits centred in the small result discs. */
export const Check: React.FC<{ size: number; stroke?: string }> = ({ size, stroke = '#fff' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const Cross: React.FC<{ size: number; stroke?: string }> = ({ size, stroke = '#fff' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
