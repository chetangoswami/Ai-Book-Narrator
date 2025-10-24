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
  deleteDoc
} from 'firebase/firestore';
import { firebaseConfig } from '../firebaseConfig';
import { Bookmark } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
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

// --- FIRESTORE FUNCTIONS ---

type BookmarksDocument = Record<string, Bookmark[]>;

export const loadBookmarksForFile = async (userId: string, pdfKey: string): Promise<BookmarksDocument | null> => {
    try {
        // Document path is now specific to the user and the PDF.
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
            // If there are no bookmarks for this book, delete the document.
            await deleteDoc(bookBookmarksDocRef);
        } else {
            // Otherwise, create or overwrite the document for this book with the new bookmarks.
            await setDoc(bookBookmarksDocRef, bookmarks);
        }
    } catch (error) {
        console.error("Error saving bookmarks:", error);
        throw error;
    }
};