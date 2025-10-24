# AI Book Narrator

![AI Book Narrator UI](https://storage.googleapis.com/aistudio-bucket/previews/385f091f-0a1c-42b7-8d96-9f1201979b9a/thumbnail.jpeg)

*Transform any PDF book into a personalized audiobook experience. Upload your book and listen as Gemini brings it to life with a variety of voices and creative narration styles.*

---

## ✨ Key Features

-   **PDF to Audiobook:** Upload any PDF file and have it read aloud.
-   **AI-Powered Content Analysis:** Gemini intelligently verifies if the uploaded PDF is a book and automatically generates a table of contents, even if one isn't explicitly present.
-   **Persistent Cloud Library:** Sign in to save your processed books to a personal library. Access your books, including their generated table of contents and extracted text, from any device at any time.
-   **Cross-Device Audio Caching:** Generated audio is saved to your account in the cloud, so you never have to regenerate it, even when switching devices.
-   **Dynamic Narration:** Listen in a standard voice or choose from a variety of creative styles like "Gen Z," "Pirate," or "Shakespearean actor."
-   **Multiple Voices:** Select from a range of high-quality male and female voices.
-   **Streaming Playback:** Audio is generated and streamed in chunks for a smooth, near-instant listening experience.
-   **Real-time Highlighting:** Follow along as the currently spoken sentence is highlighted in the text.
-   **Full Playback Control:** Play, pause, resume, and stop narration at any time.
-   **Cloud-Synced Bookmarks:** Save your progress within any chapter. Your bookmarks are synced to your account and available across all your devices.
-   **Sleek & Responsive UI:** A modern, user-friendly interface built with TailwindCSS that works beautifully on all screen sizes.

## 🛠️ Technology Stack

-   **Frontend:** [React](https://reactjs.org/) & [TypeScript](https://www.typescriptlang.org/)
-   **Styling:** [TailwindCSS](https://tailwindcss.com/)
-   **AI Model:** [Google Gemini API](https://ai.google.dev/docs) (specifically `gemini-2.5-pro` for text processing and `gemini-2.5-flash-preview-tts` for text-to-speech)
-   **Backend & Data Persistence:** [Firebase](https://firebase.google.com/) (Authentication, Firestore for metadata, and Cloud Storage for audio files)
-   **Client-Side Caching:** IndexedDB for performance-caching of audio to provide instant playback on repeat listens.

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
    -   **Enable Authentication**:
        -   Go to the **Authentication** section.
        -   Click "Get started".
        -   Under the "Sign-in method" tab, enable both **Email/Password** and **Google** as sign-in providers.
        -   **Crucially**, add your development domain (e.g., `localhost`) to the list of **Authorized domains**.
    -   **Enable Firestore Database**:
        -   Go to the **Firestore Database** section.
        -   Create a database in **Production mode**.
        -   Go to the **Rules** tab and paste the following rules. This allows authenticated users to read and write any documents within their own user-specific collection, which is essential for saving their library and bookmarks.
            ```
            rules_version = '2';
            service cloud.firestore {
              match /databases/{database}/documents {
                // Allow users to read/write any documents (books, chapters, audio URLs, bookmarks)
                // stored under their own user ID.
                match /users/{userId}/{document=**} {
                  allow read, write: if request.auth.uid == userId;
                }
              }
            }
            ```
    -   **Enable Cloud Storage**:
        -   Go to the **Storage** section.
        -   Click "Get started" and follow the prompts to create a storage bucket in **Production mode**.
        -   Go to the **Rules** tab and paste the following rules. This allows authenticated users to manage files (read, write, list, and delete) within their own private, user-specific folder.
            ```
            service firebase.storage {
              match /b/{bucket}/o {
                // Allow users to manage files within their own user-specific folder.
                match /users/{userId}/{path=**} {
                  allow read, write, list, delete: if request.auth != null && request.auth.uid == userId;
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

1.  **User Authentication:** The user signs in via Google or Email/Password, creating a secure context for their data.
2.  **PDF Upload & Cloud Storage:** When a user uploads a new book, the original PDF file is securely uploaded to Firebase Storage.
3.  **AI Processing (New Books):**
    -   **Content Verification & ToC Generation:** `gemini-2.5-pro` analyzes the PDF to verify it's a book and generates a structured table of contents.
    -   **Save to Cloud:** The book's metadata (including a link to the stored PDF) and ToC are saved to the user's library in Firestore.
4.  **Chapter Selection & Text Extraction:** When a chapter is selected, the app checks Firestore for the extracted text. If it's not there, it transparently retrieves the stored PDF from the cloud, `gemini-2.5-pro` extracts the text, and the result is saved to Firestore for all future sessions on any device.
5.  **Multi-Layered Audio Caching & Generation:**
    -   **Level 1 (Local Cache):** The app first checks the browser's IndexedDB for the required audio chunk. If found, playback is instant.
    -   **Level 2 (Cloud Cache):** If not found locally, it checks Firestore for a URL to the audio file in Cloud Storage. If a URL exists, the audio is downloaded, played, and saved to the local cache for future speed.
    -   **Level 3 (New Generation):** If the audio doesn't exist anywhere, `gemini-2.5-flash-preview-tts` generates it. The new audio is then uploaded to Cloud Storage, its URL is saved to Firestore, and the audio data itself is cached locally in IndexedDB.
6.  **Streaming Playback:** A custom audio service uses the Web Audio API for seamless, gapless playback and real-time sentence highlighting.
7.  **Bookmark Persistence:** Bookmarks are saved to Firestore, ensuring they are synced across all of the user's devices.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for bugs, feature requests, or suggestions.

## 📄 License

This project is licensed under the MIT License.