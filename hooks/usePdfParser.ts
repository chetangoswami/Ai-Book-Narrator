import { useState, useEffect } from 'react';
import { generateTableOfContents, classifyPdfContent } from '../services/geminiService';

export const useTocGenerator = (file: File | null) => {
  const [toc, setToc] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  useEffect(() => {
    if (!file) {
      setToc([]);
      setError(null);
      setLoading(false);
      setLoadingMessage('');
      return;
    }

    // If the file has a size of 0, it's a placeholder for a book loaded from the library.
    // The App component is responsible for setting the ToC directly, so we should not process it here.
    if (file.size === 0) {
      setLoading(false);
      setError(null);
      setLoadingMessage('');
      return;
    }

    const processPdf = async () => {
      setLoading(true);
      setError(null);
      setToc([]); // Reset ToC for new file processing

      try {
        // Step 1: Classify the PDF
        setLoadingMessage('Analyzing PDF content...');
        const classification = await classifyPdfContent(file);
        
        if (!classification.isBook) {
          setError(`This file doesn't seem to be a book. Reason: ${classification.reason}`);
          setToc([]);
          return; // Stop processing
        }
        
        // Step 2: Generate ToC if it is a book
        setLoadingMessage('Generating Table of Contents...');
        const generatedToc = await generateTableOfContents(file);
        setToc(generatedToc);

      } catch (err) {
        console.error('PDF processing error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to process PDF.';
        setError(errorMessage);
        setToc([]);
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
    };
    
    processPdf();

  }, [file]);

  return { toc, setToc, loading, error, loadingMessage };
};