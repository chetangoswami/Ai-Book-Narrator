export interface Bookmark {
  id: string; // Unique identifier, e.g., a timestamp
  chapterTitle: string;
  chunkIndex: number;
  startOffset: number; // Time in seconds within the chunk's audio
  displayText: string; // A snippet of the text for UI display
}

export interface Book {
  pdfKey: string;
  fileName: string;
  pdfDownloadUrl: string;
  toc: string[];
  createdAt: any; // Can be a server timestamp
}