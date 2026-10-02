import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {SetupNotice} from './components/SetupNotice.tsx';
import {missingFirebaseConfigKeys} from './services/firebaseConfig.ts';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const missingKeys = missingFirebaseConfigKeys();

// Same split as the main app: importing KioskApp initialises Firebase, which
// should only happen once the configuration is known to be there — a kiosk
// left running unattended should explain a bad deploy, not show a blank tab.
if (missingKeys.length > 0) {
  root.render(
    <StrictMode>
      <SetupNotice missingKeys={missingKeys} />
    </StrictMode>,
  );
} else {
  import('./KioskApp.tsx')
    .then(({default: KioskApp}) => {
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <KioskApp />
          </ErrorBoundary>
        </StrictMode>,
      );
    })
    .catch((error: unknown) => {
      console.error('Failed to load the kiosk:', error);
      document.getElementById('root')!.textContent =
        'Could not load the kiosk. Check your connection and reload.';
    });
}
