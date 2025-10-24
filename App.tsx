import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { extractChapterText, generateSpeech } from './services/geminiService';
import { useTocGenerator } from './hooks/usePdfParser';
import { startStreamingPlayback, addAudioChunkToQueue, stopAudio, pauseAudio, resumeAudio, getCurrentPlaybackState } from './services/audioService';
import { UploadIcon, BookOpenIcon, PlayIcon, StopIcon, SpeakerWaveIcon, PauseIcon, BookmarkIcon, TrashIcon, GoogleIcon } from './components/icons';
import { Spinner, ThinkingIndicator } from './components/Spinner';
import { AVAILABLE_VOICES, VOICE_PREVIEW_TEXT, NARRATION_STYLES } from './constants';
import { playSimpleAudio } from './services/audioService';
import { Bookmark } from './types';
import { User } from 'firebase/auth';
import { onAuthChange, signInWithGoogle, signOutUser, loadBookmarksForFile, saveBookmarksForFile } from './services/firebaseService';
import { firebaseConfig } from './firebaseConfig';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const App: React.FC = () => {
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(false);

  useEffect(() => {
    if (
      firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" &&
      firebaseConfig.appId && firebaseConfig.appId !== "YOUR_APP_ID"
    ) {
      setIsFirebaseConfigured(true);
    }
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const { toc, loading: parsingPdf, error: pdfError, loadingMessage } = useTocGenerator(pdfFile);
  
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [chapterText, setChapterText] = useState<string>('');
  const [isLoadingChapter, setIsLoadingChapter] = useState<boolean>(false);

  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [selectedSlang, setSelectedSlang] = useState<string>('Standard');
  const [isReading, setIsReading] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState<boolean>(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const [previewAudioCache, setPreviewAudioCache] = useState<Record<string, string>>({});
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(-1);
  const [pdfProcessingError, setPdfProcessingError] = useState<string | null>(pdfError);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark[]>>({});
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const pdfKey = useMemo(() => pdfFile ? `bookmarks_${pdfFile.name}_${pdfFile.size}` : null, [pdfFile]);

  const contentRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const activePlaybackSessionId = useRef(0);
  
  const sentences = useMemo(() => chapterText.match(/[^.!?…]+[.!?…]*\s*|.+/g) || [], [chapterText]);

  useEffect(() => {
    if(currentSentenceIndex > -1 && sentenceRefs.current[currentSentenceIndex]) {
      sentenceRefs.current[currentSentenceIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSentenceIndex]);


  useEffect(() => {
    if (isFirebaseConfigured) {
      const unsubscribe = onAuthChange((user) => {
        setUser(user);
        if (user) {
          setAuthError(null); // Clear any auth errors on successful login
        }
      });
      return () => unsubscribe();
    }
  }, [isFirebaseConfigured]);

  useEffect(() => {
    const loadBookmarks = async () => {
      if (user && pdfKey && isFirebaseConfigured) {
        try {
          const storedBookmarks = await loadBookmarksForFile(user.uid, pdfKey);
          setBookmarks(storedBookmarks || {});
        } catch (e) {
          console.error("Failed to load bookmarks:", e);
          setBookmarks({});
        }
      } else {
        setBookmarks({});
      }
    };
    loadBookmarks();
  }, [user, pdfKey, isFirebaseConfigured]);

  const handlePlaybackError = useCallback((e: unknown, context: string) => {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error during ${context}:`, e);
    if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("Requested entity was not found")) {
        setPlaybackError("Permission denied. Ensure the 'Generative Language API' is enabled for your project.");
    } else {
        setPlaybackError(`Failed to ${context}. Please try again.`);
    }
    handleStop();
  }, []);

  useEffect(() => {
    setPdfProcessingError(pdfError);
  }, [pdfError]);
  
  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      if (error instanceof Error) {
        setAuthError(error.message);
      } else {
        setAuthError("An unexpected error occurred during sign-in.");
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      resetState();
      setPdfFile(file);
    } else {
      setPdfProcessingError('Please upload a valid PDF file.');
      setPdfFile(null);
    }
  };

  const resetState = () => {
    setSelectedChapter(null);
    setChapterText('');
    setIsReading(false);
    setIsPaused(false);
    setIsGeneratingAudio(false);
    setCurrentSentenceIndex(-1);
    setPdfProcessingError(null);
    setPlaybackError(null);
    setBookmarks({});
    activePlaybackSessionId.current++;
    stopAudio();
  };

  const handleStop = () => {
    activePlaybackSessionId.current++;
    stopAudio();
    setIsReading(false);
    setIsPaused(false);
    setCurrentSentenceIndex(-1);
    setIsGeneratingAudio(false);
  };

  const handleSelectChapter = useCallback(async (chapterTitle: string) => {
    if (!pdfFile || selectedChapter === chapterTitle) return;
    handleStop();
    setSelectedChapter(chapterTitle);
    setChapterText('');
    setIsLoadingChapter(true);
    setPlaybackError(null);
    try {
      await extractChapterText(pdfFile, chapterTitle, (chunk) => {
        setChapterText(prev => prev + chunk);
      });
    } catch(e) {
      handlePlaybackError(e, `load chapter: ${chapterTitle}`);
    } finally {
      setIsLoadingChapter(false);
    }
  }, [pdfFile, selectedChapter, handlePlaybackError]);

  const handlePlay = async (startFromBookmark?: Bookmark) => {
    if (!chapterText) return;
    
    activePlaybackSessionId.current++;
    const sessionId = activePlaybackSessionId.current;
    
    stopAudio();
    
    setIsGeneratingAudio(true);
    setPlaybackError(null);
    setCurrentSentenceIndex(-1);
    
    const textChunks = (chapterText.match(/([^.!?…]+[.!?…]*){1,7}\s*|.+/g) || [])
      .filter(chunk => chunk.trim().length > 0);

    const startChunkIndex = startFromBookmark?.chunkIndex ?? 0;
    const initialOffset = startFromBookmark?.startOffset ?? 0;

    let initialSentencesProcessed = 0;
    if (startFromBookmark) {
      for (let i = 0; i < startFromBookmark.chunkIndex; i++) {
        initialSentencesProcessed += (textChunks[i]?.match(/[^.!?…]+[.!?…]*\s*|.+/g) || []).length;
      }
    }

    startStreamingPlayback(
      () => {
        if (sessionId !== activePlaybackSessionId.current) return;
        setIsGeneratingAudio(false);
        setIsReading(true);
        setIsPaused(false);
      },
      () => {
        if (sessionId !== activePlaybackSessionId.current) return;
        setIsReading(false);
        setIsPaused(false);
        setCurrentSentenceIndex(-1);
      },
      (index) => {
        if (sessionId !== activePlaybackSessionId.current) return;
        setCurrentSentenceIndex(index);
      },
      initialOffset,
      initialSentencesProcessed
    );
    
    const chunksToProcess = textChunks.slice(startChunkIndex);
    for (const [i, chunk] of chunksToProcess.entries()) {
      if (sessionId !== activePlaybackSessionId.current) return; 
      try {
        const audioData = await generateSpeech(chunk, selectedVoice, selectedSlang);
        if (sessionId === activePlaybackSessionId.current) {
          const absoluteChunkIndex = startChunkIndex + i;
          addAudioChunkToQueue(audioData, chunk, absoluteChunkIndex);
        }
      } catch (e) {
        if (sessionId === activePlaybackSessionId.current) {
          handlePlaybackError(e, 'generate or play audio chunk');
        }
        break;
      }
    }
  };

  const handlePlayPauseToggle = () => {
    if (isPaused) { resumeAudio(); setIsPaused(false); } 
    else { pauseAudio(); setIsPaused(true); }
  };

  const handlePreviewVoice = async () => {
    activePlaybackSessionId.current++;
    stopAudio();
    setIsReading(false);
    setIsPaused(false);
    setPlaybackError(null);
    
    const cacheKey = selectedVoice + selectedSlang;
    if (previewAudioCache[cacheKey]) {
      try { await playSimpleAudio(previewAudioCache[cacheKey]); }
      catch (e) { handlePlaybackError(e, 'play cached voice preview'); }
    } else {
      setIsPreviewingVoice(true);
      try {
        const audioData = await generateSpeech(VOICE_PREVIEW_TEXT, selectedVoice, 'Standard');
        setPreviewAudioCache(prev => ({ ...prev, [cacheKey]: audioData }));
        await playSimpleAudio(audioData);
      } catch (e) {
        handlePlaybackError(e, 'generate or play voice preview');
      } finally {
        setIsPreviewingVoice(false);
      }
    }
  };

  const handleAddBookmark = async () => {
    if (!user || !pdfKey || !selectedChapter || !isReading) return;
    
    const state = getCurrentPlaybackState();
    if (!state) return;

    setIsSavingBookmark(true);
    const newBookmark: Bookmark = {
        id: Date.now().toString(),
        chapterTitle: selectedChapter,
        chunkIndex: state.chunkIndex,
        startOffset: state.startOffset,
        displayText: state.currentTextChunk.substring(0, 50) + '...'
    };
    
    const updatedChapterBookmarks = [...(bookmarks[selectedChapter] || []), newBookmark];
    const newBookmarks = { ...bookmarks, [selectedChapter]: updatedChapterBookmarks };
    
    try {
        await saveBookmarksForFile(user.uid, pdfKey, newBookmarks);
        setBookmarks(newBookmarks);
    } catch(e) {
        console.error("Failed to save bookmark:", e);
    } finally {
        setIsSavingBookmark(false);
    }
  };
  
  const handleDeleteBookmark = async (bookmarkId: string) => {
    if (!user || !pdfKey || !selectedChapter) return;
    
    const updatedChapterBookmarks = (bookmarks[selectedChapter] || []).filter(b => b.id !== bookmarkId);
    const newBookmarks = { ...bookmarks, [selectedChapter]: updatedChapterBookmarks };

    try {
        await saveBookmarksForFile(user.uid, pdfKey, newBookmarks);
        setBookmarks(newBookmarks);
    } catch(e) {
        console.error("Failed to delete bookmark:", e);
    }
  };

  const renderContent = () => {
    if (parsingPdf || isLoadingChapter) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <ThinkingIndicator text={parsingPdf ? loadingMessage : 'Loading Chapter...'} />
            </div>
        );
    }

    if (!pdfFile) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="max-w-md w-full border-2 border-dashed border-gray-600 rounded-2xl p-10 flex flex-col items-center justify-center hover:border-indigo-500 transition-colors">
                    <UploadIcon className="w-16 h-16 text-gray-500 mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Upload your book</h2>
                    <p className="text-gray-400 mb-6">Drag and drop a PDF file or click to select</p>
                    <input type="file" onChange={handleFileChange} accept="application/pdf" className="hidden" id="pdf-upload" />
                    <label htmlFor="pdf-upload" className="px-6 py-2 bg-indigo-600 rounded-md cursor-pointer hover:bg-indigo-700 transition-colors">
                        Select PDF
                    </label>
                </div>
                {pdfProcessingError && <p className="text-red-400 mt-4">{pdfProcessingError}</p>}
            </div>
        );
    }
    
    if (pdfProcessingError) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <p className="text-red-400 max-w-md">{pdfProcessingError}</p>
                <button onClick={() => setPdfFile(null)} className="mt-4 px-6 py-2 bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors">
                    Try another file
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex overflow-hidden">
            <aside className="w-1/4 bg-gray-900/50 p-4 overflow-y-auto border-r border-gray-700">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><BookOpenIcon className="w-6 h-6" /> Table of Contents</h2>
                <ul className="space-y-2">
                    {toc.map((chapter) => (
                        <li key={chapter} onClick={() => handleSelectChapter(chapter)}
                            className={`p-2 rounded-md cursor-pointer transition-colors text-sm ${selectedChapter === chapter ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700'}`}>
                            {chapter}
                        </li>
                    ))}
                </ul>
            </aside>
            <main className="w-3/4 flex flex-col">
                <div className="p-6 overflow-y-auto flex-1" ref={contentRef}>
                    {selectedChapter ? (
                        <>
                            <h1 className="text-2xl font-bold mb-6">{selectedChapter}</h1>
                            <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed">
                                {sentences.map((sentence, index) => (
                                    <span key={index} ref={el => sentenceRefs.current[index] = el}
                                        className={`transition-colors duration-300 ${currentSentenceIndex === index ? 'text-indigo-300' : ''}`}>
                                        {sentence}
                                    </span>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            <p>Select a chapter to begin.</p>
                        </div>
                    )}
                </div>
                {playbackError && <div className="p-4 text-center text-red-400 bg-red-900/50">{playbackError}</div>}
                <footer className="bg-gray-800/70 backdrop-blur-sm border-t border-gray-700 p-4 space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label htmlFor="voice-select" className="sr-only">Voice</label>
                            <select id="voice-select" value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 w-full">
                                {AVAILABLE_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                        </div>
                         <div className="flex-1">
                            <label htmlFor="slang-select" className="sr-only">Style</label>
                            <select id="slang-select" value={selectedSlang} onChange={e => setSelectedSlang(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 w-full">
                                {NARRATION_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <button onClick={handlePreviewVoice} disabled={isPreviewingVoice} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50">
                            {isPreviewingVoice ? <Spinner /> : <SpeakerWaveIcon className="w-6 h-6" />}
                        </button>
                    </div>
                    <div className="flex items-center justify-center gap-4">
                        <button onClick={() => handlePlay()} disabled={!selectedChapter || isReading || isGeneratingAudio} className="p-3 bg-indigo-600 rounded-full disabled:bg-gray-600 hover:bg-indigo-700">
                            <PlayIcon className="w-7 h-7" />
                        </button>
                        <button onClick={handlePlayPauseToggle} disabled={!isReading} className="p-3 bg-gray-700 rounded-full disabled:opacity-50 hover:bg-gray-600">
                            {isPaused ? <PlayIcon className="w-7 h-7" /> : <PauseIcon className="w-7 h-7" />}
                        </button>
                        <button onClick={handleStop} disabled={!isReading && !isGeneratingAudio} className="p-3 bg-gray-700 rounded-full disabled:opacity-50 hover:bg-gray-600">
                            <StopIcon className="w-7 h-7" />
                        </button>
                         {user && (
                            <button onClick={handleAddBookmark} disabled={!isReading || isSavingBookmark} className="p-3 bg-gray-700 rounded-full disabled:opacity-50 hover:bg-gray-600">
                                {isSavingBookmark ? <Spinner /> : <BookmarkIcon className="w-7 h-7" />}
                            </button>
                        )}
                    </div>
                    {isGeneratingAudio && !isReading && <p className="text-center text-sm text-gray-400">Generating initial audio, please wait...</p>}
                </footer>
                 {user && selectedChapter && (
                    <div className="p-4 border-t border-gray-700 bg-gray-900/30">
                        <h3 className="text-md font-semibold mb-2">Bookmarks for this chapter:</h3>
                        {(bookmarks[selectedChapter] || []).length > 0 ? (
                            <ul className="space-y-2 max-h-24 overflow-y-auto">
                                {(bookmarks[selectedChapter] || []).map(b => (
                                    <li key={b.id} className="flex items-center justify-between p-2 bg-gray-800 rounded-md text-sm">
                                        <button onClick={() => handlePlay(b)} className="text-left hover:text-indigo-400">
                                            "{b.displayText}"
                                        </button>
                                        <button onClick={() => handleDeleteBookmark(b.id)} className="p-1 text-gray-500 hover:text-red-400">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-sm text-gray-500">No bookmarks yet. Press the bookmark icon during playback to save one.</p>}
                    </div>
                )}
            </main>
        </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-800 text-gray-200 font-sans">
        <header className="flex items-center justify-between p-4 bg-gray-900/50 backdrop-blur-sm border-b border-gray-700">
            <h1 className="text-xl font-bold tracking-wider text-white">AI Book Narrator</h1>
            {isFirebaseConfigured && (
                <div>
                    {user ? (
                        <div className="flex items-center gap-3">
                            <img src={user.photoURL || undefined} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full" />
                            <span className="text-sm hidden sm:inline">{user.displayName}</span>
                            <button onClick={signOutUser} className="px-3 py-1.5 text-sm border border-gray-600 rounded-md hover:bg-gray-700">Sign Out</button>
                        </div>
                    ) : (
                        <button onClick={handleSignIn} className="flex items-center gap-2 px-4 py-2 text-sm bg-white text-gray-800 font-semibold rounded-md hover:bg-gray-200 transition-colors">
                            <GoogleIcon className="w-5 h-5"/>
                            Sign in with Google
                        </button>
                    )}
                </div>
            )}
        </header>
        {renderContent()}
    </div>
  );
};

export default App;