// --- Audio Decoding Utilities ---

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / 1; // Assuming mono
  const buffer = ctx.createBuffer(1, frameCount, 24000); // 24kHz, mono
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}


// --- Stateful Streaming Audio Service ---

type AudioQueueItem = {
    base64: string;
    text: string;
    chunkIndex: number; // The absolute index of the chunk in the chapter
    buffer?: AudioBuffer;
};

let audioContext: AudioContext | null = null;
let audioQueue = new Map<number, AudioQueueItem>();
let isSessionActive = false;
let isPlayingChunk = false;
let isDecoding = false;
let isPaused = false;
let isFirstChunkOfSession = true;
let isEndOfStream = false;
let nextChunkToPlayIndex = 0;


let currentSource: AudioBufferSourceNode | null = null;
let currentBuffer: AudioBuffer | null = null;
let currentTextChunk: string | null = null;
let currentAbsoluteChunkIndex: number = -1;
let playbackStartTime = 0;
let startOffset = 0;

let highlightTimeouts: number[] = [];
let totalSentencesProcessed = 0;

// Callbacks
let onFirstChunkReadyCallback: (() => void) | null = null;
let onSessionEndedCallback: (() => void) | null = null;
let onSentenceChangeCallback: ((index: number) => void) | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

const clearHighlightTimeouts = () => {
    highlightTimeouts.forEach(clearTimeout);
    highlightTimeouts = [];
};

const _resetState = () => {
    if (currentSource) {
        try {
            currentSource.onended = null;
            currentSource.stop();
        } catch (e) {
            // Ignore errors if source is already stopped
        }
        currentSource.disconnect();
    }
    
    audioQueue.clear();
    isSessionActive = false;
    isPlayingChunk = false;
    isDecoding = false;
    isPaused = false;
    isFirstChunkOfSession = true;
    isEndOfStream = false;
    nextChunkToPlayIndex = 0;
    currentSource = null;
    currentBuffer = null;
    currentTextChunk = null;
    currentAbsoluteChunkIndex = -1;
    playbackStartTime = 0;
    startOffset = 0;
    totalSentencesProcessed = 0;
    
    clearHighlightTimeouts();

    onFirstChunkReadyCallback = null;
    onSessionEndedCallback = null;
    onSentenceChangeCallback = null;
};

const _scheduleHighlightingForChunk = (text: string, buffer: AudioBuffer) => {
    clearHighlightTimeouts();
    if (!onSentenceChangeCallback) return;

    const sentences = text.match(/[^.!?…]+[.!?…]*\s*|.+/g) || [text];
    const totalChars = text.length;
    const audioDuration = buffer.duration;
    
    if (totalChars <= 0 || audioDuration <= 0) return;

    const charsPerSecond = totalChars / audioDuration;
    let cumulativeTimeToSchedule = -startOffset;

    let startingSentenceIndex = 0;
    let currentTimeOffset = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentenceDuration = sentences[i].length / charsPerSecond;
        if (currentTimeOffset + sentenceDuration > startOffset) {
            startingSentenceIndex = i;
            break;
        }
        currentTimeOffset += sentenceDuration;
    }
    onSentenceChangeCallback(totalSentencesProcessed + startingSentenceIndex);

    for (let i = startingSentenceIndex; i < sentences.length - 1; i++) {
        const sentenceDuration = sentences[i].length / charsPerSecond;
        cumulativeTimeToSchedule += sentenceDuration;
        if (cumulativeTimeToSchedule > 0) {
            const timeoutId = window.setTimeout(() => {
                onSentenceChangeCallback?.(totalSentencesProcessed + i + 1);
            }, cumulativeTimeToSchedule * 1000);
            highlightTimeouts.push(timeoutId);
        }
    }
};

let nextPlaybackTime = 0;
const _playChunk = (item: Required<AudioQueueItem>) => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    
    currentBuffer = item.buffer;
    currentTextChunk = item.text;
    currentAbsoluteChunkIndex = item.chunkIndex;
    
    currentSource = ctx.createBufferSource();
    currentSource.buffer = item.buffer;
    currentSource.connect(ctx.destination);
    
    currentSource.onended = () => {
        if (!isPaused) {
            isPlayingChunk = false;
            startOffset = 0;
            const sentencesInChunk = currentTextChunk?.match(/[^.!?…]+[.!?…]*\s*|.+/g) || [];
            totalSentencesProcessed += sentencesInChunk.length;
            _tryToPlayNextChunk();
        }
    };
    
    const effectiveStartOffset = Math.max(0, startOffset % item.buffer.duration);
    
    if (nextPlaybackTime < ctx.currentTime) {
      nextPlaybackTime = ctx.currentTime;
    }

    currentSource.start(nextPlaybackTime, effectiveStartOffset);
    playbackStartTime = ctx.currentTime - effectiveStartOffset;
    
    _scheduleHighlightingForChunk(item.text, item.buffer);
    
    nextPlaybackTime += item.buffer.duration - effectiveStartOffset;

    // After the first chunk uses the initial offset, reset it for subsequent chunks
    if (isFirstChunkOfSession) {
        startOffset = 0;
        isFirstChunkOfSession = false;
    }
};

