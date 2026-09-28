import React from 'react';

interface EightBallIconProps {
  className?: string;
  size?: number;
}

/** The app mark: a black 8 ball with a white disc and a bold 8. No wordmark. */
export const EightBallIcon: React.FC<EightBallIconProps> = ({ className = 'w-8 h-8', size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="#0A0A0A" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
    <circle cx="50" cy="50" r="22" fill="#FFFFFF" />
    <text x="50" y="59" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="26" fontWeight="900" fill="#0A0A0A">8</text>
  </svg>
);
