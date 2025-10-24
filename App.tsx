import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { extractChapterText, generateSpeech } from './services/geminiService';
import { useTocGenerator } from './hooks/usePdfParser';
import { startStreamingPlayback, addAudioChunkToQueue, stopAudio, pauseAudio, resumeAudio, getCurrentPlaybackState, signalEndOfStream } from './services/audioService';
import { UploadIcon, BookOpenIcon, PlayIcon, StopIcon, SpeakerWaveIcon, PauseIcon, BookmarkIcon, TrashIcon } from './components/icons';
import { Spinner, ThinkingIndicator } from './components/Spinner';
import { AVAILABLE_VOICES, VOICE_PREVIEW_TEXT, NARRATION_STYLES } from './constants';
import { playSimpleAudio } from './services/audioService';
import { Bookmark, CachedBook } from './types';
import { User } from 'firebase/auth';
import { onAuthChange, signOutUser, loadBookmarksForFile, saveBookmarksForFile } from './services/firebaseService';
import { firebaseConfig } from './firebaseConfig';
import { AuthTroubleshooting } from './components/AuthTroubleshooting';
import { AuthModal } from './components/AuthModal';
import * as cacheService from './services/cacheService';


declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const App: React.FC = () => {
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    if (
      firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" &&
      firebaseConfig.appId && firebaseConfig.appId !== "YOUR_APP_ID"
    ) {
      setIsFirebaseConfigured(true);
    }
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const { toc, setToc, loading: parsingPdf, error: pdfError, loadingMessage } = useTocGenerator(pdfFile);
  
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [chapterText, setChapterText] = useState<string>('');
  
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [selectedSlang, setSelectedSlang] = useState<string>('Standard');
  const [isReading, setIsReading] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  
  const [isTextExtracting, setIsTextExtracting] = useState<boolean>(false);
  const [isAudioRequested, setIsAudioRequested] = useState<boolean>(false);
  
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const [previewAudioCache, setPreviewAudioCache] = useState<Record<string, string>>({});
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(-1);
  const [pdfProcessingError, setPdfProcessingError] = useState<string | null>(pdfError);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark[]>>({});
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const pdfKey = useMemo(() => pdfFile ? cacheService.getCacheKey(pdfFile) : null, [pdfFile]);

  const [cachedBooks, setCachedBooks] = useState<CachedBook[]>([]);

  const [isAudioFullyLoaded, setIsAudioFullyLoaded] = useState<boolean>(false);
  const audioCache = useRef<Map<number, { audioData: string; text: string }>>(new Map());

  const contentRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const textExtractionSessionId = useRef(0);
  const audioGenerationSessionId = useRef(0);
  const requestedChunkIndexCounter = useRef(0);
  const processedTextLength = useRef(0);
  const isTextExtractionComplete = useRef(false);
  
  const sentences = useMemo(() => chapterText.match(/[^.!?…]+[.!?…]*\s*|.+/g) || [], [chapterText]);
  const isGeneratingAudio = isAudioRequested && !isAudioFullyLoaded;

  useEffect(() => {
    cacheService.getAllCachedBooks().then(setCachedBooks);
  }, []);

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
          setIsAuthModalOpen(false); // Close modal on successful auth change
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
  
  useEffect(() => {
    if (isReading || isAudioRequested) {
        handleStopAudio();
    }
    setIsAudioFullyLoaded(false);
    audioCache.current.clear();
  }, [selectedVoice, selectedSlang]);

  const handlePlaybackError = useCallback((e: unknown, context: string) => {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error during ${context}:`, e);
    if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("Requested entity was not found")) {
        setPlaybackError("Permission denied. Ensure the 'Generative Language API' is enabled for your project.");
    } else {
        setPlaybackError(`Failed to ${context}. Please try again.`);
    }
    handleStopAudio();
  }, []);

  useEffect(() => {
    setPdfProcessingError(pdfError);
  }, [pdfError]);
  
  useEffect(() => {
      // When usePdfParser hook finishes and generates a ToC for a NEW file, cache it.
      if (pdfFile && !parsingPdf && toc.length > 0) {
          const key = cacheService.getCacheKey(pdfFile);
          cacheService.getTOC(key).then(cachedToc => {
              if (!cachedToc) {
                  cacheService.savePDF(key, pdfFile.name, pdfFile);
                  cacheService.saveTOC(key, toc);
                  cacheService.getAllCachedBooks().then(setCachedBooks);
              }
          });
      }
  }, [toc, parsingPdf, pdfFile]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      resetState(false); // Don't clear the file list
      setPdfFile(file);
    } else {
      setPdfProcessingError('Please upload a valid PDF file.');
      setPdfFile(null);
    }
  };

  const handleSelectCachedBook = async (key: string) => {
      resetState(false);
      const [cachedPdf, cachedToc] = await Promise.all([
          cacheService.getPDF(key),
          cacheService.getTOC(key)
      ]);
      if (cachedPdf && cachedToc) {
          setPdfFile(cachedPdf);
          setToc(cachedToc);
      } else {
          setPdfProcessingError("Failed to load book from cache. It might have been cleared.");
          // remove the book from cache list
          setCachedBooks(books => books.filter(b => b.key !== key));
          await cacheService.deleteBook(key);
      }
  };

  const resetState = (clearFileList: boolean) => {
    handleStopAudio();
    textExtractionSessionId.current++; // Invalidate any ongoing text extraction
    setSelectedChapter(null);
    setChapterText('');
    setCurrentSentenceIndex(-1);
    setPdfProcessingError(null);
    setPlaybackError(null);
    setBookmarks({});
    setIsTextExtracting(false);
    isTextExtractionComplete.current = false;
    setPdfFile(null);
    setToc([]);
    if (clearFileList) {
      setCachedBooks([]);
    }
  };
  
  const handleStopAudio = () => {
    audioGenerationSessionId.current++;
    stopAudio();
    setIsReading(false);
    setIsPaused(false);
    setCurrentSentenceIndex(-1);
    setIsAudioRequested(false);
    setIsAudioFullyLoaded(false);
    processedTextLength.current = 0;
    requestedChunkIndexCounter.current = 0;
  };
  
  const handleSelectChapter = useCallback(async (chapterTitle: string) => {
    if (!pdfFile || !pdfKey || selectedChapter === chapterTitle) return;

    handleStopAudio();
    setSelectedChapter(chapterTitle);
    setChapterText('');
    setPlaybackError(null);
    audioCache.current.clear();
    
    setIsTextExtracting(true);
    isTextExtractionComplete.current = false;
    textExtractionSessionId.current++;
    const sessionId = textExtractionSessionId.current;
    
    // Check cache first
    const cachedText = await cacheService.getChapterText(pdfKey, chapterTitle);
    if (cachedText) {
        setChapterText(cachedText);
        isTextExtractionComplete.current = true;
        setIsTextExtracting(false);
        return;
    }
    
    try {
      let fullText = '';
      await extractChapterText(pdfFile, chapterTitle, (textChunk) => {
        if (sessionId !== textExtractionSessionId.current) return; // Stale request
        fullText += textChunk;
        setChapterText(prev => prev + textChunk);
      });
      if (sessionId === textExtractionSessionId.current) {
        isTextExtractionComplete.current = true;
        await cacheService.saveChapterText(pdfKey, chapterTitle, fullText);
      }
    } catch (e) {
      if (sessionId === textExtractionSessionId.current) {
        handlePlaybackError(e, 'text extraction');
      }
    } finally {
      if (sessionId === textExtractionSessionId.current) {
        setIsTextExtracting(false);
      }
    }
  }, [pdfFile, pdfKey, selectedChapter, handlePlaybackError]);

  const handlePlay = async (startFromBookmark?: Bookmark) => {
    if (!selectedChapter) return;
    
    handleStopAudio();

    if (isAudioFullyLoaded && audioCache.current.size > 0) {
        startStreamingPlayback(
            () => { setIsReading(true); setIsPaused(false); }, 
            () => { setIsReading(false); setIsPaused(false); setCurrentSentenceIndex(-1); }, 
            (index) => setCurrentSentenceIndex(index),
            startFromBookmark?.startOffset ?? 0
        );
        for (const [index, chunkData] of audioCache.current.entries()) {
             addAudioChunkToQueue(chunkData.audioData, chunkData.text, index);
        }
        signalEndOfStream(); // Signal end since we are playing from cache
        return;
    }

    setIsAudioRequested(true);
    audioGenerationSessionId.current++;
    processedTextLength.current = 0;
    
    startStreamingPlayback(
      () => { setIsReading(true); setIsPaused(false); },
      () => { setIsReading(false); setIsPaused(false); setCurrentSentenceIndex(-1); setIsAudioFullyLoaded(true); },
      (index) => setCurrentSentenceIndex(index),
      startFromBookmark?.startOffset ?? 0
    );
  };
  
  useEffect(() => {
    if (!isAudioRequested || !selectedChapter || !pdfKey) return;

    const sessionId = audioGenerationSessionId.current;
    const sentenceRegex = /[^.!?…]+[.!?…]*/g;
    const sentencesPerChunk = 2;

    const unprocessedText = chapterText.substring(processedTextLength.current);
    const sentences = unprocessedText.match(sentenceRegex);

    const processChunk = async (textChunk: string, chunkIndex: number) => {
        if (textChunk.trim().length === 0) return;

        try {
            // Check cache for audio chunk
            const audioKey = `${selectedVoice}_${selectedSlang}`;
            let audioData = await cacheService.getAudioChunk(pdfKey, selectedChapter, audioKey, chunkIndex);
            
            if (!audioData) {
                audioData = await generateSpeech(textChunk, selectedVoice, selectedSlang);
                await cacheService.saveAudioChunk(pdfKey, selectedChapter, audioKey, chunkIndex, audioData);
            }
            
            if (sessionId === audioGenerationSessionId.current) {
                audioCache.current.set(chunkIndex, { audioData, text: textChunk });
                addAudioChunkToQueue(audioData, textChunk, chunkIndex);
            }
        } catch (e) {
            handlePlaybackError(e, `generate/load audio for chunk ${chunkIndex}`);
        }
    }

    if (!sentences) {
        if (isTextExtractionComplete.current) {
            signalEndOfStream();
        }
        return;
    }
    
    if (isTextExtractionComplete.current) {
        if (processedTextLength.current < chapterText.length) {
            const textChunk = sentences.join(' ');
            if (textChunk.trim().length > 0) {
                const chunkIndex = requestedChunkIndexCounter.current++;
                processChunk(textChunk, chunkIndex);
            }
            processedTextLength.current = chapterText.length;
        }
        signalEndOfStream();
    } else {
        if (sentences.length >= sentencesPerChunk) {
            const numChunksToProcess = Math.floor(sentences.length / sentencesPerChunk);
            const sentencesToProcess = sentences.slice(0, numChunksToProcess * sentencesPerChunk);
            
            let processedTextInThisRun = '';

            for (let i = 0; i < numChunksToProcess; i++) {
                const chunkSentences = sentencesToProcess.slice(i * sentencesPerChunk, (i + 1) * sentencesPerChunk);
                const textChunk = chunkSentences.join(' ');
                
                processedTextInThisRun += chunkSentences.join('');

                const chunkIndex = requestedChunkIndexCounter.current++;
                processChunk(textChunk, chunkIndex);
            }
            processedTextLength.current += processedTextInThisRun.length;
        }
    }
  }, [isAudioRequested, chapterText, selectedChapter, selectedVoice, selectedSlang, pdfKey, handlePlaybackError]);


  const handlePlayPauseToggle = () => {
    if (isPaused) { resumeAudio(); setIsPaused(false); } 
    else { pauseAudio(); setIsPaused(true); }
  };

  const handlePreviewVoice = async () => {
    handleStopAudio();
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

  const handleClearCache = async () => {
      await cacheService.clearAllData();
      resetState(true);
  };

  const getStatusMessage = () => {
    if (isTextExtracting && isGeneratingAudio) return "Extracting text & generating audio...";
    if (isTextExtracting) return "Extracting chapter text...";
    if (isGeneratingAudio) return "Generating audio...";
    return null;
  };

  const renderContent = () => {
    if (!isFirebaseConfigured) {
      return (
        <div className="flex-1 flex items-center justify-center p-4">
          <AuthTroubleshooting message="Firebase is not configured. Please check your `firebaseConfig.ts` file and ensure all the values from your Firebase project console have been added correctly." />
        </div>
      );
    }
    if (parsingPdf) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <ThinkingIndicator text={loadingMessage} />
            </div>
        );
    }

    if (!pdfFile) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="max-w-xl w-full">
                    <div className="border-2 border-dashed border-gray-600 rounded-2xl p-10 flex flex-col items-center justify-center hover:border-indigo-500 transition-colors mb-8">
                        <UploadIcon className="w-16 h-16 text-gray-500 mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">Upload a New Book</h2>
                        <p className="text-gray-400 mb-6">Drag and drop a PDF file or click to select</p>
                        <input type="file" onChange={handleFileChange} accept="application/pdf" className="hidden" id="pdf-upload" />
                        <label htmlFor="pdf-upload" className="px-6 py-2 bg-indigo-600 rounded-md cursor-pointer hover:bg-indigo-700 transition-colors">
                            Select PDF
                        </label>
                    </div>
                    {pdfProcessingError && <p className="text-red-400 my-4">{pdfProcessingError}</p>}

                    {cachedBooks.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-300 mb-4">Or Continue Reading</h3>
                            <ul className="space-y-2">
                                {cachedBooks.map(book => (
                                    <li key={book.key}>
                                        <button onClick={() => handleSelectCachedBook(book.key)} className="w-full text-left p-3 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors">
                                            {book.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    if (pdfProcessingError) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <p className="text-red-400 max-w-md">{pdfProcessingError}</p>
                <button onClick={() => resetState(false)} className="mt-4 px-6 py-2 bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors">
                    Try another file
                </button>
            </div>
        );
    }

    const statusMessage = getStatusMessage();

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
                            <h1 className="text-2xl font-bold mb-2">{selectedChapter}</h1>
                            <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed">
                                {sentences.map((sentence, index) => (
                                    <span key={index} ref={el => sentenceRefs.current[index] = el}
                                        className={`transition-colors duration-300 ${currentSentenceIndex === index ? 'text-indigo-300' : ''}`}>
                                        {sentence}
                                    </span>
                                ))}
                                {(isTextExtracting && !isReading) && (
                                    <span className="inline-block w-2.5 h-6 bg-indigo-400 animate-blink-cursor ml-1 align-bottom"></span>
                                )}
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
                            <select id="voice-select" value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} disabled={isReading || isGeneratingAudio} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 w-full disabled:opacity-70 disabled:cursor-not-allowed">
                                {AVAILABLE_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                        </div>
                         <div className="flex-1">
                            <label htmlFor="slang-select" className="sr-only">Style</label>
                            <select id="slang-select" value={selectedSlang} onChange={e => setSelectedSlang(e.target.value)} disabled={isReading || isGeneratingAudio} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 w-full disabled:opacity-70 disabled:cursor-not-allowed">
                                {NARRATION_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <button onClick={handlePreviewVoice} disabled={isPreviewingVoice || isReading || isGeneratingAudio || isTextExtracting} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50">
                            {isPreviewingVoice ? <Spinner /> : <SpeakerWaveIcon className="w-6 h-6" />}
                        </button>
                    </div>
                    <div className="flex items-center justify-center gap-4">
                        <button 
                            onClick={() => handlePlay()} 
                            disabled={!selectedChapter || isReading || isGeneratingAudio || chapterText.length === 0} 
                            className="p-4 bg-indigo-600 rounded-full text-white shadow-lg hover:bg-indigo-500 active:bg-indigo-700 active:scale-95 transform transition-all duration-150 ease-in-out disabled:bg-indigo-900/50 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
                            aria-label="Generate and play audio"
                        >
                            {isGeneratingAudio ? <Spinner /> : <PlayIcon className="w-8 h-8" />}
                        </button>
                        <button 
                            onClick={handlePlayPauseToggle} 
                            disabled={!isReading} 
                            className="p-4 bg-gray-700 rounded-full text-white shadow-md hover:bg-gray-600 active:bg-gray-800 active:scale-95 transform transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                            aria-label={isPaused ? "Resume" : "Pause"}
                        >
                            {isPaused ? <PlayIcon className="w-8 h-8" /> : <PauseIcon className="w-8 h-8" />}
                        </button>
                        <button 
                            onClick={handleStopAudio} 
                            disabled={!isReading && !isAudioRequested && !isTextExtracting} 
                            className="p-4 bg-gray-700 rounded-full text-white shadow-md hover:bg-gray-600 active:bg-gray-800 active:scale-95 transform transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                            aria-label="Stop"
                        >
                            <StopIcon className="w-8 h-8" />
                        </button>
                         {user && (
                            <button 
                                onClick={handleAddBookmark} 
                                disabled={!isReading || isSavingBookmark} 
                                className="p-4 bg-gray-700 rounded-full text-white shadow-md hover:bg-gray-600 active:bg-gray-800 active:scale-95 transform transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                aria-label="Add bookmark"
                            >
                                {isSavingBookmark ? <Spinner /> : <BookmarkIcon className="w-8 h-8" />}
                            </button>
                        )}
                    </div>
                    {statusMessage && <p className="text-center text-sm text-gray-400">{statusMessage}</p>}
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
            <div className="flex items-center gap-3">
                {cachedBooks.length > 0 && (
                     <button onClick={handleClearCache} className="px-3 py-1.5 text-sm border border-gray-600 rounded-md hover:bg-red-800 hover:border-red-700 transition-colors">Clear All Books</button>
                )}
                {isFirebaseConfigured && (
                    <>
                        {user ? (
                            <div className="flex items-center gap-3">
                                <img src={user.photoURL || `https://api.dicebear.com/8.x/initials/svg?seed=${user.email}`} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full bg-gray-600" />
                                <span className="text-sm hidden sm:inline">{user.displayName || user.email}</span>
                                <button onClick={signOutUser} className="px-3 py-1.5 text-sm border border-gray-600 rounded-md hover:bg-gray-700 transition-colors">Sign Out</button>
                            </div>
                        ) : (
                            <button onClick={() => setIsAuthModalOpen(true)} className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors">
                                Sign In / Sign Up
                            </button>
                        )}
                    </>
                )}
            </div>
        </header>
        {renderContent()}
        {isAuthModalOpen && <AuthModal onClose={() => setIsAuthModalOpen(false)} />}
    </div>
  );
};

export default App;