import { Book, Bookmark } from '../types';

const DB_NAME = 'AIBookNarratorCache';
const DB_VERSION = 2;
const STORE_AUDIO = 'audio';
const STORE_BOOKS = 'books';
const STORE_CHAPTER_TEXT = 'chapter_text';
const STORE_BOOKMARKS = 'bookmarks';

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
            if (!tempDb.objectStoreNames.contains(STORE_AUDIO)) {
                tempDb.createObjectStore(STORE_AUDIO, { keyPath: 'key' });
            }
            if (!tempDb.objectStoreNames.contains(STORE_BOOKS)) {
                tempDb.createObjectStore(STORE_BOOKS, { keyPath: 'pdfKey' });
            }
            if (!tempDb.objectStoreNames.contains(STORE_CHAPTER_TEXT)) {
                tempDb.createObjectStore(STORE_CHAPTER_TEXT, { keyPath: 'key' });
            }
            if (!tempDb.objectStoreNames.contains(STORE_BOOKMARKS)) {
                tempDb.createObjectStore(STORE_BOOKMARKS, { keyPath: 'pdfKey' });
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


// --- Public API ---

export const getCacheKey = (file: File) => `${file.name}_${file.size}`;

const getAudioKey = (pdfKey: string, chapterTitle: string, audioProfileKey: string, chunkIndex: number) => `${pdfKey}_${chapterTitle}_${audioProfileKey}_${chunkIndex}`;
export const saveAudioChunk = (pdfKey: string, chapterTitle: string, audioProfileKey: string, chunkIndex: number, audioData: string) => set(STORE_AUDIO, getAudioKey(pdfKey, chapterTitle, audioProfileKey, chunkIndex), audioData);
export const getAudioChunk = (pdfKey: string, chapterTitle: string, audioProfileKey: string, chunkIndex: number): Promise<string | undefined> => get(STORE_AUDIO, getAudioKey(pdfKey, chapterTitle, audioProfileKey, chunkIndex));

export const saveBook = (book: Book): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(STORE_BOOKS, 'readwrite').put(book);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getBook = (pdfKey: string): Promise<Book | undefined> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(STORE_BOOKS, 'readonly').get(pdfKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getAllBooks = (): Promise<Book[]> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(STORE_BOOKS, 'readonly').getAll();
        request.onsuccess = () => {
             const books = request.result || [];
             books.sort((a, b) => b.createdAt - a.createdAt);
             resolve(books);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteBook = (pdfKey: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(STORE_BOOKS, 'readwrite').delete(pdfKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const getChapterTextKey = (pdfKey: string, chapterIndex: number) => `${pdfKey}_${chapterIndex}`;
export const saveChapterText = (pdfKey: string, chapterIndex: number, text: string) => set(STORE_CHAPTER_TEXT, getChapterTextKey(pdfKey, chapterIndex), text);
export const getChapterText = (pdfKey: string, chapterIndex: number): Promise<string | undefined> => get(STORE_CHAPTER_TEXT, getChapterTextKey(pdfKey, chapterIndex));

export const saveBookmarks = (pdfKey: string, bookmarks: Record<string, Bookmark[]>): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(STORE_BOOKMARKS, 'readwrite').put({ pdfKey, bookmarks });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getBookmarks = (pdfKey: string): Promise<Record<string, Bookmark[]> | undefined> => {
    return new Promise(async (resolve, reject) => {
        await initDB();
        const request = getStore(STORE_BOOKMARKS, 'readonly').get(pdfKey);
        request.onsuccess = () => resolve(request.result?.bookmarks);
        request.onerror = () => reject(request.error);
    });
};

export const clearAllData = async (): Promise<void> => {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_AUDIO, STORE_BOOKS, STORE_CHAPTER_TEXT, STORE_BOOKMARKS], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore(STORE_AUDIO).clear();
        transaction.objectStore(STORE_BOOKS).clear();
        transaction.objectStore(STORE_CHAPTER_TEXT).clear();
        transaction.objectStore(STORE_BOOKMARKS).clear();
    });
};