const _tryToPlayNextChunk = async () => {
    if (!isSessionActive || isPlayingChunk || isDecoding) return;

    // Condition for ending the session: the stream has been signaled as ended, and the queue is empty.
    if (isEndOfStream && audioQueue.size === 0) {
        onSessionEndedCallback?.();
        _resetState();
        return;
    }

    // Check if the *next sequential* chunk is available in the queue.
    if (!audioQueue.has(nextChunkToPlayIndex)) {
        return; // Not ready, wait for the correct chunk to be added.
    }

    isDecoding = true;
    const nextItem = audioQueue.get(nextChunkToPlayIndex)!;

    try {
        if (!nextItem.buffer) {
            const ctx = getAudioContext();
            nextItem.buffer = await decodeAudioData(decode(nextItem.base64), ctx);
        }
    } catch(e) {
        console.error("Failed to decode audio", e);
        _resetState();
        return;
    }
    
    isDecoding = false;
    
    if (!isSessionActive) return;

    if (!isPlayingChunk) {
        const wasFirstChunk = !currentBuffer;
        
        isPlayingChunk = true;
        const itemToPlay = nextItem as Required<AudioQueueItem>;

        // Remove the chunk from the queue and advance the index for the next one.
        audioQueue.delete(nextChunkToPlayIndex);
        nextChunkToPlayIndex++;
        
        if (wasFirstChunk) {
            onFirstChunkReadyCallback?.();
        }

        _playChunk(itemToPlay);
    }
};

export const startStreamingPlayback = (onFirstChunk: () => void, onEnded: () => void, onSentenceChange: (index: number) => void, initialOffset = 0) => {
    stopAudio();
    isSessionActive = true;
    startOffset = initialOffset;
    totalSentencesProcessed = 0;
    onFirstChunkReadyCallback = onFirstChunk;
    onSessionEndedCallback = onEnded;
    onSentenceChangeCallback = onSentenceChange;
    const ctx = getAudioContext();
    nextPlaybackTime = ctx.currentTime;
};

export const addAudioChunkToQueue = (base64Audio: string, textChunk: string, chunkIndex: number) => {
    if (!isSessionActive) return;
    audioQueue.set(chunkIndex, { base64: base64Audio, text: textChunk, chunkIndex });
    _tryToPlayNextChunk();
};

export const signalEndOfStream = () => {
    if (!isSessionActive) return;
    isEndOfStream = true;
    _tryToPlayNextChunk(); // Check if we can/should end the session now.
};

export const pauseAudio = () => {
    if (!currentSource || isPaused || !currentBuffer) return;
    
    const ctx = getAudioContext();
    const elapsedTime = ctx.currentTime - playbackStartTime;
    startOffset = elapsedTime;
    
    isPaused = true;
    clearHighlightTimeouts();
    if (currentSource) {
      currentSource.onended = null;
      currentSource.stop();
    }
};

export const resumeAudio = () => {
    if (!currentBuffer || !currentTextChunk || !isPaused || currentAbsoluteChunkIndex === -1) return;

    const item: Required<AudioQueueItem> = {
        base64: '', // not needed for replay
        text: currentTextChunk,
        buffer: currentBuffer,
        chunkIndex: currentAbsoluteChunkIndex,
    };
    
    isPaused = false;
    
    const ctx = getAudioContext();
    nextPlaybackTime = ctx.currentTime;

    _playChunk(item);
};

export const stopAudio = () => {
    _resetState();
};

export const getCurrentPlaybackState = (): { chunkIndex: number; startOffset: number; currentTextChunk: string } | null => {
    if (!isSessionActive || !currentSource || !currentBuffer || currentAbsoluteChunkIndex === -1 || !currentTextChunk) {
        return null;
    }
    const ctx = getAudioContext();
    const currentOffset = isPaused ? startOffset : (ctx.currentTime - playbackStartTime);

    return {
        chunkIndex: currentAbsoluteChunkIndex,
        startOffset: currentOffset,
        currentTextChunk: currentTextChunk,
    };
};

export const playSimpleAudio = (base64Audio: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        stopAudio();
        const ctx = getAudioContext();
        try {
            const buffer = await decodeAudioData(decode(base64Audio), ctx);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.onended = () => resolve();
            source.start();
        } catch(error) {
            reject(error);
        }
    });
};