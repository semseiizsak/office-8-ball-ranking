# Brief for agents building the Liga test app (Sprint 2)

Repo: ~/Documents/liga-app (Expo SDK 57, Expo Router, TypeScript, React Compiler on, runs in Expo Go). Metro is already running on port 8082; do not start or stop it.
Read first: README.md, src/lib/api.ts, src/lib/engine.ts, src/lib/types.ts, src/providers/*.tsx, src/ui/index.tsx, src/ui/appbar.tsx, src/ui/match-card.tsx, src/theme/index.ts, and the existing screens in src/app. Match their style exactly (short code, comments only where useful, screen IDs in a top comment like `// M7 Challenges`).

Screen specs (Hungarian, very detailed, follow them): "~/Documents/Simon's Burger Obsidian/Liga App/Képernyőterv/0X ....md" (search the screen IDs given in your task). Priorities: "~/Documents/Simon's Burger Obsidian/Liga App/Teszt app prioritás.md". Visual reference: the design system at ~/Documents/liga-ds (index.html sections and parts/*.html), tokens already mirrored in src/theme.

Data: there is NO backend. Everything lives in the local store (AsyncStorage) via src/lib/api.ts: `db()` returns the mutable store object, `save()` persists, `wait()` fakes latency. Put your feature's data logic in your own module `src/lib/<feature>.ts` (add optional collections to the `DB` type in engine.ts with a one line edit). To send an inbox notice use `notify(d, {...})` from engine.ts inside your write, before save(). The demo league (code DEMO42, members m_mira, m_dave, m_sam, m_kim, m_joe, m_ann with user_id null) is played by "bots": anything that needs another person's response (accepting a challenge etc.) should be simulated for bot members with a short realistic delay (resolved lazily when data is read, e.g. compare timestamps), and must work for real members too.

Rules (brand, never break):
- Use theme tokens from useTheme() only; solid colours, never tint or fade brand or meaning colours (no opacity on coloured fills). Text on win green and brand is white, on crown and warning black.
- Sora display (type.title, type.section...) is uppercase; nothing else uppercase. No italics. No text shadow. No small label above a heading.
- In visible text never use `-`, `–`, `—`, `·`, `|` or `/` as separators; use a comma or line break.
- Touch targets at least 44 px; every icon button has an accessibilityLabel. Inputs 16 px.
- Motion ease in out, no bounce. English copy, short, friendly, never blaming.
- Expo Go only: do not add packages with native code beyond what is installed (react-native-svg, react-native-qrcode-svg, expo-notifications, expo-clipboard, expo-haptics, lucide-react-native are installed). Use `npx expo install` if you truly need a JS-only package and say so.
- No inner components defined during render (React Compiler lint): use render helper functions called as `{row(item)}` or top-level components.

Shared files: other agents work in parallel. Only touch files listed in your task plus tiny, surgical Edit-tool insertions in shared files when your task says so (never rewrite a shared file). Expo Router registers new routes automatically; only add a `<Stack.Screen>` line in src/app/(app)/_layout.tsx if you need modal or formSheet presentation.

Done means: `npx tsc --noEmit` and `npx expo lint` show no errors in YOUR files (ignore errors clearly caused by another agent's in-progress files, mention them), and `npx expo export --platform ios --output-dir /private/tmp/claude-501/-Users-simonsburger-Documents/3831fce8-c470-4813-90e0-66afe2eb2fba/scratchpad/export-<yourslug>` succeeds. Pure logic gets a quick tsx test (`npx tsx --tsconfig tsconfig.json <file>` in the scratchpad dir). Do not commit. Reply briefly: files created or changed, screen IDs done, shared-file edits, anything left.

## Sprint 3 additions
- Modules: `src/lib/modules.ts` has `isOn(league, id)`. Every module you build must check it (hide tabs, blocks and notices when off). The modules settings UI is built by the onboarding/modules agent.
- Match events: add your synchronous hook as ONE line in `afterMatchRecorded` in `src/lib/hooks.ts` (import at the top). Do not edit recordMatch for that.
- Navigation: the tab bar lives in src/app/(app)/(tabs)/_layout.tsx (Ranks, Log button, Arena, History). Only the cup agent adds a Cup tab there; anything else gets an entry point as a row, card or app bar button.
- Specs for Sprint 3 are in notes 02, 03, 04, 05, 06, 07 under the IDs the priority note lists for sprint 3 (section "Sprint 3 (P2): modulok" and the full table with column Sprint = 3.x).

## Sprint 4 additions
- New module ids in src/lib/modules.ts: 'cards', 'shop', 'pass', 'predictions'. The demo league has them on (cards and shop via the office template, pass and predictions via seed overrides).
- Ethics and store rules (note 04 "Etika" section, PEGI June 2026, Apple 3.1.1, 5.3.3): coins are earned only, never bought, refunded or traded for money; Pro gives cosmetics only, never coins or packs; packs bought with coins always show odds before buying; no timers, "sold out" or fake scarcity in the shop; no jackpot, no daily spin; predictions are for bragging rights or tiny coin stakes and hidden for players under 16.
- Purchases: there is no real IAP in Expo Go. Build a mock store in src/lib/billing.ts (owned by the billing agent) that behaves like RevenueCat (offerings, purchase, restore, entitlement, trial); others read `hasPro(league)` from it.
