# Brief for agents extending the Liga design system

Folder: `~/Documents/liga-ds/`. Live at http://localhost:4620 (a python http.server is already serving the folder).
Read first: `tokens.css`, `components.css`, `index.html`, `page.css`, `page.js`. Match their style exactly.

## What Liga is
A standalone app (iOS and Android, Expo later) where any team (office, friends, club) runs its own private league:
log matches (1v1 and 2v2, universal win or loss, the sport is only a label and icon), Elo rating leaderboard,
challenges, live matches, weekly cup, seasons, coins, collectible cards, badges, chat. Dark theme first, full light theme.

## Your output (only these files, never edit shared files)
- `parts/<slug>.css`: your component CSS. Prefix every new class with your prefix (given in your task) to avoid collisions.
- `parts/<slug>.html`: an HTML fragment with one or more `<section class="sec" id="<prefix>-..." data-title="...">` blocks,
  same structure as existing sections: `<h2 class="t-title">`, `<p class="lead">`, then `.demo` blocks, optional `.spec` table.
  No `<html>`, `<head>`, `<script>` tags in the fragment.
- `parts/<slug>.js` (optional): behaviour, wrapped in an IIFE, no globals, works when the fragment is already in the DOM.
  Lucide icons: use `<i data-lucide="name"></i>`; if you inject icons dynamically call `lucide.createIcons()` after.
  page.js already handles: `[data-flip]` (aria-checked), `[data-single]` groups (aria-pressed), `[data-toggle-group] .chip`,
  `[data-tabs]`/`[data-tabbar]` (aria-selected), `[data-radio]`, `.react`, `[data-open]` overlays. Reuse those.
- To preview while working, you may create `parts/<slug>-preview.html` that links tokens.css, components.css, page.css,
  your css, the lucide UMD script (`https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js`), page.js is not needed.
  Check it in Chrome (claude-in-chrome tools, open a new tab, close it when done) in both themes (`<html data-theme="dark|light">`)
  and at 390 px width (use an iframe 390 px wide if the window cannot resize). No horizontal overflow. Avoid screenshots unless
  needed, prefer JS DOM checks; at most a few small-scale screenshots.

## Hard rules (the user's brand rules, never break)
- Use only semantic tokens (`--bg --surface --surface-2 --surface-3 --overlay --line --line-strong --text --text-2 --text-3
  --primary --on-primary --brand --on-brand --win --on-win --loss --live --crown --on-crown --error --warning --info`, player
  colours `--pc-*` for fills and `--pct-*` for text, scales `--s-* --r-* --t-* --d-* --ease`). Must work in both themes.
- Colours always solid: never tint, fade or make transparent the brand or meaning colours (no rgba of them, no opacity on a
  coloured fill to make it lighter). Neutral black or white alpha is fine for scrims and shadows.
- Text on win green is always white, on crown/warning always black, on brand always white. Never pale pill with coloured border;
  active state = solid fill with contrasting text.
- No italics anywhere. No text-shadow or drop-shadow on text.
- No small label or eyebrow tag above a heading.
- No uppercase with wide letter spacing. Uppercase only on Sora display classes (`t-hero t-display t-title t-section`).
- In visible text never use `-`, `–`, `—`, `·`, `|` or `/` as separators between pieces of text; use gap, a line break or a comma.
  (The minus sign in a number like −11 is fine, "W/O" walkover is fine.)
- Motion: ease in out `var(--ease)` (cubic-bezier(.65,0,.35,1)), short, no overshoot, no bounce, no spring.
  Celebrations may last up to 1.4 s. Always honour `prefers-reduced-motion`.
- Touch targets at least 44 px. Every icon button has aria-label. Inputs 16 px font.
- All copy in English, short, friendly, never blaming the user.
- Fake but realistic data: players Dave, Mira, Sam, Ann, Joe, Kim, You; league "Office foosball", team "Acme Studio".
- No real company names or logos.

## Quality bar
Production quality, dense like a feed app (Twitch, Strava, Linear level polish). Each component shows its states
(default, pressed or selected, disabled, empty, error where relevant) and a one line usage note.
When done, reply with: files written, list of sections and components, anything you could not do.

## Screen mockups (round 3)

Full screen mockups that show how the real app will look. Use the shared device frames from `page.css` (do not redefine them):

```html
<div class="device-cap">
  <div class="device" data-theme="dark">          <!-- data-theme optional: force a theme for this phone -->
    <div class="device-screen">                    <!-- logical 393 x 852 px (iPhone 16 Pro), scaled to fit -->
      <div class="statusbar"><span>9:41</span><span class="sb-r"><i data-lucide="signal"></i><i data-lucide="wifi"></i><i data-lucide="battery-full"></i></span></div>
      ... your screen, designed at exactly 393 px wide, 852 px tall; keep the top 54 px for the status bar (Dynamic Island sits top centre) ...
      <div class="homebar"></div>
    </div>
  </div>
  <span>Caption, what this screen is</span>
</div>
```
- Phones go in `.device-row` (wrapping grid) or `.flow` (horizontal steps; put `<i data-lucide="arrow-right" class="flow-arrow"></i>` between steps).
- Tablet: `<div class="tablet"><div class="tablet-screen">` logical 800 x 1280 portrait; add class `land` on `.tablet` for 1280 x 800 landscape.
- Design every screen at its logical size. Content must fit the screen like a real screenshot: no inner scrollbars; a list may be cut by the bottom edge or tab bar naturally. Never stretch or squash anything. The frame keeps 9:16 by itself.
- Reuse existing components (`.list .row .av .match .tabbar .appbar .league-sw .card .pill .btn .seg .tabs .stat .tile .nrow .toast .alert .empty`, and the part classes `dv- so- fx- sy- mo-` where they fit; read `parts/*.css` and `parts/*.html`). Add only screen-layout CSS with your own prefix.
- Floating tab bar sits 12 px above the home bar, 12 px side margins. App bar under the status bar.
- Realistic, rich, believable content (ratings like 1 248, times, dates in Oct 2026, emoji badges, coin amounts), consistent across screens: You are #3 (green, 6), Mira #1 crown (orange, 5), Dave #2 (blue, 7), Sam #4 (yellow, 1), Kim #5 (purple, 4), Joe #6 (red, 3), Ann (maroon, 2). League "Office foosball", team "Acme Studio", Season 4, week 43.
- Each section: `<h2 class="t-title">`, `<p class="lead">`, then the devices directly inside the section (not inside `.demo`), with short captions.
- Fragment rules as before (no group heading; I add it). Verify in Chrome: every `.device-screen` has scrollHeight <= 640 + 1 and no element pokes outside the screen box horizontally; both themes; page at 390 px has no horizontal overflow (flows scroll inside `.flow`).

## Round 5 updates (current state, overrides older numbers above)
- Phones: `.device-screen` is 393 x 852 logical (iPhone 16 Pro frame with Dynamic Island, drawn by page.css). Status bar 54 px, home indicator 34 px. Floating tab bar 12 px above the home indicator.
- Screens must be filled like a real busy product screenshot: run `docs/gaps.js` in Chrome on http://localhost:4620 (after `python3 build.py`), your sections must report no empty band over 12%. scrollHeight <= 852, no `.fit` zoom wrappers.
- Numbers: write thousands with a space (1 248); build.py turns it into a non breaking space. In JS use '\u00a0'.
- After editing your part files run `python3 build.py` (your slug must be in GROUPS; I add it before you start).
- Use your own Chrome tab and close it; never navigate tabs you did not open.
