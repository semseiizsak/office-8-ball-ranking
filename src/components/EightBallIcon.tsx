import React from 'react';

interface EightBallIconProps {
  className?: string;
  size?: number;
}

export const EightBallIcon: React.FC<EightBallIconProps> = ({ className = 'w-8 h-8', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer Glow Ring */}
      <circle cx="50" cy="50" r="48" fill="#10B981" />
      {/* Inner Dark Rim */}
      <circle cx="50" cy="50" r="43" fill="#0A1210" />
      {/* Pool Felt Green Core */}
      <circle cx="50" cy="50" r="38" fill="#0B4228" />
      
      {/* Tactical Crosshair Accents */}
      <line x1="26" y1="26" x2="36" y2="36" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="74" y1="26" x2="64" y2="36" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="26" y1="74" x2="36" y2="64" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="74" y1="74" x2="64" y2="64" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" />

      {/* Central White Ball Disc */}
      <circle cx="50" cy="50" r="20" fill="#FFFFFF" />

      {/* "8" Number */}
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="24"
        fontWeight="800"
        fill="#0A0E14"
      >
        8
      </text>
    </svg>
  );
};
