
const DB_NAME = 'AIBookNarratorCache';
const DB_VERSION = 1;
const STORE_AUDIO = 'audio';

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

export const clearAllData = async (): Promise<void> => {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_AUDIO], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore(STORE_AUDIO).clear();
    });
};
