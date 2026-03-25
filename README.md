# AI Book Narrator

A highly advanced, strictly offline-first Book Narrator web application. It securely uses **IndexedDB** for persistent offline storage and relies on **Google Gemini** for intelligent structural text extraction, rendering chapters natively into high-quality spoken audio using **Sarvam AI** and **Google Cloud TTS**.

## 🚀 Features

- **Offline-First Library (`IndexedDB v2`):** Your uploaded books, intelligently extracted text chapters, and rendered audio chunks are cached persistently entirely inside your browser's internal local database. You can refresh, disconnect from the internet, and still listen to your previously processed books without external cloud storage limits!
- **Intelligent Table of Contents:** Upload massive PDF textbooks, and the Gemini AI will automatically dissect and structure the entire book into individual, perfectly sequenced chapters.
- **Multi-Provider TTS Engine:** Swap dynamically between official Gemini Cloud Voices or the state-of-the-art **Sarvam AI (`bulbul:v3`)** for seamless, natively-accented Indic and English storytelling.
- **Asynchronous Safe Queuing:** Stream the audio instantly! While you're listening to the very first chunk of a chapter, the background singleton queue is silently pre-fetching Chunks 1, 2, and 3 completely asynchronously. This mathematically bypasses `429 Rate Limit` bottlenecks and browser traffic freezes.
- **Bring Your Own Keys (BYOK):** Securely manage your own Google Gemini API Key and Sarvam API Key completely inside your browser's Sandboxed `localStorage` without any external middleman databases or third-party tracking.

## ⚙️ Quick Start Setup

### 1. Requirements
- Node.js installed globally (`v18+`)
- A **Gemini Developer API Key** (Get yours free from Google AI Studio)
- A **Sarvam API Key** (Optional, highly recommended for natural Indian accents)

### 2. Installation
Clone this repository and install all node modules to spin up the required dependencies.

```bash
git clone https://github.com/chetangoswami/Ai-Book-Narrator.git
cd Ai-Book-Narrator
npm install
```

### 3. Running Locally
Start the powerful Vite development server:
```bash
npm run dev
```

### 4. Configuration
When you launch the web app, simply click the **Settings (Gear Icon)** in the top right corner. Input your respective API keys. They will be saved permanently to your browser, and you are officially ready to upload your first book!

## 🔧 Architecture & Deployment
This application represents a shift away from traditional rigid Backend-As-A-Service providers (like Firebase Cloud Storage restrictions) in favor of the localized `IndexedDB` Web API. Once the generative TTS components stream in, the asset is permanently converted into an offline playback node.

The application uses standard `React`, styled seamlessly with `TailwindCSS`, and interacts natively with the `AudioContext` layer to securely decode raw binary WAV and PCM chunks directly onto the hardware without lag.

Built for deployment on Firebase Hosting via `firebase deploy`.