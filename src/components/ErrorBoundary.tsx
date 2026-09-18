import React from 'react';
import { hardRefresh } from '../utils/refresh';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence against a blank page.
 *
 * An uncaught error during render unmounts the whole React tree, which leaves
 * an empty document and no indication of what went wrong. Showing the message
 * is worth more than showing nothing.
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  declare readonly props: React.PropsWithChildren<{}>;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled error:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#ef4444]/40 bg-[#161b22] p-6 shadow-2xl">
          <h1 className="font-['Chivo'] text-xl font-black tracking-tight text-white">
            Something broke
          </h1>
          <p className="mt-2 font-['Space_Grotesk'] text-sm text-[#bbcabf]">
            The app hit an error it could not recover from.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-[#30363d] bg-[#10141a] p-3 font-['JetBrains_Mono'] text-[11px] text-[#ffb4ab]">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => hardRefresh()}
            className="mt-4 w-full rounded-xl bg-[#10b981] px-4 py-2.5 font-['Chivo'] text-sm font-bold text-[#002113]"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
