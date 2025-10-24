import { GoogleGenAI, Modality, Type } from "@google/genai";

const getAiClient = () => {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable is not set.");
    }
    return new GoogleGenAI({ apiKey: API_KEY });
};

const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject(new Error("Failed to read file as base64"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
    const data = await base64EncodedDataPromise;
    return {
      inlineData: { data, mimeType: file.type },
    };
};

export const classifyPdfContent = async (file: File): Promise<{ isBook: boolean; reason: string }> => {
    try {
        const ai = getAiClient();
        const pdfPart = await fileToGenerativePart(file);
        const prompt = "Analyze the first few pages of this PDF and determine if it is a book (novel, textbook, non-fiction, etc.) or something else (like an invoice, presentation, form, etc.). Return a JSON object with two keys: 'isBook' (a boolean) and 'reason' (a brief string explaining your decision). Output ONLY the JSON object and nothing else.";

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, pdfPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isBook: { type: Type.BOOLEAN },
                        reason: { type: Type.STRING }
                    }
                }
            }
        });

        const jsonString = response.text.trim();
        const result = JSON.parse(jsonString);

        if (typeof result.isBook === 'boolean' && typeof result.reason === 'string') {
            return result;
        } else {
            throw new Error("Invalid JSON structure received from Gemini for PDF classification.");
        }

    } catch (error) {
        console.error("Error classifying PDF content:", error);
        throw new Error("Failed to classify PDF content with Gemini.");
    }
};


export const generateTableOfContents = async (file: File): Promise<string[]> => {
    try {
        const ai = getAiClient();
        const pdfPart = await fileToGenerativePart(file);
        const prompt = "Analyze the provided PDF and generate a table of contents. The book might not have an explicit one, so analyze the headings and structure to create one. Return it as a JSON array of strings, where each string is a chapter or section title. Example: [\"Chapter 1: The Beginning\", \"Chapter 2: The Journey\"]. Output ONLY the JSON array and nothing else.";

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: { parts: [{text: prompt}, pdfPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING
                    }
                }
            }
        });

        const jsonString = response.text.trim();
        // Defensive parsing
        if (!jsonString.startsWith('[') || !jsonString.endsWith(']')) {
             return [];
        }
        const toc = JSON.parse(jsonString);
        return Array.isArray(toc) ? toc.filter(item => typeof item === 'string') : [];

    } catch (error) {
        console.error("Error generating table of contents:", error);
        throw new Error("Failed to generate table of contents with Gemini.");
    }
};

export const extractChapterText = async (file: File, chapterTitle: string, onChunk: (chunk: string) => void): Promise<void> => {
    try {
        const ai = getAiClient();
        const pdfPart = await fileToGenerativePart(file);
        const prompt = `From the provided PDF, extract the full text for the chapter or section titled "${chapterTitle}". Extract only the text of that chapter/section, maintaining paragraph breaks. Do not include the chapter title in the output. Provide only the chapter's content without any extra commentary or explanations.`;

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-pro',
            contents: { parts: [{text: prompt}, pdfPart] },
        });
        
        for await (const chunk of responseStream) {
            onChunk(chunk.text);
        }
    } catch (error) {
        console.error(`Error extracting text for chapter "${chapterTitle}":`, error);
        throw new Error("Failed to extract chapter text with Gemini.");
    }
};


export const generateSpeech = async (text: string, voiceName: string, slang: string): Promise<string> => {
    try {
        const ai = getAiClient();

        let promptText = text;
        if (slang !== 'Standard') {
            promptText = `Narrate the following text in the style of ${slang}: "${text}"`;
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: promptText.substring(0, 5000) }] }], // Limit to 5000 chars for TTS
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName },
                    },
                },
            },
        });
        
        const candidate = response.candidates?.[0];
        const base64Audio = candidate?.content?.parts?.[0]?.inlineData?.data;
        
        if (!base64Audio) {
            if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                throw new Error(`Speech generation failed. Reason: ${candidate.finishReason}.`);
            }
            throw new Error("No audio data received from Gemini API. The response may have been empty or blocked.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw error; // Re-throw the original error to be handled by the UI
    }
};