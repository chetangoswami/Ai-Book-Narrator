import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { firebaseConfig } from '../firebaseConfig';
import { Bookmark } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- AUTH FUNCTIONS ---

export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error: any) {
    console.error("Firebase Auth Error:", error);
    let message = "An unknown error occurred during sign-in. Please check the browser console for details.";
    switch (error.code) {
      case 'auth/unauthorized-domain':
        message = "This domain is not authorized for sign-in. Please go to your Firebase Console -> Authentication -> Settings -> Authorized domains, and add the domain you are currently on.";
        break;
      case 'auth/popup-blocked':
        message = "The sign-in pop-up was blocked by your browser. Please allow pop-ups for this site and try again.";
        break;
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        // This is a common case when the user closes the popup, don't show an error.
        return;
    }
    throw new Error(message);
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

// --- FIRESTORE FUNCTIONS ---

type BookmarksDocument = Record<string, Bookmark[]>;

export const loadBookmarksForFile = async (userId: string, pdfKey: string): Promise<BookmarksDocument | null> => {
    try {
        const docRef = doc(db, 'users', userId, 'bookmarks', pdfKey);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data() as BookmarksDocument;
        }
        return null;
    } catch (error) {
        console.error("Error loading bookmarks:", error);
        throw error;
    }
};

export const saveBookmarksForFile = async (userId: string, pdfKey: string, bookmarks: BookmarksDocument) => {
    try {
        const docRef = doc(db, 'users', userId, 'bookmarks', pdfKey);
        // If the bookmarks object is empty, delete the document
        if (Object.keys(bookmarks).every(key => bookmarks[key].length === 0)) {
            await deleteDoc(docRef);
        } else {
            await setDoc(docRef, bookmarks);
        }
    } catch (error) {
        console.error("Error saving bookmarks:", error);
        throw error;
    }
};