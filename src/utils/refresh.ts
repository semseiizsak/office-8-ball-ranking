/**
 * Performs a thorough hard refresh to ensure newly deployed bundles and assets
 * are loaded cleanly by bypassing all levels of client caching:
 *
 * 1. Clears CacheStorage (caches.keys()) if available.
 * 2. Asks registered Service Workers to update/clear.
 * 3. Appends a cache-busting timestamp parameter to the URL and replaces the location.
 */
export async function hardRefresh(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch (err) {
    console.warn('Could not clear CacheStorage:', err);
  }

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.update()));
    }
  } catch (err) {
    console.warn('Could not update ServiceWorker:', err);
  }

  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.replace(url.toString());
  }
}
