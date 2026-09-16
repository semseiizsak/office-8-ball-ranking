# Office 8-Ball Rankings

A small office pool leaderboard built with React, Vite, TypeScript, and Firebase
Firestore. Players are ranked with an Elo system using a base rating of 1000 and
a K-factor of 32.

## Features

- Elo leaderboard ordered by rating
- Player profiles, streaks, recent form, and head-to-head nemesis stats
- Match logging with projected Elo changes
- First-launch player selection stored locally on the device
- Profile editing with compressed gallery avatar uploads
- Logged event history with transactional edit and delete controls
- Atomic Firestore transactions for match results
- Player creation with department, title, and ball preference
- Production deployment through Vercel
- Browser push notifications for challenges and logged matches

## Requirements

- Node.js 20 or newer
- A Firebase project with Firestore enabled
- A Firebase Web App registered in that project

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file from the template:

```bash
cp .env.example .env.local
```

Fill in the `VITE_FIREBASE_*` values in `.env.local` using the Firebase Console
Project Settings page. Firebase Web API keys are intended to be present in client
applications; Firestore Security Rules protect the database.

Start the development server:

```bash
npm run dev
```

Open <http://localhost:3000>.

## Firestore Setup

The app uses two collections:

### `players`

Each document stores the player identity and rating state:

- `name`, `department`, `title`, `avatarUrl`, `ballPreference`
- `elo`, `peakElo`, `wins`, `losses`
- `currentStreak`, `bestWinStreak`, `breakAndRuns`, `recentForm`
- `createdAt`

### `matches`

Each document stores an immutable match snapshot:

- `playerAId`, `playerBId`, `winnerId`, `loserId`
- `playerAName`, `playerBName`
- `playerAEloBefore`, `playerAEloAfter`, `playerBEloBefore`, `playerBEloAfter`
- `eloDelta`, `eloExchanged`, `isUpset`, `modifiers`, `timestamp`

`logMatch` reads both players and writes both updated player documents plus the
match document in one Firestore transaction. This prevents concurrent match
submissions from overwriting rating changes.

Editing or deleting an event replays the match history in chronological order
inside a Firestore transaction. Player Elo, streaks, wins, losses, and later match
snapshots are recalculated so corrections do not leave derived statistics stale.

There is intentionally no sign-in flow. On launch, each device chooses a player
or creates one, and the selected player ID is stored in browser local storage.
The profile button in the top-right opens the selected player's shared profile,
including name, role, ball preference, and profile picture.

The repository includes [firestore.rules](firestore.rules). Those rules are open
for development and allow unauthenticated reads and writes. Lock them down with
Firebase Authentication before sharing the app outside the office.

## Commands

```bash
npm run dev      # Start Vite locally
npm run lint     # Type-check without emitting files
npm run build    # Create the production bundle
npm run preview  # Preview the production bundle locally
```

## Deploying

The project is configured for Vercel's Vite detection. Set all `VITE_FIREBASE_*`
variables in the Vercel project, then deploy:

```bash
vercel --prod
```

Pushes to the connected `main` branch can also trigger Vercel deployments.

## Push Notifications

Push uses Firebase Cloud Messaging and the Firebase Functions in `functions/`.
The app registers the selected player's browser token and supports two events:

- A profile challenge sends a notification to the challenged player's devices.
- A logged match sends a league update to every registered player's devices.

One-time Firebase setup:

1. In Firebase Console, open **Project settings > Cloud Messaging**.
2. Under **Web configuration**, create or copy the Web Push certificate key.
3. Add it locally as `VITE_FIREBASE_VAPID_KEY` in `.env.local`.
4. Add the same variable to Vercel for Production and redeploy.
5. Upgrade the Firebase project to the Blaze plan if prompted. Cloud Functions
	requires Blaze billing, although normal notification usage can remain within
	the free usage quotas.
6. Deploy the notification functions:

```bash
npx firebase-tools deploy --only functions --project office-8ball
```

The browser must grant notification permission. On iPhone, install the site to
the Home Screen first, then open the installed app and select your player.
