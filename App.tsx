import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { extractChapterText, generateSpeech } from './services/geminiService';
import { generateSarvamSpeech } from './services/sarvamService';
import { useTocGenerator } from './hooks/usePdfParser';
import { startStreamingPlayback, addAudioChunkToQueue, stopAudio, pauseAudio, resumeAudio, getCurrentPlaybackState, signalEndOfStream } from './services/audioService';
import { UploadIcon, BookOpenIcon, PlayIcon, StopIcon, SpeakerWaveIcon, PauseIcon, BookmarkIcon, TrashIcon, CogIcon } from './components/icons';
import { Spinner, ThinkingIndicator } from './components/Spinner';
import { AVAILABLE_VOICES, SARVAM_VOICES, VOICE_PREVIEW_TEXT, NARRATION_STYLES } from './constants';
import { playSimpleAudio } from './services/audioService';
import { Bookmark, Book } from './types';
import { User } from 'firebase/auth';
import * as firebaseService from './services/firebaseService';
import { firebaseConfig } from './firebaseConfig';
import { AuthTroubleshooting } from './components/AuthTroubleshooting';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import * as cacheService from './services/cacheService';


declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const App: React.FC = () => {
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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
  const { toc, setToc, loading: parsingPdf, error: pdfError, loadingMessage, retry: retryPdfParse } = useTocGenerator(pdfFile);
  
  const [selectedChapter, setSelectedChapter] = useState<{title: string, index: number} | null>(null);
  const [chapterText, setChapterText] = useState<string>('');
  
  const [ttsProvider, setTtsProvider] = useState<string>('gemini');
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [selectedSlang, setSelectedSlang] = useState<string>('Standard');
  const [isReading, setIsReading] = useState<boolean>(false);
  
  useEffect(() => {
     setTtsProvider(localStorage.getItem('tts_provider') || 'gemini');
  }, []);
  
  // Conditionally switch default voices if the provider changes
  useEffect(() => {
      setSelectedVoice(ttsProvider === 'sarvam' ? 'amelia' : 'Kore');
  }, [ttsProvider]);
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

  const [userBooks, setUserBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const [isAudioFullyLoaded, setIsAudioFullyLoaded] = useState<boolean>(false);
  const audioQueue = useRef<{ audioData: string, text: string, chunkIndex: number }[]>([]);

  const audioCache = useRef<Map<number, { audioData: string, text: string }>>(new Map());
  
  // Singleton Queue for Audio Generation API calls
  const generationQueue = useRef<{textChunk: string, chunkIndex: number, sessionId: number}[]>([]);
  const isGeneratingQueue = useRef<boolean>(false);

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
    if(currentSentenceIndex > -1 && sentenceRefs.current[currentSentenceIndex]) {
      sentenceRefs.current[currentSentenceIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSentenceIndex]);

  useEffect(() => {
    if (isFirebaseConfigured) {
      const unsubscribe = firebaseService.onAuthChange(async (user) => {
        setUser(user);
        if (user) {
          setIsAuthModalOpen(false); // Close modal on successful auth change
        }
      });
      return () => unsubscribe();
    }
  }, [isFirebaseConfigured]);

  // Load books locally
  useEffect(() => {
      const loadLocalBooks = async () => {
          try {
              const books = await cacheService.getAllBooks();
              setUserBooks(books);
          } catch(e) {
              console.error("Failed to load local books", e);
          }
      };
      loadLocalBooks();
  }, []);

  useEffect(() => {
    const loadBookmarks = async () => {
      if (pdfKey) {
        try {
          const storedBookmarks = await cacheService.getBookmarks(pdfKey);
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
  }, [pdfKey]);
  
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
    
    if (errorMessage.includes("MISSING_API_KEY")) {
        setPlaybackError("A Gemini API Key is required. Please set it in the Settings.");
        setIsSettingsModalOpen(true);
    } else if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("Requested entity was not found")) {
        setPlaybackError("Permission denied. Ensure the 'Generative Language API' is enabled for your project.");
    } else {
        setPlaybackError(`Failed to ${context}. Reason: ${errorMessage}`);
    }
    handleStopAudio();
  }, []);

  useEffect(() => {
    if (pdfError && pdfError.includes("MISSING_API_KEY")) {
        setPdfProcessingError("A Gemini API Key is required. Please set it in the Settings.");
        setIsSettingsModalOpen(true);
    } else {
        setPdfProcessingError(pdfError);
    }
  }, [pdfError]);

  const handleSettingsSave = (apiKey: string) => {
      setIsSettingsModalOpen(false);
      setTtsProvider(localStorage.getItem('tts_provider') || 'gemini');
      if (apiKey || localStorage.getItem('sarvam_api_key')) {
          if (pdfFile && pdfProcessingError) {
              setPdfProcessingError(null);
              retryPdfParse();
          }
          if (playbackError) {
              setPlaybackError(null);
              if (selectedChapter && !isTextExtracting && chapterText.length === 0) {
                  handleSelectChapter(selectedChapter.title, selectedChapter.index);
              }
          }
      }
  };
  
  // When usePdfParser hook finishes, if it's a new book, save it to IndexedDB
  useEffect(() => {
    if (pdfFile && pdfFile.size > 0 && !parsingPdf && toc.length > 0) {
        const currentPdfKey = cacheService.getCacheKey(pdfFile);
        const bookExists = userBooks.some(book => book.pdfKey === currentPdfKey);
        if (!bookExists) {
            const newBook: Book = {
                pdfKey: currentPdfKey,
                fileName: pdfFile.name,
                fileData: pdfFile,
                toc: toc,
                createdAt: Date.now()
            };
            cacheService.saveBook(newBook).then(() => {
                // Add the new book to the local state to refresh the UI
                setUserBooks(currentBooks => [newBook, ...currentBooks.sort((a,b) => b.createdAt - a.createdAt)]);
            }).catch((error) => {
                console.error("Local Library sync failed:", error);
                setPdfProcessingError(`Failed to save book to Local Browser Storage. Reason: ${error.message}`);
            });
        }
    }
}, [toc, parsingPdf, pdfFile, userBooks]);


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

  const handleSelectCachedBook = async (book: Book) => {
      resetState();
      setSelectedBook(book);
      // Retrieve the physical File from the LocalBook object
      if (book.fileData) {
          setPdfFile(book.fileData as File);
      } else {
          setPdfProcessingError("Could not retrieve local PDF file.");
          setPdfFile(null);
      }
      setToc(book.toc);
  };

  const handleDeleteBook = async (e: React.MouseEvent, bookToDelete: Book) => {
    e.stopPropagation(); // Prevent handleSelectCachedBook from firing
    
    // Optimistically update UI
    setUserBooks(currentBooks => currentBooks.filter(b => b.pdfKey !== bookToDelete.pdfKey));

    try {
        await cacheService.deleteBook(bookToDelete.pdfKey);
        // If the deleted book was the currently active one, reset the view
        if (pdfKey === bookToDelete.pdfKey) {
          resetState();
          setPdfFile(null);
        }
    } catch (error) {
        console.error("Failed to delete book:", error);
        // Revert UI if deletion fails
        cacheService.getAllBooks().then(setUserBooks);
    }
  };

  const resetState = () => {
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
    setSelectedBook(null);
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
    generationQueue.current = []; // Clear pending generation tasks
  };
  
  const handleSelectChapter = useCallback(async (chapterTitle: string, index: number) => {
    if (!pdfFile || !pdfKey || selectedChapter?.title === chapterTitle) return;

    handleStopAudio();
    setSelectedChapter({ title: chapterTitle, index });
    setChapterText('');
    setPlaybackError(null);
    audioCache.current.clear();
    
    setIsTextExtracting(true);
    isTextExtractionComplete.current = false;
    textExtractionSessionId.current++;
    const sessionId = textExtractionSessionId.current;
    
    let chapterTextContent: string | null = null;
    
    // Check Local Browser Database first
    chapterTextContent = await cacheService.getChapterText(pdfKey, index);

    if (chapterTextContent) {
        setChapterText(chapterTextContent);
        isTextExtractionComplete.current = true;
        setIsTextExtracting(false);
        return;
    }
    
    try {
      let fileToProcess = pdfFile;

      let fullText = '';
      await extractChapterText(fileToProcess, chapterTitle, (textChunk) => {
        if (sessionId !== textExtractionSessionId.current) return; // Stale request
        fullText += textChunk;
        setChapterText(prev => prev + textChunk);
      });

      if (sessionId === textExtractionSessionId.current) {
        isTextExtractionComplete.current = true;
        // Save the newly extracted text to Local DB
        if (pdfKey) {
            await cacheService.saveChapterText(pdfKey, index, fullText);
        }
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
  }, [pdfFile, pdfKey, selectedChapter, user, handlePlaybackError, selectedBook]);

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
        if (textChunk.trim().length === 0 || sessionId !== audioGenerationSessionId.current) return;
        
        try {
            const audioProfileKey = `${selectedVoice}_${selectedSlang}`;
            const audioKey = `${audioProfileKey}_${chunkIndex}`;
            
            // 1. Check local cache (IndexedDB)
            let audioData = await cacheService.getAudioChunk(pdfKey, selectedChapter!.title, audioProfileKey, chunkIndex);
            
            // 2. Generating if it doesn't exist locally
            if (!audioData) {
                if (ttsProvider === 'gemini') {
                    // Throttle requests over the strict 3 RPM free tier TTS limit
                    if (chunkIndex >= 3) {
                        const extraWaitMs = (chunkIndex - 2) * 21000;
                        await new Promise(resolve => setTimeout(resolve, extraWaitMs));
                    }
                    if (sessionId !== audioGenerationSessionId.current) return;
                    audioData = await generateSpeech(textChunk, selectedVoice, selectedSlang);
                } else {
                    // Sarvam
                    // Throttle rapid requests so we don't hit 429 when mass-buffering long chapters.
                    if (chunkIndex >= 5) {
                        const extraWaitMs = (chunkIndex - 4) * 1500; // 1.5 seconds pacing per sequential chunk
                        await new Promise(resolve => setTimeout(resolve, extraWaitMs));
                    }
                    if (sessionId !== audioGenerationSessionId.current) return;
                    audioData = await generateSarvamSpeech(textChunk, selectedVoice);
                }
                
                // Save to local cache
                await cacheService.saveAudioChunk(pdfKey, selectedChapter!.title, audioProfileKey, chunkIndex, audioData);
            }
            
            if (sessionId === audioGenerationSessionId.current && audioData) {
                audioCache.current.set(chunkIndex, { audioData, text: textChunk });
                addAudioChunkToQueue(audioData, textChunk, chunkIndex);
            }
        } catch (e) {
            if (sessionId === audioGenerationSessionId.current) {
                handlePlaybackError(e, `generate/load audio for chunk ${chunkIndex}`);
            }
        }
    }

    if (!sentences) {
        if (isTextExtractionComplete.current) {
            signalEndOfStream();
        }
        return;
    }
    
    // Process the Singleton queue sequentially to avoid 429 API blocks
    const processQueue = async () => {
        if (isGeneratingQueue.current) return;
        isGeneratingQueue.current = true;
        while (generationQueue.current.length > 0) {
            const item = generationQueue.current[0];
            if (item.sessionId !== audioGenerationSessionId.current) {
                 generationQueue.current = [];
                 break;
            }
            await processChunk(item.textChunk, item.chunkIndex);
            generationQueue.current.shift(); // Remove after processing
        }
        isGeneratingQueue.current = false;
    };
    
    const getTargetChunkLength = () => {
        if (ttsProvider === 'sarvam') return 450; // Sarvam has a very strict 500 char length limit.
        if (requestedChunkIndexCounter.current === 0) return 300; // Fast first chunk (~2 sentences)
        if (requestedChunkIndexCounter.current === 1) return 1500; // Medium second chunk (~10 sentences)
        return 4000; // Maximize payload (~40 sentences) to save API limits
    };

    let processedTextInThisRun = "";

    if (isTextExtractionComplete.current) {
        let currentChunk = "";
        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > getTargetChunkLength() && currentChunk.trim().length > 0) {
                const chunkIndex = requestedChunkIndexCounter.current++;
                generationQueue.current.push({ textChunk: currentChunk.trim(), chunkIndex, sessionId: audioGenerationSessionId.current });
                processedTextInThisRun += currentChunk;
                currentChunk = "";
            }
            currentChunk += sentence;
        }
        if (currentChunk.trim().length > 0) {
            const chunkIndex = requestedChunkIndexCounter.current++;
            generationQueue.current.push({ textChunk: currentChunk.trim(), chunkIndex, sessionId: audioGenerationSessionId.current });
            processedTextInThisRun += currentChunk;
        }
        processedTextLength.current += processedTextInThisRun.length;
        signalEndOfStream();
    } else {
        let currentChunk = "";
        let sentencesToProcess = sentences;
        if (sentences.length > 0) {
             sentencesToProcess = sentences.slice(0, -1);
        }
        for (const sentence of sentencesToProcess) {
            if (currentChunk.length + sentence.length > getTargetChunkLength() && currentChunk.trim().length > 0) {
                const chunkIndex = requestedChunkIndexCounter.current++;
                generationQueue.current.push({ textChunk: currentChunk.trim(), chunkIndex, sessionId: audioGenerationSessionId.current });
                processedTextInThisRun += currentChunk;
                currentChunk = "";
            }
            currentChunk += sentence;
        }
        processedTextLength.current += processedTextInThisRun.length;
    }
    
    // Trigger the background queue
    processQueue();
  }, [isAudioRequested, chapterText, selectedChapter, selectedVoice, selectedSlang, pdfKey, user, handlePlaybackError]);


  const handlePlayPauseToggle = () => {
    if (isPaused) { resumeAudio(); setIsPaused(false); } 
    else { pauseAudio(); setIsPaused(true); }
  };

  const handlePreviewVoice = async () => {
    handleStopAudio();
    setPlaybackError(null);
    
    const cacheKey = `${ttsProvider}_${selectedVoice}_${selectedSlang}`;
    if (previewAudioCache[cacheKey]) {
      try { await playSimpleAudio(previewAudioCache[cacheKey]); }
      catch (e) { handlePlaybackError(e, 'play cached voice preview'); }
    } else {
      setIsPreviewingVoice(true);
      try {
        let audioData;
        if (ttsProvider === 'sarvam') {
            audioData = await generateSarvamSpeech(VOICE_PREVIEW_TEXT, selectedVoice);
        } else {
            audioData = await generateSpeech(VOICE_PREVIEW_TEXT, selectedVoice, 'Standard');
        }
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
    if (!pdfKey || !selectedChapter || !isReading) return;
    
    const state = getCurrentPlaybackState();
    if (!state) return;

    setIsSavingBookmark(true);
    const newBookmark: Bookmark = {
        id: Date.now().toString(),
        chapterTitle: selectedChapter.title,
        chunkIndex: state.chunkIndex,
        startOffset: state.startOffset,
        displayText: state.currentTextChunk.substring(0, 50) + '...'
    };
    
    const updatedChapterBookmarks = [...(bookmarks[selectedChapter.title] || []), newBookmark];
    const newBookmarks = { ...bookmarks, [selectedChapter.title]: updatedChapterBookmarks };
    
    try {
        await cacheService.saveBookmarks(pdfKey, newBookmarks);
        setBookmarks(newBookmarks);
    } catch(e) {
        console.error("Failed to save bookmark:", e);
    } finally {
        setIsSavingBookmark(false);
    }
  };
  
  const handleDeleteBookmark = async (bookmarkId: string) => {
    if (!pdfKey || !selectedChapter) return;
    
    const updatedChapterBookmarks = (bookmarks[selectedChapter.title] || []).filter(b => b.id !== bookmarkId);
    const newBookmarks = { ...bookmarks, [selectedChapter.title]: updatedChapterBookmarks };

    try {
        await cacheService.saveBookmarks(pdfKey, newBookmarks);
        setBookmarks(newBookmarks);
    } catch(e) {
        console.error("Failed to delete bookmark:", e);
    }
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

                    {user && userBooks.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-300 mb-4">Or Continue from Your Library</h3>
                            <ul className="space-y-2">
                                {userBooks.map(book => (
                                    <li key={book.pdfKey} onClick={() => handleSelectCachedBook(book)}
                                      className="group w-full text-left p-3 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors cursor-pointer flex justify-between items-center">
                                        <span>{book.fileName}</span>
                                        <button onClick={(e) => handleDeleteBook(e, book)} className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {!user && (
                      <p className="text-gray-400 mt-6">
                        <button onClick={() => setIsAuthModalOpen(true)} className="text-indigo-400 hover:underline font-semibold">Sign in</button> to save books to your library and access them from any device.
                      </p>
                    )}
                </div>
            </div>
        );
    }
    
    if (pdfProcessingError) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <p className="text-red-400 max-w-md">{pdfProcessingError}</p>
                <button onClick={() => { setPdfFile(null); setPdfProcessingError(null); setToc([]); }} className="mt-4 px-6 py-2 bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors">
                    Back to Library
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
                    {toc.map((chapter, index) => (
                        <li key={chapter} onClick={() => handleSelectChapter(chapter, index)}
                            className={`p-2 rounded-md cursor-pointer transition-colors text-sm ${selectedChapter?.title === chapter ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700'}`}>
                            {chapter}
                        </li>
                    ))}
                </ul>
            </aside>
            <main className="w-3/4 flex flex-col">
                <div className="p-6 overflow-y-auto flex-1" ref={contentRef}>
                    {selectedChapter ? (
                        <>
                            <h1 className="text-2xl font-bold mb-2">{selectedChapter.title}</h1>
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
                                {ttsProvider === 'sarvam' 
                                  ? SARVAM_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)
                                  : AVAILABLE_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)
                                }
                            </select>
                        </div>
                         <div className="flex-1">
                            <label htmlFor="slang-select" className="sr-only">Style</label>
                            <select id="slang-select" value={selectedSlang} onChange={e => setSelectedSlang(e.target.value)} disabled={isReading || isGeneratingAudio || ttsProvider === 'sarvam'} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 w-full disabled:opacity-70 disabled:cursor-not-allowed">
                                {ttsProvider === 'sarvam' 
                                  ? <option value="Standard">N/A (Sarvam AI)</option>
                                  : NARRATION_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                                }
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
                        {(bookmarks[selectedChapter.title] || []).length > 0 ? (
                            <ul className="space-y-2 max-h-24 overflow-y-auto">
                                {(bookmarks[selectedChapter.title] || []).map(b => (
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
                {pdfFile && (
                  <button onClick={() => { setPdfFile(null); resetState(); }} className="px-3 py-1.5 text-sm border border-gray-600 rounded-md hover:bg-gray-700 transition-colors">Back to Library</button>
                )}
                 {user && userBooks.length > 0 && (
                     <button onClick={cacheService.clearAllData} className="px-3 py-1.5 text-sm border border-gray-600 rounded-md hover:bg-gray-700 transition-colors">Clear Audio Cache</button>
                 )}
                {isFirebaseConfigured && (
                    <>
                        {user ? (
                            <div className="flex items-center gap-3">
                                <img src={user.photoURL || `https://api.dicebear.com/8.x/initials/svg?seed=${user.email}`} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full bg-gray-600" />
                                <span className="text-sm hidden sm:inline">{user.displayName || user.email}</span>
                                <button onClick={firebaseService.signOutUser} className="px-3 py-1.5 text-sm border border-gray-600 rounded-md hover:bg-gray-700 transition-colors">Sign Out</button>
                            </div>
                        ) : (
                            <button onClick={() => setIsAuthModalOpen(true)} className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors">
                                Sign In / Sign Up
                            </button>
                        )}
                    </>
                )}
                <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 text-gray-400 hover:text-white transition-colors" aria-label="Settings">
                    <CogIcon className="w-6 h-6" />
                </button>
            </div>
        </header>
        {renderContent()}
        {isAuthModalOpen && <AuthModal onClose={() => setIsAuthModalOpen(false)} />}
        <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} onSave={handleSettingsSave} />
    </div>
  );
};

export default App;