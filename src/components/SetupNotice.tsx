import React from 'react';
import { EightBallIcon } from './EightBallIcon';

interface SetupNoticeProps {
  /** Environment variables that were missing when this bundle was built. */
  missingKeys: string[];
}

/**
 * Shown when the app was built without its Firebase configuration.
 *
 * Vite inlines these values at build time, so this cannot be recovered by
 * reloading: the deployment has to be rebuilt once the variables are set.
 */
export const SetupNotice: React.FC<SetupNoticeProps> = ({ missingKeys }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-6">
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111111] p-6 text-center shadow-2xl">
      <EightBallIcon size={48} className="mx-auto" />
      <h1 className="mt-4 font-display text-xl font-black tracking-tight text-white">
        Not configured yet
      </h1>
      <p className="mt-2 font-sans text-sm leading-relaxed text-white/70">
        This deployment was built without its Firebase settings, so there is no league to load.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-[#0A0A0A] p-3 text-left">
        <span className="font-sans tabular-nums text-[10px] font-bold uppercase tracking-wider text-white/55">
          Missing at build time
        </span>
        <ul className="mt-1.5 space-y-0.5">
          {missingKeys.map((key) => (
            <li key={key} className="font-sans tabular-nums text-[11px] text-[#FF6B7D]">
              {key}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 font-sans text-xs leading-relaxed text-white/55">
        Add these in your hosting project's environment variables, for every environment you deploy
        (on Vercel, Preview and Production are set separately), then redeploy. These values are
        baked in when the bundle is built, so a reload alone will not pick them up.
      </p>
    </div>
  </div>
);
