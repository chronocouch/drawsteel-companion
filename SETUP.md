# Draw Steel Companion App — Setup Guide

This guide walks you through everything from zero to a running Firebase project,
including how to use Claude Code for the first time.

---

## Part 1: Install Prerequisites

### 1.1 Node.js
You need Node.js version 22.

1. Go to https://nodejs.org
2. Download the **LTS** version (it will say "Recommended for most users")
3. Run the installer — accept all defaults
4. Open a new terminal window and verify:
   ```
   node --version
   ```
   You should see `v22.x.x` or higher.

### 1.2 Firebase CLI
In your terminal:
```
npm install -g firebase-tools
```
Verify:
```
firebase --version
```

### 1.3 Claude Code
Install the Claude Code CLI:
```
npm install -g @anthropic-ai/claude-code
```
Verify:
```
claude --version
```

> **Note:** Claude Code works with your existing Claude.ai subscription (Pro or Max).
> You do NOT need a separate API key if you log in via your Claude account.

---

## Part 2: Create Your Firebase Project

### 2.1 Create the project
1. Go to https://console.firebase.google.com
2. Click **"Add project"**
3. Name it: `draw-steel-companion` (or anything you like)
4. Disable Google Analytics (not needed)
5. Click **Create project**

### 2.2 Enable Google Sign-In
1. In your Firebase project, go to **Authentication** → **Sign-in method**
2. Click **Google** → Enable → Add your support email → Save

### 2.3 Create Firestore database
1. Go to **Firestore Database** → **Create database**
2. Choose **Start in production mode** (we have security rules ready)
3. Choose your region (e.g., `us-central1` for Minnesota)
4. Click **Enable**

### 2.4 Enable Firebase Hosting
1. Go to **Hosting** → **Get started**
2. Follow the prompts — you'll connect it to the CLI in the next step

### 2.5 Get your Firebase config
1. Go to **Project Settings** (gear icon) → **General**
2. Scroll to **"Your apps"** → Click **"</> Web"**
3. Register app with a nickname like `draw-steel-web`
4. Copy the `firebaseConfig` object — it looks like:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123:web:abc123"
   };
   ```
5. Paste this into `public/js/firebase-config.js` (replacing the placeholder)

---

## Part 3: Connect the CLI to Your Project

In your terminal, navigate to the project folder:
```
cd path/to/drawsteel
```

Log into Firebase:
```
firebase login
```
This opens a browser — sign in with your Google account.

Connect this folder to your Firebase project:
```
firebase use --add
```
Select your project from the list. When it asks for an alias, type: `default`

Verify everything is connected:
```
firebase projects:list
```
Your project should appear with a checkmark.

---

## Part 4: Run the Data Seed (Phase 0)

This populates your Firestore `/abilities` collection from the Steel Compendium data.

Install the seed script dependencies:
```
cd scripts
npm install
cd ..
```

Run the seed:
```
node scripts/seed-local.js
```

This will fetch ability data from GitHub and write it to Firestore.
It takes 1-3 minutes. You'll see progress in the terminal.

Verify it worked: Go to your Firebase console → Firestore → you should see
an `/abilities` collection with hundreds of documents.

---

## Part 5: Deploy the App

Deploy everything (hosting + functions + rules):
```
firebase deploy
```

Your app will be live at: `https://your-project-id.web.app`

For frontend-only changes (faster):
```
firebase deploy --only hosting
```

---

## Part 6: Using Claude Code

Claude Code is a coding assistant that lives in your terminal and can read and edit
your project files. It knows about this project because of the `CLAUDE.md` file.

### Starting Claude Code
```
cd path/to/drawsteel
claude
```

That's it. Claude Code reads CLAUDE.md automatically and understands your project.

### How to ask Claude Code to build things

Be specific about what you want and which file it should work in:

**Good prompts:**
- "Build the ability card component in public/js/abilities.js. Start with the collapsed card view."
- "Write the Google Sign-In flow in public/js/auth.js"
- "Add the End Turn button to session.js. It should reset all five action economy buckets."
- "Write the Firestore security rules based on what's in CLAUDE.md"

**Not as good:**
- "Build the app" (too vague)
- "Fix it" (Claude Code needs to know what "it" is)

### Approving changes
Claude Code will show you the changes it wants to make and ask for approval
before modifying any files. You can:
- Press **Y** or **Enter** to approve
- Press **N** to skip
- Type a message to ask Claude Code to change its approach

### Useful Claude Code commands (type inside Claude Code)
- `/status` — check which model is being used
- `/clear` — start a fresh conversation (good between phases)
- `Ctrl+C` — cancel what Claude Code is doing

### Tips for non-coders
1. **One thing at a time.** Ask Claude Code to build one feature or one file.
2. **Test after each step.** Open `firebase serve` and check the browser.
3. **If something breaks**, tell Claude Code exactly what happened:
   "I opened the app and got a blank screen. The browser console says: [error message]"
4. **Commit to git regularly.** Before each Claude Code session:
   ```
   git add . && git commit -m "description of what you built"
   ```

---

## Part 7: Local Development

Run the app locally (no deploy needed):
```
firebase serve
```
Opens at http://localhost:5000

For functions + hosting together:
```
firebase emulators:start
```
Opens at http://localhost:5000 (hosting) and http://localhost:4000 (emulator UI)

---

## Troubleshooting

**"firebase: command not found"**
→ Close and reopen your terminal, then try again.

**"Permission denied" on npm install**
→ On Mac: `sudo npm install -g firebase-tools`
→ On Windows: Run terminal as Administrator

**Blank screen after deploy**
→ Open browser DevTools (F12) → Console tab → share the red error with Claude Code

**Firestore permission denied**
→ Check firestore.rules — make sure you've deployed rules: `firebase deploy --only firestore:rules`

**Functions deploy fails**
→ Check that functions/package.json has `"node": "22"` in the engines field

---

## Phase Build Order
Once setup is complete, build in this order:

| Phase | Command to start Claude Code session |
|-------|--------------------------------------|
| 1 — Auth + shell | `claude` → "Build Phase 1: Google Sign-In and empty character creation" |
| 2 — Wizard | `claude` → "Build Phase 2: the 10-step character creation wizard" |
| 3 — Cards | `claude` → "Build Phase 3: the ability card viewer with tag system" |
| 4 — Sessions | `claude` → "Build Phase 4: combat session mode with Firestore live sync" |
| 5 — Polish | `claude` → "Build Phase 5: class theming, mobile UX, kit modifiers" |
