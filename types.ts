export interface Bookmark {
  id: string; // Unique identifier, e.g., a timestamp
  chapterTitle: string;
  chunkIndex: number;
  startOffset: number; // Time in seconds within the chunk's audio
  displayText: string; // A snippet of the text for UI display
}
