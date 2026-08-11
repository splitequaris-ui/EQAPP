# Equaris — Split Smarter, Settle Faster

<p align="center">
  <img src="assets/icon.png" alt="Equaris Logo" width="100" height="100" style="border-radius: 24px;" />
</p>

<p align="center">
  <strong>A premium expense-splitting & group finance app built with Expo (React Native) + Firebase</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#environment-variables">Environment Variables</a> •
  <a href="#firebase-setup">Firebase Setup</a> •
  <a href="#project-structure">Project Structure</a> •
  <a href="#running-the-app">Running the App</a>
</p>

---

## Features

- 🏠 **Dashboard** — Real-time spending overview with AI-powered insights
- 👥 **Groups** — Create & manage expense groups with members, budgets and settlement tracking
- 🌐 **Network Hub** — Friend connections, QR code sharing, and peer-to-peer expense logging
- 💰 **Money (Subscriptions)** — Track solo & split subscriptions with billing cycle reminders
- 👤 **Profile** — Editable profile, UPI payment settings, and theme preferences
- 🌓 **Dark / Light Theme** — Fully dynamic theme system with smooth transitions
- 🔒 **Firebase Auth** — Email/password + Google Sign-In
- 🤖 **AI Insights** — Ollama-powered spending analysis on your real data
- 📱 **Expo Go Compatible** — Run instantly on Android / iOS via Expo Go

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile Framework | [Expo](https://expo.dev) (SDK 57) / React Native 0.86 |
| Navigation | [Expo Router](https://expo.github.io/router) (file-based routing) |
| Backend / DB | [Firebase](https://firebase.google.com) (Firestore + Auth) |
| AI / LLM | [Ollama](https://ollama.com) (cloud or local) |
| Icons | [Lucide React Native](https://lucide.dev) |
| SVG | [React Native SVG](https://github.com/software-mansion/react-native-svg) |
| Storage | [@react-native-async-storage](https://react-native-async-storage.github.io/async-storage/) |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Expo CLI** — install globally: `npm install -g expo-cli`
- **Expo Go** app on your phone ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779))
- A **Firebase project** (free Spark plan works)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### `.env` File Reference

```env
# ─── App URL ────────────────────────────────────────────────────────────────
# The URL where the web companion server is hosted (used by the AI insights API)
APP_URL="http://localhost:3000"

# ─── Ollama AI (Spending Insights) ──────────────────────────────────────────
# Option A — Ollama Cloud (recommended, free tier available)
#   Create a free API key at: https://ollama.com/settings/keys
OLLAMA_HOST="https://ollama.com"
OLLAMA_API_KEY="your_ollama_cloud_api_key_here"
OLLAMA_MODEL="gpt-oss:120b"

# Option B — Local Ollama (no key needed)
#   1. Install Ollama from https://ollama.com
#   2. Run: ollama pull llama3.2 && ollama serve
#   3. Set these values instead:
# OLLAMA_HOST="http://localhost:11434"
# OLLAMA_MODEL="llama3.2"
# OLLAMA_API_KEY=   (leave empty)

# ─── Server Port ────────────────────────────────────────────────────────────
PORT=3000
```

> **Important:** Never commit your `.env` file. It is already listed in `.gitignore`.

---

## Firebase Setup

The app uses Firebase for authentication and Firestore as the database.

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add Project** → give it a name → continue
3. Disable Google Analytics (optional) → **Create Project**

### Step 2: Enable Authentication

1. In your Firebase project, go to **Build → Authentication**
2. Click **Get Started**
3. Enable **Email/Password** provider
4. Enable **Google** provider (for Google Sign-In)

### Step 3: Create Firestore Database

1. Go to **Build → Firestore Database**
2. Click **Create Database**
3. Start in **Production mode**
4. Choose a region close to your users
5. Copy the Firestore rules from `firestore.rules` in this repo and paste them into the **Rules** tab

### Step 4: Register the App & Get Config

1. Go to **Project Settings** (gear icon) → **General**
2. Under **Your apps**, click the **`</>`** (Web) button
3. Register the app — you don't need Firebase Hosting
4. Copy the `firebaseConfig` object

### Step 5: Add Firebase Config to the App

Create or edit `lib/firebase.ts` and replace with your config:

```ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const logoutUser = () => auth.signOut();
```

> **Tip:** For production, store your Firebase config values as separate environment variables and load them in `lib/firebase.ts`.

---

## Project Structure

```
EQUARIS APP/
├── app/                        # Expo Router file-based routing
│   ├── _layout.tsx             # Root layout (Auth guard + Theme + SafeArea)
│   ├── (auth)/
│   │   └── login.tsx           # Sign in / Sign up / Google OAuth screen
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Tab bar layout with theme toggle
│   │   ├── index.tsx           # 🏠 Dashboard / Home
│   │   ├── groups.tsx          # 👥 Groups manager
│   │   ├── network.tsx         # 🌐 Network Hub (friends + QR)
│   │   ├── money.tsx           # 💰 Subscriptions
│   │   └── profile.tsx         # 👤 User profile & settings
│   ├── group/
│   │   └── [id].tsx            # Group detail screen
│   ├── subscription/
│   │   ├── new.tsx             # Add new subscription
│   │   └── [id].tsx            # Subscription detail
│   └── onboarding.tsx          # First-time user onboarding
│
├── components/                 # Shared UI components
│   ├── EquarisWalletLogo.tsx   # Custom SVG logo
│   └── GoogleLogo.tsx          # Google sign-in SVG icon
│
├── constants/
│   ├── colors.ts               # Light & dark theme color tokens
│   └── typography.ts           # Font sizes, weights, families
│
├── lib/
│   ├── AppContext.tsx           # Global app state (user, groups, expenses)
│   ├── ThemeContext.tsx         # Light/dark theme provider + persistence
│   ├── firebase.ts             # Firebase init (auth + firestore)
│   ├── firestoreQuery.ts       # Firestore helper wrappers
│   ├── settleEngine.ts         # Debt-settlement calculation logic
│   └── api.ts                  # Ollama AI insights API client
│
├── firestore.rules             # Firestore security rules
├── .env.example                # Environment variable template
├── app.json                    # Expo app configuration
└── package.json
```

---

## Running the App

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Add Firebase config

Edit `lib/firebase.ts` with your Firebase project credentials (see [Firebase Setup](#firebase-setup)).

### 4. Start the Expo dev server

```bash
npx expo start
```

Or with a clean cache (recommended after pulling updates):

```bash
npx expo start --clear
```

### 5. Open on your device

- **Expo Go (recommended):** Scan the QR code shown in the terminal with the Expo Go app
- **Android Emulator:** Press `a` in the terminal
- **iOS Simulator:** Press `i` in the terminal (macOS only)

---

## Theme System

Equaris supports full **Light / Dark / System** theme modes:

- Theme preference is persisted in `AsyncStorage`
- All colors come from `constants/colors.ts` (`lightColors` / `darkColors`)
- Every screen uses the `useTheme()` hook to get dynamic `colors`
- Toggle the theme via the ☀️/🌙 icon in the app header

---

## AI Spending Insights

The dashboard's AI insights feature uses **Ollama** to analyze your real spending data:

- Works with **Ollama Cloud** (free API key at [ollama.com](https://ollama.com/settings/keys))
- Also works with a **local Ollama** instance (completely private, no API key needed)
- No spending data is ever stored externally — it is sent only to the model you configure

---

## License

MIT — free for personal and commercial use.

---

<p align="center">Built with ❤️ using Expo, React Native & Firebase</p>
