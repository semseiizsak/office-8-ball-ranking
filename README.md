# Office 8-Ball Rankings

A small office pool leaderboard built with React, Vite, TypeScript, and Firebase
Firestore. Players are ranked with an Elo system using a base rating of 1000 and
a K-factor of 32.

## Features

- Elo leaderboard ordered by rating, with dormant players held separately
- The crown: a bounty that grows for each day the top spot goes undefended and
  transfers to whoever takes it down
- Challenges that state what the match is worth before it is played
- Spectator predictions scored on a nerve rating, so people who are not playing
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

## Getting around

Three destinations, not five:

- **Ranks** — the ladder, the crown and its bounty, the titles, and who has gone
  dormant. Enrolling a new contender lives here.
- **Arena** — everything live. Open challenges answered or not, the calls on
  them, the prediction standings, and both of the things you come here to do:
  log a match and call someone out.
- **History** — every logged match with its corrections, the hall of fame and
  the season controls.

Logging is a task rather than a place, so it opens as a sheet over the arena —
next to the challenges whose results it settles — and closes again. A roster tab
was the ladder a second time with an enrol button on it.

## Calling matches

Anyone not playing can call the winner of an open challenge. A call moves a
**nerve rating**, which sits on the same 1000 baseline as the playing ladder and
uses the same formula:

    delta = K * (result - expected)

where `expected` is the called player's win probability from the two ratings
advertised when the challenge was issued. Backing a 900 against an 1100 and
being right is worth +24; backing the 1100 and being right is worth +8. Missing
on the favourite costs 24, missing on the underdog costs 8.

That makes it a proper scoring rule: calling every match at the odds the model
already gives is worth nothing on average, and calling nothing is worth nothing
either. Ranking on accuracy rewarded the opposite — the best strategy was to
call only the matches nobody could get wrong and skip every close one. The only
way to climb now is to know something the ratings do not.

Each caller may stake one **lock** per day, which settles for double either way.

Nerve is not stored on the player. It is rebuilt from the challenges, which
already record the ratings advertised when each one was issued, who won, and
every call cast on it. That means the standings count calls made before the
rating existed, and a corrected result re-settles the calls that rode on it —
the same way the crown and the titles are derived from match history rather
than accumulated.

Predictions never touch anyone's playing Elo. A spectator cannot move a
player's rank, and the two ladders stay separate so that whoever is mid-table at
pool can still top the calling table.

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
- `predictions` — a map keyed by predictor, so one person holds one call; each
  carries `isLock` for a call staked as that day's double
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

### Environment variables are per-environment and baked in at build time

Vite inlines `VITE_*` values into the bundle when it builds, so they cannot be
supplied or corrected at runtime. On Vercel these are scoped separately to
Production, Preview and Development: setting them for Production alone leaves
every pull request preview built with `undefined`, which is a different
deployment even though it is the same project.

If any are missing the app renders a notice listing exactly which ones, rather
than failing inside the Firebase SDK. After adding them you have to **redeploy**;
reloading the page is not enough, because the old bundle already has the missing
values compiled in.

Preview deployments also inherit Vercel's Deployment Protection by default, so
their URLs show a Vercel login page to anyone not signed in to the account that
owns the project. Turn it off under Project Settings → Deployment Protection, or
share a protection bypass link, if colleagues need to open a preview.

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

