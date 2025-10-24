# AI Book Narrator

![AI Book Narrator UI](https://storage.googleapis.com/aistudio-bucket/previews/385f091f-0a1c-42b7-8d96-9f1201979b9a/thumbnail.jpeg)

*Transform any PDF book into a personalized audiobook experience. Upload your book and listen as Gemini brings it to life with a variety of voices and creative narration styles.*

---

## ✨ Key Features

-   **PDF to Audiobook:** Upload any PDF file and have it read aloud.
-   **AI-Powered Content Analysis:** Gemini intelligently verifies if the uploaded PDF is a book and automatically generates a table of contents, even if one isn't explicitly present.
-   **Dynamic Narration:** Listen in a standard voice or choose from a variety of creative styles like "Gen Z," "Pirate," or "Shakespearean actor."
-   **Multiple Voices:** Select from a range of high-quality male and female voices.
-   **Streaming Playback:** Audio is generated and streamed in chunks for a smooth, near-instant listening experience.
-   **Real-time Highlighting:** Follow along as the currently spoken sentence is highlighted in the text.
-   **Full Playback Control:** Play, pause, resume, and stop narration at any time.
-   **Cloud-Synced Bookmarks:** Sign in with Google to save your progress. Create bookmarks at any point in a chapter and seamlessly resume listening later. Your bookmarks are saved per-book.
-   **Sleek & Responsive UI:** A modern, user-friendly interface built with TailwindCSS that works beautifully on all screen sizes.

## 🛠️ Technology Stack

-   **Frontend:** [React](https://reactjs.org/) & [TypeScript](https://www.typescriptlang.org/)
-   **Styling:** [TailwindCSS](https://tailwindcss.com/)
-   **AI Model:** [Google Gemini API](https://ai.google.dev/docs) (specifically `gemini-2.5-pro` for text processing and `gemini-2.5-flash-preview-tts` for text-to-speech)
-   **Backend & Authentication:** [Firebase](https://firebase.google.com/) (Authentication for Google Sign-In, Firestore for bookmark storage)

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or later recommended)
-   A package manager like `npm` or `yarn`
-   A Google account

### Installation & Setup

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/your-username/ai-book-narrator.git
    cd ai-book-narrator
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

3.  **Set up Google Gemini API Key:**
    -   Go to [Google AI Studio](https://aistudio.google.com/) and create an API key.
    -   The application is configured to read the API key from `process.env.API_KEY`. This is typically handled by the hosting environment or a local environment file.

4.  **Set up Firebase:**
    -   Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
    -   In your new project, go to **Project Settings** and copy your web app's Firebase configuration object.
    -   Paste this configuration into the `src/firebaseConfig.ts` file, replacing the existing configuration.
    -   Enable **Authentication**:
        -   Go to the **Authentication** section.
        -   Click "Get started".
        -   Under the "Sign-in method" tab, enable **Google** as a sign-in provider.
        -   **Crucially**, add your development domain (e.g., `localhost`) to the list of **Authorized domains**.
    -   Enable **Firestore Database**:
        -   Go to the **Firestore Database** section.
        -   Create a database in **Production mode**.
        -   Go to the **Rules** tab and update the rules to allow authenticated users to read and write their own data. A basic rule set to start with could be:
            ```
            rules_version = '2';
            service cloud.firestore {
              match /databases/{database}/documents {
                match /users/{userId}/{document=**} {
                  allow read, write: if request.auth.uid == userId;
                }
              }
            }
            ```

5.  **Run the development server:**
    ```sh
    npm run dev
    ```
    Open your browser and navigate to the local server address provided.

## ⚙️ How It Works

1.  **PDF Upload:** The user uploads a PDF file.
2.  **Content Verification:** A `gemini-2.5-flash` call analyzes the PDF's structure to determine if it's a book. This prevents users from uploading invoices or presentations.
3.  **ToC Generation:** A `gemini-2.5-pro` call reads the entire PDF and generates a structured table of contents based on headings and chapter breaks.
4.  **Chapter Selection:** The user selects a chapter from the generated ToC.
5.  **Text Extraction:** `gemini-2.5-pro` is used again to extract the full, clean text for the selected chapter. The text is streamed to the UI for immediate display.
6.  **Audio Generation & Streaming:**
    -   The chapter text is split into smaller, manageable chunks (e.g., 5-7 sentences).
    -   For each chunk, a request is made to the `gemini-2.5-flash-preview-tts` model, including the desired voice and narration style prompt (e.g., "Narrate in the style of a pirate...").
    -   The service returns raw audio data encoded in base64.
7.  **Custom Audio Service:** A custom service in `src/services/audioService.ts` manages a queue of these audio chunks. It decodes the audio and uses the Web Audio API for seamless, gapless playback.
8.  **Real-time Highlighting:** The audio service estimates the duration of each sentence and uses timeouts to update the UI, highlighting the sentence currently being spoken.
9.  **Bookmark Persistence:** When a user logs in and creates a bookmark, the current playback state (chapter, audio chunk index, and time offset) is saved to their user-specific document in Firestore.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for bugs, feature requests, or suggestions.

## 📄 License

This project is licensed under the MIT License.
