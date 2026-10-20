# Liga test app

Expo Go test build of the Liga league app. Data stays on the phone (AsyncStorage) until the Supabase backend is connected.

- `npx expo start`, then scan the QR code with Expo Go.
- Sign in with any email and any 6 digit code.
- Join the demo league with code `DEMO42`, or start your own.

Design system: `~/Documents/liga-ds`. Screen plan and priorities: Obsidian `Liga App/Teszt app prioritás.md`.
Backend draft for later: `supabase/migrations/0001_init.sql` (same rules as `src/lib/engine.ts`).
