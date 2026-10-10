# CLAUDE.md — DR Failover Automation presentation site

Guide for AI agents (and humans) continuing this project. Read this first, then
`dr-gtm-presentation-spec.md` (original spec + §14 "As built: decisions & changes").
Where this file and the spec's original sections disagree, **this file and spec §14 win**.

## What this is

A static, scroll-driven, animated presentation site (GitHub Pages / GitLab Pages) that replaces a
slide deck for a 300–400 person VP/director audience. Its main job: make **DNS
resolution and GTM-based failover visible**. The presenter drives it live with
keyboard / clicker.

## Hard constraints (non-negotiable)

- **Pure HTML + CSS + vanilla JS (ES2020+). No libraries, frameworks, CDNs, fonts,
  icon packs, analytics, or any network request.** No npm, no bundler, no build step.
- System fonts only (`Segoe UI` stack; `Consolas` for identifiers). Target: Chrome/Edge on Windows 11.
- Inline, hand-drawn SVG only. **No vendor logos** (F5, Infoblox, Kafka, MongoDB).
- **Placeholders only**: "ABCD Gateway", `app.example.com`, `app.gslb.example.com`,
  `192.0.2.10`, `198.51.100.10`. Never real company names, hosts, IPs or FQDNs.
- **All wording, names and IPs live in `js/config.js` and `js/beats.js`.** Animation code
  never contains presentation text.
