// EcoTrack/frontend/src/utils/offlineOutbox.js
// The queue that makes logging work with no connection.
//
// WHY THIS IS HONEST, NOT A HACK
// Calculator.jsx already computes the exact same kg CO2 figure the backend
// would (see emissionHelpers.js's calculateEmission - same factor, same
// rounding, documented there as "the two use the same factor value, so they
// always agree"). That is what makes queuing safe: a record saved offline
// shows the real number immediately, not a placeholder, and the backend
// recomputes it authoritatively the moment the queue actually flushes - the
// backend is still the one that counts, exactly as that file's docstring
// already states.
//
// WHAT LIVES HERE, NOT IN A LIBRARY
// One IndexedDB object store, plain browser API - no dependency, for the
// same reason weather_engine.py stays framework-free: this is a handful of
// operations (add, list, delete), not a reason to add idb or Dexie.
//
// A queued record's tempId (crypto.randomUUID()) is how the UI recognises
// "this is not really saved yet" and later removes it once the real record
// comes back from the server.

const DB_NAME = 'ecotrack-offline';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'tempId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, run) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = run(store);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

/**
 * Add one entry to the outbox. `payload` is exactly what carbonApi.calculate
 * would have sent; `localEmissionKg` is the client-computed preview figure
 * (calculateEmission's output), shown until the server's own answer replaces it.
 */
export function queueRecord(payload, localEmissionKg) {
  const entry = {
    tempId: crypto.randomUUID(),
    payload,
    localEmissionKg,
    queuedAt: new Date().toISOString(),
  };
  return withStore('readwrite', (store) => {
    store.add(entry);
    return entry;
  });
}

/** Every entry still waiting to sync, oldest first. */
export function getQueuedRecords() {
  // withStore resolves with whatever `run` returns - here that is itself a
  // promise, and awaiting withStore naturally flattens it to the array.
  return withStore('readonly', (store) => {
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

export function removeQueuedRecord(tempId) {
  return withStore('readwrite', (store) => {
    store.delete(tempId);
  });
}

/**
 * Try to send every queued record with `saveFn` (carbonApi.calculate),
 * oldest first, stopping at the first failure - a still-offline browser
 * would otherwise retry every remaining entry and fail identically each
 * time. Returns how many synced and how many are still waiting.
 */
export async function flushOutbox(saveFn) {
  const queued = await getQueuedRecords();
  queued.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));

  let synced = 0;
  for (const entry of queued) {
    try {
      // eslint-disable-next-line no-await-in-loop -- must stay in order, and stop on the first real failure
      await saveFn(entry.payload);
      // eslint-disable-next-line no-await-in-loop
      await removeQueuedRecord(entry.tempId);
      synced += 1;
    } catch (error) {
      // Still offline (or the server rejected it) - leave it and everything
      // after it queued, and let the caller decide what to tell the user.
      return { synced, remaining: queued.length - synced, lastError: error };
    }
  }

  return { synced, remaining: 0, lastError: null };
}
