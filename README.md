# Office 8-Ball Rankings

A small office pool leaderboard built with React, Vite, TypeScript, and Firebase
Firestore. Players are ranked with an Elo system using a base rating of 1000 and
a K-factor of 32.

## Features

- Elo leaderboard ordered by rating, with dormant players held separately
- The crown: a bounty that grows for each day the top spot goes undefended and
  transfers to whoever takes it down
- Challenges that state what the match is worth before it is played
- Spectator predictions with their own standings, so people who are not playing
  still have something to win
- Titles awarded on orthogonal measures, so the ladder is not the only thing to
  be best at
- Head-to-head rivalry ledgers with a race to ten
- Seasons with a soft rating reset and an archived hall of fame
- Match logging with projected Elo changes
- Logged event history with transactional edit and delete controls
- Atomic Firestore transactions for match results
- Targeted push notifications
- Production deployment through Vercel

## Only win and loss are ever recorded

Nothing about *how* a match was played is logged: no balls remaining, no
break-and-run, no score. The only thing that scales a rating exchange is the
gap between the two players. Beating someone rated 200 above you is worth
roughly 26 points; beating someone 200 below you is worth roughly 6.

Everything else the app shows — the crown and its bounty, every title, every
rivalry — is derived from wins, losses and timestamps by replaying the match
history. Nothing extra is stored, and a corrected result re-derives all of it.

The crown bounty is the single exception to plain Elo, and it is zero-sum:
rating is transferred off the holder rather than created, capped at 60, and
worth nothing on the day it is won so it cannot be farmed.

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

The app uses these collections:

### `players`

Each document stores the player identity and rating state:

- `name`, `department`, `title`, `avatarUrl`, `ballPreference`
- `elo`, `peakElo`, `wins`, `losses`
- `currentStreak`, `bestWinStreak`, `breakAndRuns`, `recentForm`
- `lastPlayedAt` — drives dormancy
- `predictionsCorrect`, `predictionsTotal` — spectator prediction record
- `createdAt`

### `matches`

Each document stores an immutable match snapshot:

- `playerAId`, `playerBId`, `winnerId`, `loserId`
- `playerAName`, `playerBName`
- `playerAEloBefore`, `playerAEloAfter`, `playerBEloBefore`, `playerBEloAfter`
- `eloDelta`, `eloExchanged`, `isUpset`, `modifiers`, `timestamp`
- `bountyCollected` — rating taken off the crown, 0 for an ordinary match
- `challengeId` — set when the match settled a challenge

### `challenges`

A challenge and the spectator calls on it:

- `challengerId`, `opponentId`, and their names
- `status` — `pending`, `accepted`, `declined`, `expired`, `played`, `cancelled`
- `createdAt`, `expiresAt`, `respondedAt`
- `stakes` — what was advertised when the challenge was issued
- `predictions` — a map keyed by predictor, so one person holds one call
- `matchId`, `resolvedWinnerId` once settled

A pending challenge past `expiresAt` reads as expired without anything having to
sweep the collection, which keeps this working on the free tier.

### `seasons`

- `number`, `name`, `startedAt`, `endedAt`
- `startingElo` — the rating each player carried in, so replaying a season
  starts from the soft reset rather than 1000
- `standings`, `titles` — archived when the season closes

Before any season is closed there is no document: the app treats all history as
season one, so no client has to race to write a bootstrap record.

### `league/state`

One document holding `crownHolderId` and `crownSince`. Logging a match reads the
roster to see who tops the ladder; editing or deleting one recomputes this from
the full replay, so it cannot drift.

`logMatch` reads both players and writes both updated player documents plus the
match document in one Firestore transaction. This prevents concurrent match
submissions from overwriting rating changes.

Editing or deleting an event replays the season's match history in chronological
order inside a Firestore transaction. Player Elo, streaks, wins, losses, crown
reigns and later match snapshots are recalculated, so corrections do not leave
derived statistics stale. Live logging and this rebuild share one implementation,
so a corrected result lands exactly where it would have landed if it had been
logged correctly the first time. Matches in a closed season are read-only.

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
npm run check    # Run the league engine checks
npm run build    # Create the production bundle
npm run preview  # Preview the production bundle locally
```

`npm run check` exercises the rating maths, the crown bounty, dormancy, titles,
rivalries, pre-match stakes and season resets without needing a Firebase project.

To work on the interface without Firebase, open `/harness.html` under
`npm run dev`. It mounts the views against fixture data and is excluded from the
production build.

## Deploying

The project is configured for Vercel's Vite detection. Set all `VITE_FIREBASE_*`
variables in the Vercel project, then deploy:

```bash
vercel --prod
```

Pushes to the connected `main` branch can also trigger Vercel deployments.

## Notifications on Spark

The app supports a Spark-plan notification mode using Firestore real-time
listeners, while the app is open in a browser tab or an installed PWA.

Notifications are addressed rather than broadcast. A logged match reaches the two
players and anyone who staked a prediction on it; the whole office is only
notified when the crown changes hands. A challenge notifies the person being
called out, and tells them what the match is worth to them.

One-time Firebase setup:

1. In Firebase Console, open **Project settings > Cloud Messaging**.
2. Under **Web configuration**, create or copy the Web Push certificate key.
	the free usage quotas.
3. Grant browser notification permission when prompted.

The VAPID key and Cloud Functions are only needed for true background push while
the app is closed. That requires a trusted sender and Firebase Blaze billing;
Firestore cannot securely send browser push messages by itself on Spark.

On iPhone, install the site to the Home Screen first, then open the installed
app and grant notification permission.

