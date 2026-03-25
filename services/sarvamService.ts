export const generateSarvamSpeech = async (text: string, voiceName: string): Promise<string> => {
    const apiKey = localStorage.getItem('sarvam_api_key');
    if (!apiKey) {
        throw new Error("MISSING_SARVAM_API_KEY");
    }

    // Infer language code from the available voices
    let targetLanguage = "en-IN";
    if (voiceName === "priya" || voiceName === "amit") {
        targetLanguage = "hi-IN";
    }

    try {
        const response = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': apiKey,
            },
            body: JSON.stringify({
                inputs: [text.substring(0, 500)], // Sarvam actually has a much smaller character limit (often 500 chars).
                target_language_code: targetLanguage,
                speaker: voiceName,
                model: "bulbul:v3"
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Sarvam API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const base64Audio = data.audios?.[0];

        if (!base64Audio) {
            throw new Error("No audio data received from Sarvam API response.");
        }

        return base64Audio;
    } catch (error) {
        console.error("Error generating speech with Sarvam:", error);
        throw error;
    }
};
