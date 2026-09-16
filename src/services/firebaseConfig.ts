/**
 * Firebase configuration read from the build environment.
 *
 * Kept free of Firebase SDK imports so the app can check whether it is
 * configured before anything tries to initialise against a missing project.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const;

/**
 * Environment variables that were missing when this bundle was built.
 *
 * Vite inlines these at build time, so an unset variable compiles to
 * `undefined` and cannot be recovered at runtime. An empty list means the
 * bundle was built with a full configuration.
 */
export function missingFirebaseConfigKeys(): string[] {
  return Object.entries(REQUIRED_KEYS)
    .filter(([key]) => {
      const value = firebaseConfig[key as keyof typeof firebaseConfig];
      return typeof value !== 'string' || value.trim() === '';
    })
    .map(([, envName]) => envName);
}

export const isFirebaseConfigured = missingFirebaseConfigKeys().length === 0;