- Must work by double-clicking `index.html` (file://) → **classic `<script defer>`, not ES
  modules** (modules fail on file://). Everything hangs off one global: `window.DR`.

## Files

| File | Role |
|---|---|
| `index.html` | All sections. Pinned sections are empty shells (`<section data-pin>`) filled by `story.js`. Script load order matters: config → beats → util → sections → diagram → story. |
| `js/config.js` | `DR.CONFIG`: names/IPs, diagram labels (`nodes`, `labels`), pinned-section settings (`pins`), dot-group names (`parts`), theme, timing, all page text (`text.*`). |
| `js/beats.js` | `DR.BEATS` ("How it works"), `DR.JOURNEY` ("Request journey"), `DR.OVERVIEW` (static map state), `DR.PIN_BEATS` (section id → beat array). |
| `js/util.js` | `DR.fmt` ({token} replacement from CONFIG), `DR.fmtHtml` (escape + \`code\`), `DR.fmtText`, `DR.bindText` (fills `[data-text="config.path"]`), `DR.get`, `DR.clamp`. |
| `js/sections.js` | Non-pinned sections: theme, text binding, fade-in on scroll (`.reveal-scope` / `.reveal`), problem-section DNS-propagation animation. |
| `js/diagram.js` | Builds the architecture SVG (layout coordinates live here), applies state, moves the packet. API: `DR.diagram.build(slot, 'overview'|'pinned')`, `DR.diagram.apply(win, state, opts)`, `DR.diagram.applyState(svg, state, focus)`. |
| `js/story.js` | Pinned sections: template, scroll→beat, keyboard/clicker, dots, deep links, scenario switch, TECH toggle. Debug handle: `DR.story`. |
| `css/styles.css` | Tokens on `:root` (+ `[data-theme="light"]`), slides, pinned window, diagram, all state visuals, reduced motion. |
| `.gitlab-ci.yml` | `pages` job copies `index.html css js` → `public/`. Image name may need changing for the runners. |
| `.github/workflows/pages.yml` | GitHub Pages deploy on push to `main` (live preview: https://nik35.github.io/dns-details/). Repo: https://github.com/Nik35/dns-details |
| `README.md` | Human guide: run, presenter keys, editing, build, deploy. |
| `.gitignore` | Ignores `*.local.md` (local-only notes). |
| `removed-sections.local.md` | **Local only, git-ignored — may not exist in your clone.** Archive of the removed sections (title, action cards, recap, Questions) with their HTML / text / JS / CSS for restoring. The same code is in git history before the "Keep only the flow sections" commit. |

## Page structure (top → bottom)

Only the **flow sections** are kept (owner decision):
1. `#problem` (DNS change + TTL / propagation animation, plays on view) · 2. `#big-idea`
(10–20 min vs seconds + "time to recover" race bars) · 3. `#overview` (static map, same SVG)
· 4. `#how-it-works` (**pinned**) · 5. `#request-journey` (**pinned**, last section).
The title slide, "other actions" cards, recap and Questions slide were **removed** — do not
re-add them unless the owner asks (see `removed-sections.local.md` or git history).

### Pinned section 1 — "How it works" (switch: New application | Existing name)
- **New application: 14 steps.** A: request → log (`creating`) → queue → consume (`action → create`)
  → DNS check (`Create CNAME?` diamond) → build GTM (VS → pool → members → wide IP).
  B: 7 = branch (New: **Yes** → create CNAME → wide IP), 8 = report (`created`).
  C: 9 typed name → 10 laptop→resolver→DNS → 11 CNAME answer + **redirect** to GTM →
  12 GTM picks active ("chosen" ring) → 13 A record back, client **Connected** to primary.
  D: 14 callout "flip which server is active — DNS never changes" + ghost pool toggle.
- **Existing name: 18 steps.** Same, but 7 = **No** (record locked, "Left as-is", dashed
  "later: migrate"), then 4 extra **migrate** steps (`only: ['existing']`, part `M`):
  migrate request (`migrating`) → queue/automation (`action → migrate`) → CNAME updated
  ("Migrated") → report (`migrated`). Then the DNS lookup steps.

### Pinned section 2 — "Request journey" (switch: Today (DNS only) | With GTM)
9 steps, both scenarios: type → ask DNS → **answer** (Today: `A 192.0.2.10` directly; GTM:
CNAME + redirect) → decide (GTM: picks active) → connect → **disaster** (primary down,
"Can't connect") → **failover** (Today: record changed + "waiting 10–20 min"; GTM: pool
toggle flips, secondary active, CNAME "Unchanged", "seconds") → **retry** (Today: cached old
answer, still failing; GTM: full path → secondary, Connected) → recap callout.
Slower pace: `CONFIG.pins['request-journey'].hopMs = 1800`, `stateMs = 1200`.

## Core architecture (read before changing anything)

### State is a pure function of (beat, scenario)
- A beat lists only what **changes**. `computeState(beats, i, scenario)` merges, for
  k < i: `set` then `after`; then beat i's `set` → **`pre`**; plus beat i's `after` → **`full`**.
- `apply()` renders `full` directly when jumping/going back. When moving **forward exactly one
  beat**, it renders `pre`, plays the packet, then renders `full` (so things appear "when the
  packet arrives"). Never make a visual depend on "having played" an earlier beat.
- Every stateful SVG element has `data-el="key"`; `applyState` sets `data-state` (empty
  string = default). **CSS does all visuals** keyed on `[data-state=…]`. JS only moves the packet.

### Beat object (`beats.js`)
```js
{
  id: 'redirect',            // stable slug (also data-beat-id on the window)
  part: 'C',                 // dot-group label key → CONFIG.parts
  only: ['existing'],        // optional: beat exists only in these scenarios
  caption: '…',              // plain layer (always visible); {tokens} + `code` allowed
  techLine: '…',             // TECH layer (T key)
  note: '…',                 // optional small note, top-right of stage
  callout: '…',              // optional big callout, top-left of stage
  hotSwitch: true,           // optional: glow the scenario switch on this beat
  focus: ['client', …],      // null = none dimmed; else non-listed nodes/paths → 22% opacity
  set:   { 'el-key': 'state' },   // applied when the beat starts
  after: { 'el-key': 'state' },   // applied when the packet finishes (or immediately if jumping)
  packet: {
    hops: [{ path: 'res-gtm', label: '{wideIp} ?', kind: 'redirect'|'answer', reverse?, draw?: false }],
    stay: true,              // keep packet at end of last hop (else it fades)
    hold: { path, at: 0|1, label },   // static packet position when no hops
    hopMs: 1200,             // optional per-beat speed override
  },
  scenarios: { existing: { …any field above; set/after are merged } },
}
```
`DR.JOURNEY` uses a helper `j(shared, todayOverrides, gtmOverrides)` which also injects the
per-scenario `focus`.

### Diagram element keys (`data-el`) and states
| Key | States |
|---|---|
| `node:<id>` (user, gateway, db, kafka, auto, infoblox, gtm, primary, secondary, client, resolver) | `lit`; servers: `active`, `standby`, `down`; client: `ok`, `error` |
| `path:<id>` | `drawn`, `failing` (client-primary) |
| `card:request`, `card:migrate` | `shown` |
| `badge:db` | `creating`, `created`, `migrating`, `migrated` |
| `kafka:msg`, `legend`, `migrate`, `bubble`, `redirect`, `pick:m1`, `pick:m2` | `shown` |
| `flash:parse` | `shown` (create), `migrate` |
| `diamond` | `asking`, `create`, `skip` |
| `record` (Infoblox) | `old`, `old-locked`, `new`, `migrated`, `new-locked`, `a-primary`, `a-secondary` |
| `gtm:vs`, `gtm:pool`, `gtm:wideip` | `built`; wideip also `linked` |
| `gtm:m1`, `gtm:m2` | `active`, `standby` |
| `toggle` (pool switch) | `on`, `flipped`, `ghost` |
| `wait` | `minutes`, `seconds` |

Paths (`PATHS` in diagram.js): `user-gw gw-db gw-kafka kafka-auto auto-ib auto-gtm auto-db
ib-gtm m1-srv m2-srv client-res res-ib ib-res res-gtm gtm-res res-client client-primary
client-secondary gtm-in1 gtm-in2`. SVG viewBox is 1700×720; layout in `N` (node boxes).

**To add a visual:** add markup with `data-el` in `diagram.js` → hide by default and show per
`[data-state]` in CSS → set it from beats. **To add a step:** add a beat object; nothing else.

### Navigation (`story.js`)
- Each `<section data-pin>` → height `beats × CONFIG.beatHeightVh vh + 100vh`; inner
  `.pin-window` is `position: sticky`. Beat = `floor(progress × N)` from a rAF-throttled
  scroll listener (chosen over IntersectionObserver: stateless, robust to fast flicks/jumps).
- **Stops** = each normal section's top + each beat's mid-segment. → / PageDown / Space =
  next stop, ← / PageUp / Shift+Space = previous (clicker-friendly). Keys/dots only scroll;
  the scroll handler renders. `pendingStop` makes rapid presses accumulate.
- `T` toggles TECH (global). `S` / switch buttons change scenario of the current pinned
  section **and jump to step 1** (instantly). Home/End inside a pin = first/last step.
- Deep links: `#how-it-works/9`, `#request-journey/3`, `#problem`; hash kept in sync with
  `history.replaceState`; re-applied on `load` (Chrome resets scroll during load).
- Resize (e.g. F11) returns to the last stop (heights are vh-based).
- Per-section pace: `CONFIG.pins[id].hopMs` → `--hop`, `stateMs` → `--dur` on that window.

## Rules for agents (read before editing)

1. **The site already works.** Most requests are content or small visual changes →
   edit `js/config.js` / `js/beats.js` (and maybe a CSS rule). Do **not** rewrite
   `story.js` (scroll/keys engine) or `diagram.js` (SVG + packet engine) unless the owner
   explicitly asks for an engine change.
2. Work in **small steps**; after each step run the checks in *Definition of done* below.
3. Never add libraries, CDNs, npm, a bundler, ES modules, external fonts or real names/IPs.
4. Ask the owner when a request is ambiguous; don't guess.
5. Don't push to `main` without the owner's OK (it publishes the live site).

### Known-good version & recovery
- Tag **`v1-flows`** = verified working site (flow sections only, both pinned sections,
  migrate flow, GitHub Pages live). If something breaks and can't be fixed quickly:
  ```bash
  git diff v1-flows --stat                    # what changed since the good version
  git checkout v1-flows -- index.html css js  # restore just the site files
  ```
  Or restore a single file: `git checkout v1-flows -- js/story.js`.
- **Rebuild from scratch is never needed**: the full source is in this repo. `dr-gtm-presentation-spec.md`
  (§1–13 original + §14 as built) plus this file describe everything if a redesign is ever requested.

### Starter prompt for a new agent
> Read CLAUDE.md fully, then dr-gtm-presentation-spec.md §14. Task: <…>. Change only what
> the task needs, run the Definition-of-done checks, summarise what you changed and how to
> preview it, and don't push until I confirm.

## Build, preview, deploy (for agents)

**There is no build step.** The site is plain files served as-is — never add npm, a bundler,
a transpiler or a minifier. "Building" just means copying three paths into a folder:

```bash
# 1. Syntax-check every script (Node is only used as a checker, not a dependency)
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done

# 2. Guard rail: no external URLs / CDNs / imports in site files (expect no output)
grep -nE "https?://|@import|cdn\." index.html css/*.css js/*.js

# 3. Build the deployable folder exactly like CI does
rm -rf _site && mkdir -p _site && cp -r index.html css js _site/

# 4. Preview it
python -m http.server 8765 --directory _site      # open http://127.0.0.1:8765
```
`_site/` is a throwaway artefact — don't commit it. Day to day you can also serve the repo
root (`--directory .`) or double-click `index.html`. After edits reload with **Ctrl+F5**
(the dev server's files get cached).

**Deploy**
- **GitHub Pages** (current host): a push to `main` on https://github.com/Nik35/dns-details runs
  `.github/workflows/pages.yml` (same copy step → `actions/deploy-pages`).
  Live site: https://nik35.github.io/dns-details/. The repo setting must be
  *Settings → Pages → Source: **GitHub Actions***. If it says "Deploy from a branch", GitHub's
  built-in Jekyll job runs instead and fails looking for `/docs`.
- **GitLab Pages**: `.gitlab-ci.yml` does the same into `public/` (runner image may need changing).
- Only `index.html`, `css/`, `js/` are published; the `*.md` docs are not.

**Git**
- Branch `main`, remote `origin` = GitHub. Commit messages end with the `Co-Authored-By` trailer.
- **Pushing to `main` publishes the live site — get the owner's OK first.** For larger work use a
  feature branch (e.g. `phase-7-polish`) and a PR.
- "LF will be replaced by CRLF" warnings on Windows are harmless.

**Definition of done for any change**
1. `node --check` passes and there are no external URLs.
2. Walk every stop with PageDown / PageUp at 1366×768 and 1920×1080 — both scenarios of both
   pinned sections, `T` on and off. 3. Console clean.
4. All new wording lives in `config.js` / `beats.js`.
5. Update this file (and spec §14) if architecture, sections or status changed.

## Gotchas learned the hard way

- **Line drawing:** links use `pathLength="100"` with `stroke-dasharray: 100 200` and
  `stroke-dashoffset: 100 → 0`. Computing lengths in px left visible stubs at corners — don't revert.
- **Pinned SVG sizing:** `.diagram-slot--pinned .dr-diagram { position:absolute; inset:0 }` —
  otherwise the SVG overflows under the caption panel on short screens.
- **Browser cache:** `python -m http.server` responses get cached; after edits use **Ctrl+F5**.
- **Claude Desktop browser pane:** when the pane is hidden it stops rendering — rAF, scroll
  events, smooth scroll and IntersectionObserver all stall, and `innerHeight` can be 0. For
  scripted tests: resize the pane (e.g. 1366×768), patch `scrollTo` to `behavior:'instant'`,
  dispatch `scroll` events manually, or take a screenshot to force a frame.
- Bash heredocs containing these JS/CSS snippets sometimes fail to parse on this Windows Git
  Bash; write helper scripts to a file instead.
- The GTM pool has **no health monitor by design**: failover is a deliberate `patch`
  (enable/disable). Do not add "auto failover" visuals.

## Preview / test

See **Build, preview, deploy** above. Also check DevTools → Network: only local files.

## Status

| Phase (spec §11) | Status |
|---|---|
| 1 Plan | done |
| 2 Skeleton (pin, keys, dots, deep links) | done |
| 3 Diagram (shared SVG) | done |
| 4 Parts A + B (+ scenario switch) | done (+ migrate flow for Existing name) |
| 5 Part C + beat 14 | done |
| — Request journey section (added by request) | done |
| 6 Other sections (problem anim, big idea, cards, closing) | done — then title / cards / recap / Questions **removed** by the owner |
| 7 Polish & checks | **TODO** |

### Phase 7 TODO
- Full **reduced-motion** pass (Windows "Animation effects" off): fades only, no movement,
  packet hidden/jumped, race bars + propagation show end state.
- Layout check of **every section** at 1920×1080, 1366×768 and ~1280×600 (125–150 % scaling);
  the problem slide is the tallest.
- Backward-scroll check through all steps of both pins, both scenarios.
- **Light theme** (`CONFIG.theme = 'light'`) has never been visually checked.
- Verify spec §13 acceptance criteria one by one; zero external requests.
- Optional polish ideas (ask the owner first): presenter key-help overlay (`?`), print/PDF
  fallback, speaker notes.

## Working agreement with the owner

- Build in phases; after each, stop, summarise, say how to preview.
- **Ask when something is ambiguous** — don't guess. Keep answers short; the owner reviews visually.
- Keep all captions/names/IPs in `config.js` / `beats.js`.
