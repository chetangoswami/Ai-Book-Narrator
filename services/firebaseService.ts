import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  writeBatch,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
  uploadBytes
} from 'firebase/storage';
import { firebaseConfig } from '../firebaseConfig';
import { Bookmark, Book } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// --- AUTH FUNCTIONS ---

const getAuthErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
        case 'auth/invalid-email':
            return "The email address is not valid. Please check and try again.";
        case 'auth/user-disabled':
            return "This account has been disabled.";
        case 'auth/user-not-found':
            return "No account found with this email. Please sign up first.";
        case 'auth/wrong-password':
            return "Incorrect password. Please try again.";
        case 'auth/email-already-in-use':
            return "An account with this email already exists. Please sign in.";
        case 'auth/weak-password':
            return "The password is too weak. It must be at least 6 characters long.";
        case 'auth/unauthorized-domain':
            return "This domain is not authorized for sign-in. Please check your Firebase project settings.";
        case 'auth/popup-blocked':
            return "The sign-in pop-up was blocked by your browser. Please allow pop-ups for this site.";
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            // Don't treat this as an error, it's user action
            return ''; 
        default:
            return "An unknown authentication error occurred. Please try again.";
    }
};

export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    const message = getAuthErrorMessage(error.code);
    if (message) {
        throw new Error(message);
    }
  }
};

export const signUpWithEmail = async (email, password) => {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
        throw new Error(getAuthErrorMessage(error.code));
    }
};

export const signInWithEmail = async (email, password) => {
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
        throw new Error(getAuthErrorMessage(error.code));
    }
};


