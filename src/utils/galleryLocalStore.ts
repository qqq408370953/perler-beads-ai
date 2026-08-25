import { GalleryPattern } from '../data/galleryPatterns';

export interface LocalGalleryPattern extends GalleryPattern {
  source: 'local';
  updatedAt: string;
}

const DB_NAME = 'perler-beads-gallery';
const DB_VERSION = 1;
const STORE_NAME = 'patterns';

export const LOCAL_GALLERY_UPDATED_EVENT = 'local-gallery-updated';

function ensureBrowserStorage() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('当前浏览器不支持本地图库存储');
  }
}

function openGalleryDb(): Promise<IDBDatabase> {
  ensureBrowserStorage();

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开本地图库失败'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openGalleryDb().then((db) => (
    new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = callback(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('本地图库操作失败'));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? new Error('本地图库事务失败'));
      };
    })
  ));
}

export async function getLocalGalleryPatterns(): Promise<LocalGalleryPattern[]> {
  try {
    const records = await withStore<LocalGalleryPattern[]>('readonly', (store) => store.getAll());
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    console.warn('读取本地图库失败:', error);
    return [];
  }
}

export async function saveLocalGalleryPattern(pattern: GalleryPattern): Promise<LocalGalleryPattern> {
  const record: LocalGalleryPattern = {
    ...pattern,
    source: 'local',
    updatedAt: new Date().toISOString(),
  };

  await withStore<IDBValidKey>('readwrite', (store) => store.put(record));
  window.dispatchEvent(new CustomEvent(LOCAL_GALLERY_UPDATED_EVENT));
  return record;
}

export async function saveLocalGalleryPatterns(patterns: GalleryPattern[]): Promise<LocalGalleryPattern[]> {
  const saved: LocalGalleryPattern[] = [];

  const db = await openGalleryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const now = new Date().toISOString();

    patterns.forEach((pattern) => {
      const record: LocalGalleryPattern = {
        ...pattern,
        source: 'local',
        updatedAt: now,
      };
      saved.push(record);
      store.put(record);
    });

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('批量保存本地图库失败'));
    };
  });

  window.dispatchEvent(new CustomEvent(LOCAL_GALLERY_UPDATED_EVENT));
  return saved;
}

export async function deleteLocalGalleryPattern(id: string): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(id));
  window.dispatchEvent(new CustomEvent(LOCAL_GALLERY_UPDATED_EVENT));
}

export async function clearLocalGalleryPatterns(): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.clear());
  window.dispatchEvent(new CustomEvent(LOCAL_GALLERY_UPDATED_EVENT));
}
