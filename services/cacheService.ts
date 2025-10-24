import { CachedBook } from '../types';

const DB_NAME = 'AIBookNarratorCache';
const DB_VERSION = 1;
const STORES = {
    pdfs: 'pdfs',
    tocs: 'tocs',
    chapters: 'chapters',
    audio: 'audio',
};

let db: IDBDatabase;

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject('Error opening IndexedDB.');
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const tempDb = (event.target as IDBOpenDBRequest).result;
            if (!tempDb.objectStoreNames.contains(STORES.pdfs)) {
                tempDb.createObjectStore(STORES.pdfs, { keyPath: 'key' });
            }
            if (!tempDb.objectStoreNames.contains(STORES.tocs)) {
                tempDb.createObjectStore(STORES.tocs, { keyPath: 'key' });
            }
            if (!tempDb.objectStoreNames.contains(STORES.chapters)) {
                tempDb.createObjectStore(STORES.chapters, { keyPath: 'key' });
            }
             if (!tempDb.objectStoreNames.contains(STORES.audio)) {
                tempDb.createObjectStore(STORES.audio, { keyPath: 'key' });
            }
        };
    });
};

const getStore = (storeName: string, mode: IDBTransactionMode) => {
    return db.transaction(storeName, mode).objectStore(storeName);
};

// --- Generic Operations ---

const get = <T>(storeName: string, key: string): Promise<T | undefined> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(storeName, 'readonly').get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
    });
};

const set = (storeName: string, key: string, value: any): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(storeName, 'readwrite').put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const remove = (storeName: string, key: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(storeName, 'readwrite').delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const getAllKeys = (storeName: string): Promise<IDBValidKey[]> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(storeName, 'readonly').getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};


// --- Public API ---

export const getCacheKey = (file: File) => `${file.name}_${file.size}`;

export const savePDF = (key: string, name: string, file: File) => set(STORES.pdfs, key, { name, file });
export const getPDF = (key: string): Promise<File | undefined> => get<{ name: string; file: File }>(STORES.pdfs, key).then(result => result?.file);

export const saveTOC = (key: string, toc: string[]) => set(STORES.tocs, key, toc);
export const getTOC = (key: string): Promise<string[] | undefined> => get(STORES.tocs, key);

const getChapterKey = (pdfKey: string, chapterTitle: string) => `${pdfKey}_${chapterTitle}`;
export const saveChapterText = (pdfKey: string, chapterTitle: string, text: string) => set(STORES.chapters, getChapterKey(pdfKey, chapterTitle), text);
export const getChapterText = (pdfKey: string, chapterTitle: string): Promise<string | undefined> => get(STORES.chapters, getChapterKey(pdfKey, chapterTitle));

const getAudioKey = (pdfKey: string, chapterTitle: string, audioProfileKey: string, chunkIndex: number) => `${pdfKey}_${chapterTitle}_${audioProfileKey}_${chunkIndex}`;
export const saveAudioChunk = (pdfKey: string, chapterTitle: string, audioProfileKey: string, chunkIndex: number, audioData: string) => set(STORES.audio, getAudioKey(pdfKey, chapterTitle, audioProfileKey, chunkIndex), audioData);
export const getAudioChunk = (pdfKey: string, chapterTitle: string, audioProfileKey: string, chunkIndex: number): Promise<string | undefined> => get(STORES.audio, getAudioKey(pdfKey, chapterTitle, audioProfileKey, chunkIndex));

export const getAllCachedBooks = async (): Promise<CachedBook[]> => {
    await initDB();
    const keys = await getAllKeys(STORES.pdfs);
    const books: CachedBook[] = [];
    for (const key of keys) {
        const bookData = await get<{ name: string; file: File }>(STORES.pdfs, key as string);
        if (bookData) {
            books.push({ key: key as string, name: bookData.name });
        }
    }
    return books;
};

export const deleteBook = async (key: string) => {
    await initDB();
    // This requires iterating through all related items.
    // For simplicity, we will have a "clear all" function for now.
    // A more robust implementation would use compound keys or indexes.
};

export const clearAllData = async (): Promise<void> => {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(Object.values(STORES), 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        Object.values(STORES).forEach(storeName => {
            transaction.objectStore(storeName).clear();
        });
    });
};