export const signOutUser = () => {
  signOut(auth).catch((error) => {
    console.error("Error during sign-out:", error);
  });
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// --- FIRESTORE BOOKMARKS FUNCTIONS ---

type BookmarksDocument = Record<string, Bookmark[]>;

export const loadBookmarksForFile = async (userId: string, pdfKey: string): Promise<BookmarksDocument | null> => {
    try {
        const bookBookmarksDocRef = doc(db, 'users', userId, 'bookmarks', pdfKey);
        const bookBookmarksSnap = await getDoc(bookBookmarksDocRef);
        if (bookBookmarksSnap.exists()) {
            return bookBookmarksSnap.data() as BookmarksDocument;
        }
        return null;
    } catch (error) {
        console.error("Error loading bookmarks:", error);
        throw error;
    }
};

export const saveBookmarksForFile = async (userId: string, pdfKey: string, bookmarks: BookmarksDocument) => {
    try {
        const bookBookmarksDocRef = doc(db, 'users', userId, 'bookmarks', pdfKey);
        const isBookmarksEmpty = Object.keys(bookmarks).every(key => !bookmarks[key] || bookmarks[key].length === 0);

        if (isBookmarksEmpty) {
            await deleteDoc(bookBookmarksDocRef);
        } else {
            await setDoc(bookBookmarksDocRef, bookmarks);
        }
    } catch (error) {
        console.error("Error saving bookmarks:", error);
        throw error;
    }
};

// --- FIRESTORE LIBRARY/BOOK FUNCTIONS ---

export const saveBook = async (userId: string, pdfFile: File, toc: string[]): Promise<Book> => {
    try {
        const pdfKey = `${pdfFile.name}_${pdfFile.size}`;
        const pdfStoragePath = `users/${userId}/books/${pdfKey}/${pdfFile.name}`;
        const storageRef = ref(storage, pdfStoragePath);

        // Upload the PDF
        await uploadBytes(storageRef, pdfFile);
        const downloadURL = await getDownloadURL(storageRef);

        // Save book metadata to Firestore
        const bookDocRef = doc(db, 'users', userId, 'books', pdfKey);
        const bookData: Book = {
            pdfKey,
            fileName: pdfFile.name,
            pdfDownloadUrl: downloadURL,
            toc,
            createdAt: serverTimestamp()
        };
        await setDoc(bookDocRef, bookData);
        return bookData;
    } catch (error) {
        console.error("Error uploading PDF and saving book:", error);
        throw error;
    }
};

export const getUserBooks = async (userId: string): Promise<Book[]> => {
    try {
        const booksCollectionRef = collection(db, 'users', userId, 'books');
        const q = query(booksCollectionRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => doc.data() as Book);
    } catch (error) {
        console.error("Error getting user books:", error);
        return [];
    }
};

export const getChapterText = async (userId: string, pdfKey: string, chapterIndex: number): Promise<string | null> => {
    try {
        const chapterDocRef = doc(db, 'users', userId, 'books', pdfKey, 'chapters', `chapter_${chapterIndex}`);
        const docSnap = await getDoc(chapterDocRef);
        if (docSnap.exists()) {
            return docSnap.data().text;
        }
        return null;
    } catch (error) {
        console.error("Error getting chapter text:", error);
        return null;
    }
};

export const saveChapterText = async (userId: string, pdfKey: string, chapterIndex: number, text: string) => {
    try {
        const chapterDocRef = doc(db, 'users', userId, 'books', pdfKey, 'chapters', `chapter_${chapterIndex}`);
        await setDoc(chapterDocRef, { text });
    } catch (error) {
        console.error("Error saving chapter text:", error);
    }
};


// --- AUDIO CACHE FUNCTIONS (FIRESTORE + STORAGE) ---

const getAudioStoragePath = (userId: string, pdfKey: string, audioKey: string) => `users/${userId}/books/${pdfKey}/audio/${audioKey}.txt`;

export const uploadAndSaveAudioChunk = async (
    userId: string, 
    pdfKey: string, 
    audioKey: string, 
    base64Data: string
): Promise<string> => {
    try {
        const storageRef = ref(storage, getAudioStoragePath(userId, pdfKey, audioKey));
        await uploadString(storageRef, base64Data, 'base64');
        const downloadURL = await getDownloadURL(storageRef);

        const audioDocRef = doc(db, 'users', userId, 'books', pdfKey, 'audio', audioKey);
        await setDoc(audioDocRef, { url: downloadURL, createdAt: serverTimestamp() });
        
        return downloadURL;
    } catch (error) {
        console.error("Error uploading and saving audio chunk:", error);
        throw error;
    }
};

export const getAudioChunkUrl = async (
    userId: string, 
    pdfKey: string, 
    audioKey: string
): Promise<string | null> => {
    try {
        const audioDocRef = doc(db, 'users', userId, 'books', pdfKey, 'audio', audioKey);
        const docSnap = await getDoc(audioDocRef);
        if (docSnap.exists()) {
            return docSnap.data().url;
        }
        return null;
    } catch (error) {
        console.error("Error getting audio chunk URL:", error);
        return null;
    }
};

export const deleteBook = async (userId: string, bookToDelete: Book) => {
    const { pdfKey, fileName } = bookToDelete;
    const batch = writeBatch(db);

    try {
        // --- Firestore Deletion ---
        const collectionsToDelete = ['chapters', 'audio'];
        for (const subCollection of collectionsToDelete) {
            const colRef = collection(db, 'users', userId, 'books', pdfKey, subCollection);
            const snapshot = await getDocs(colRef);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
        }

        const bookmarksDocRef = doc(db, 'users', userId, 'bookmarks', pdfKey);
        batch.delete(bookmarksDocRef);
        
        const bookDocRef = doc(db, 'users', userId, 'books', pdfKey);
        batch.delete(bookDocRef);
        
        await batch.commit();

        // --- Storage Deletion ---
        try {
            // Delete main PDF
            const pdfStoragePath = `users/${userId}/books/${pdfKey}/${fileName}`;
            const pdfRef = ref(storage, pdfStoragePath);
            await deleteObject(pdfRef);

            // Delete all audio files
            const audioFolderRef = ref(storage, `users/${userId}/books/${pdfKey}/audio`);
            const res = await listAll(audioFolderRef);
            const deletePromises = res.items.map(itemRef => deleteObject(itemRef));
            await Promise.all(deletePromises);
        } catch (storageError) {
             console.error("Error cleaning up storage files (Firestore data was deleted successfully):", storageError);
        }

    } catch (error) {
        console.error("Error deleting book and its sub-collections:", error);
        throw error;
    }
};