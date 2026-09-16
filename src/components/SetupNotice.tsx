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
  <div className="flex min-h-screen items-center justify-center bg-[#0d1117] p-6">
    <div className="w-full max-w-md rounded-2xl border border-[#30363d] bg-[#161b22] p-6 text-center shadow-2xl">
      <EightBallIcon size={48} className="mx-auto" />
      <h1 className="mt-4 font-['Chivo'] text-xl font-black tracking-tight text-white">
        Not configured yet
      </h1>
      <p className="mt-2 font-['Space_Grotesk'] text-sm leading-relaxed text-[#bbcabf]">
        This deployment was built without its Firebase settings, so there is no league to load.
      </p>

      <div className="mt-4 rounded-xl border border-[#30363d] bg-[#10141a] p-3 text-left">
        <span className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
          Missing at build time
        </span>
        <ul className="mt-1.5 space-y-0.5">
          {missingKeys.map((key) => (
            <li key={key} className="font-['JetBrains_Mono'] text-[11px] text-[#ffb4ab]">
              {key}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 font-['Space_Grotesk'] text-xs leading-relaxed text-[#86948a]">
        Add these in your hosting project's environment variables, for every environment you deploy
        (on Vercel, Preview and Production are set separately), then redeploy. These values are
        baked in when the bundle is built, so a reload alone will not pick them up.
      </p>
    </div>
  </div>
);
