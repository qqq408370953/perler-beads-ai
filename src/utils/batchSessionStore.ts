import { PatternGenerationOptions, PatternGenerationResult } from './patternGenerator';

const DB_NAME = 'perlerBeadsBatchSessionDb';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const CURRENT_SESSION_KEY = 'current';

export type StoredBatchStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface StoredBatchItem {
  id: string;
  fileName: string;
  sourceDataUrl: string;
  options: PatternGenerationOptions;
  status: StoredBatchStatus;
  error?: string;
  result?: PatternGenerationResult;
}

export interface StoredBatchSession {
  id: typeof CURRENT_SESSION_KEY;
  items: StoredBatchItem[];
  globalOptions: PatternGenerationOptions;
  activeItemId?: string;
  updatedAt: number;
}

function openBatchSessionDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB，无法保存批量会话'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开批量会话存储失败'));
  });
}

function runSessionStoreRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openBatchSessionDb().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('批量会话存储操作失败'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('批量会话事务失败'));
    };
  }));
}

export function saveBatchSession(session: Omit<StoredBatchSession, 'id' | 'updatedAt'>): Promise<IDBValidKey> {
  return runSessionStoreRequest('readwrite', (store) => store.put({
    ...session,
    id: CURRENT_SESSION_KEY,
    updatedAt: Date.now(),
  }));
}

export function loadBatchSession(): Promise<StoredBatchSession | null> {
  return runSessionStoreRequest<StoredBatchSession | undefined>(
    'readonly',
    (store) => store.get(CURRENT_SESSION_KEY)
  ).then((session) => session ?? null);
}

export function clearBatchSession(): Promise<undefined> {
  return runSessionStoreRequest('readwrite', (store) => store.delete(CURRENT_SESSION_KEY));
}

export async function updateBatchSessionItem(
  itemId: string,
  patch: Partial<Omit<StoredBatchItem, 'id' | 'sourceDataUrl' | 'fileName'>>
): Promise<void> {
  const session = await loadBatchSession();
  if (!session) return;

  await saveBatchSession({
    ...session,
    items: session.items.map((item) => (
      item.id === itemId ? { ...item, ...patch } : item
    )),
    activeItemId: itemId,
  });
}
