import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {SetupNotice} from './components/SetupNotice.tsx';
import {missingFirebaseConfigKeys} from './services/firebaseConfig.ts';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const missingKeys = missingFirebaseConfigKeys();

// App is imported only once the configuration checks out. Importing it
// initialises Firebase, and a deployment built without its environment
// variables should explain itself rather than fail inside the SDK.
if (missingKeys.length > 0) {
  root.render(
    <StrictMode>
      <SetupNotice missingKeys={missingKeys} />
    </StrictMode>,
  );
} else {
  import('./App.tsx')
    .then(({default: App}) => {
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      );
    })
    .catch((error: unknown) => {
      // A failed chunk load would otherwise leave an empty document.
      console.error('Failed to load the app:', error);
      document.getElementById('root')!.textContent =
        'Could not load the app. Check your connection and reload.';
    });
}
