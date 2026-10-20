# QA brief: Liga test app in the browser

Read ~/Documents/liga-app/docs-agent-brief.md first (rules, structure, brand rules). The app runs on Expo web from the Metro server on port 8082 (already running; never stop it).

## Your browser setup
- Use the claude-in-chrome tools (load them with one ToolSearch call: tabs_context_mcp, tabs_create_mcp, navigate, computer, javascript_tool, read_console_messages, find, read_page, tabs_close_mcp). Open your OWN new tab; never touch other tabs. Close it at the end.
- Use ONLY your assigned origin (given in your task). Each agent has its own origin so the local data (localStorage) and the sign in session are separate. Never open another agent's origin.
- Phone size: navigate your tab to `<origin>/qa-frame.html?path=/` is NOT available, so do this instead: navigate to `<origin>/`, then run JS that replaces the page with a fixed 393 x 852 iframe pointing at `<origin><path>` (same origin, so you can script inside it via `iframe.contentDocument` / `contentWindow`). Change `iframe.src` to move between routes, or click inside it. Screenshots: use small scale (0.4 to 0.6) and the zoom action on the iframe region; keep them few.
- Sign in: any email (use your own, e.g. qa1@test.dev) and any 6 digit code. Join the demo league with code DEMO42. To reset: settings, Reset test data (or clear your origin's localStorage with JS).
- Theme: settings, Appearance (System, Dark, Light). Check both Dark and Light.
- Web limitations (do NOT treat as bugs, do not "fix" them): React Native Alert.alert does nothing on web (confirm dialogs), Share and Clipboard may be no-ops, haptics, notifications, keep-awake and view-shot do nothing. Never trigger browser alert or confirm dialogs. To test a flow guarded by Alert.alert, call the underlying lib function through a quick tsx test instead, or skip and note it.

## What to check on EVERY screen in your area
1. It opens without a red error, crash screen or console error (read_console_messages with onlyErrors). Fix real errors.
2. Layout at 393 x 852: nothing cut off, overlapping, overflowing sideways, text not truncated badly, consistent paddings (16 side gutter), tab bar not covering content (bottom padding), headers aligned, empty and loading states look right.
3. Brand rules (see docs-agent-brief.md): solid colours only, correct text colour on fills, no uppercase outside Sora display, no forbidden separators in visible text (`-`, `–`, `—`, `·`, `|`, `/` between words), no italics, 44 px touch targets, English copy that never blames.
4. Every button and link in the screen does something sensible (navigates, changes state) or is clearly disabled. Back navigation works.
5. Data looks believable and consistent (numbers with thin space thousands, dates, names).

## Fixing
- Fix bugs you find directly in the code. Keep fixes small and local. If a fix needs a shared file (src/ui/index.tsx, src/lib/api.ts, engine.ts, layouts), make a surgical Edit and mention it; another QA agent may edit nearby.
- After fixing, reload the iframe and re-check. Metro hot reloads.
- At the end run `npx tsc --noEmit` and `npx expo lint` (no errors) and `npx expo export --platform ios --output-dir /private/tmp/claude-501/-Users-simonsburger-Documents/3831fce8-c470-4813-90e0-66afe2eb2fba/scratchpad/qa-export-<you>`.
- Do not commit.

## Report
Reply briefly: screens checked (count), bugs found and fixed (one line each, file), issues left open (with reason), shared-file edits.
