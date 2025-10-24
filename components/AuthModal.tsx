import React, { useState } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../services/firebaseService';
import { GoogleIcon, EmailIcon, LockClosedIcon } from './icons';
import { Spinner } from './Spinner';

interface AuthModalProps {
  onClose: () => void;
}

type AuthMode = 'signin' | 'signup';

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // The onAuthChange listener in App.tsx will handle closing the modal
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      // The onAuthChange listener in App.tsx will handle closing the modal
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
        className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={onClose}
        aria-modal="true"
        role="dialog"
    >
      <div 
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md m-4 border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 space-y-6">
            <h2 className="text-2xl font-bold text-center text-white">
                {mode === 'signin' ? 'Welcome Back' : 'Create an Account'}
            </h2>

            {error && <p className="text-sm text-center bg-red-900/50 text-red-300 p-3 rounded-md">{error}</p>}
            
            <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="relative">
                    <EmailIcon className="w-5 h-5 text-gray-400 absolute top-1/2 left-3 -translate-y-1/2" />
                    <input 
                        type="email" 
                        placeholder="Email Address" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full bg-gray-700 border border-gray-600 rounded-md py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                    />
                </div>
                 <div className="relative">
                    <LockClosedIcon className="w-5 h-5 text-gray-400 absolute top-1/2 left-3 -translate-y-1/2" />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full bg-gray-700 border border-gray-600 rounded-md py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full flex justify-center items-center py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold text-white transition disabled:bg-indigo-800 disabled:cursor-not-allowed"
                >
                    {isLoading ? <Spinner /> : (mode === 'signin' ? 'Sign In' : 'Sign Up')}
                </button>
            </form>

            <div className="flex items-center justify-center space-x-2">
                <span className="h-px bg-gray-600 w-full"></span>
                <span className="text-gray-400 text-sm">OR</span>
                <span className="h-px bg-gray-600 w-full"></span>
            </div>

            <button 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 rounded-md font-semibold text-white transition disabled:bg-gray-800"
            >
                <GoogleIcon className="w-5 h-5"/>
                Continue with Google
            </button>

            <p className="text-sm text-center text-gray-400">
                {mode === 'signin' ? "Don't have an account?" : "Already have an account?"}
                <button 
                    onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
                    className="font-semibold text-indigo-400 hover:underline ml-1"
                >
                    {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                </button>
            </p>
        </div>
      </div>
    </div>
  );
};