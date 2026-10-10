# DR Failover Automation — Animated Presentation Site (Build Spec)

> **For Claude Code:** This document is the full specification. Read all of it before writing any code. Build in the phases listed in §11. When something here is ambiguous, ask rather than guess. Do not add any external dependency under any circumstances (see §2).

---

## 1. Purpose and audience

We are presenting a **Disaster Recovery (DR) failover automation** to an audience of **300–400 people, mostly VPs and directors**. Many are not deeply technical. The presenter will drive the page live on a projector/screen share.

The site replaces a slide deck. It is hosted on **GitLab Pages** as a static site.

**The single most important goal:** make **DNS resolution and redirection visible**. People should *watch* what happens when someone types a name like `app.example.com` — how the query travels, how a CNAME redirects it to a GTM wide IP, and how the GTM picks the active server. This is normally invisible; the animation makes it concrete.

**Two audiences, one page (layering):**
- **Plain layer (default):** short, jargon-free captions. A VP should understand every step.
- **Technical layer (toggle):** an extra line per step with the real detail (Kafka, action attribute, wide IP / pool / members, desired vs realized state). Hidden by default; presenter can reveal it.

---

## 2. Hard constraints (non-negotiable)

This runs in a **controlled corporate environment**.

- **Pure HTML + CSS + vanilla JavaScript (ES2020+) only.**
- **No external libraries, frameworks, or CDNs.** No GSAP, no D3, no React, no jQuery, no Tailwind, no animation libraries.
- **No external network requests at all.** No Google Fonts, no remote images, no icon CDNs, no analytics. Everything is local, in the repo.
- **No build step.** No npm, no bundler. Files are served as-is.
- **Fonts:** system font stack only (e.g. `"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif`). Primary target is Windows 11, so Segoe UI will be used.
- **Icons / diagrams:** hand-built **inline SVG** only. Use generic labelled shapes — **no vendor logos** (no F5, Infoblox, Kafka, MongoDB logos).
- **Browser target:** modern Chrome / Edge on Windows 11. No legacy browser support needed.

---

## 3. Naming and confidentiality

- The internal API gateway's real name **must not appear**. Always call it **"ABCD Gateway"** (placeholder).
- Do not include any company name, internal hostnames, real IPs, or real FQDNs.
- Use placeholder values only:
  - Application FQDN: `app.example.com`
  - Wide IP name: `app.gslb.example.com`
  - Primary server: `Primary DC — 192.0.2.10`
  - Secondary server: `Secondary DC — 198.51.100.10`
  (These are reserved documentation IP ranges — safe to show.)
- Keep all placeholder values in **one config object** at the top of the JS so the presenter can change them in one place.

---

## 4. The problem (context for the story)

**Today (DNS-driven failover):** each application has a primary and a secondary server. To fail over, the DNS record in **Infoblox** is changed to point at the secondary. That change takes **10–20 minutes, sometimes longer**, to propagate across DNS. During a real disaster, that wait is risk and downtime — and it is unpredictable.

**Our solution (GTM-driven failover):** put **F5 GTM (Global Traffic Manager)** in charge of which server answers. DNS points at the GTM **once** (via a CNAME to a wide IP). After that, failover is just flipping which pool member is active on the GTM — it takes effect in **seconds**, and the DNS record never has to change again.

**One-line big idea (use on the page):**
> "We put the GTM in charge of failover, so switching servers takes seconds — and DNS never has to change again."

---

## 5. System architecture (components)

Draw each of these as a node in the diagram. Suggested colour coding in brackets (define as CSS custom properties).

| Component | Role |
|---|---|
| **Server team user** [neutral] | Submits a DR request through the ABCD Gateway. |
| **ABCD Gateway** [blue] | Front door. Exposes predefined **CRUD APIs and action APIs**. Owns its own **MongoDB**. On every request it creates a DB record with a status (e.g. `creating`) — the *desired state* — and **produces a message onto a Kafka topic**. |
| **Gateway DB (MongoDB)** [blue, smaller] | Holds request records and their status. |
| **Kafka topic** [purple] | Single topic. Messages carry an **`action` attribute** (create / migrate / patch / delete). |
| **DR Automation (our app)** [teal] | Always listening on the Kafka topic. In this use case it is **Kafka-consumer only** (it also has its own APIs, but the gateway path uses Kafka). It **parses** the message, reads the `action`, and **dispatches to our internal API**. After acting, it **patches the result back** to the gateway DB (*realized state*: success / failed). |
| **Infoblox (DNS)** [orange] | Corporate DNS. Holds (or doesn't yet hold) the CNAME for the application FQDN. |
| **F5 GTM** [red] | Holds the **wide IP**, its **pool**, the **pool members**, and the **virtual servers**. Decides which server answers a DNS query. |
| **Primary server** [green when active] | Active pool member. |
| **Secondary server** [amber when standby] | Standby pool member. |
| **Client / DNS resolver** [neutral] | Used only in the DNS-resolution part (§7, beats 8–13). |

**Key GTM design facts** (for the technical layer):
- Pool has two members: **primary = active**, **secondary = standby**.
- Members use **port 0**, which applies the default connectivity check behaviour — **no additional explicit monitor is configured** on top.
- Failover = toggling which member is enabled/active (done via the **patch** action — demoed live, not animated).

**Desired vs realized state:** the gateway records what was *asked for*; our automation reports back what was *actually done*. Mention this pattern explicitly in the technical layer — it's a strong point for a technical-leadership audience (similar to how cloud control planes reconcile desired and actual state).

---

## 6. Page structure (top to bottom)

The page scrolls normally, **except** section 5 which is **pinned** (see §8).

1. **Title / intro** — project name, one-line big idea, presenter name placeholder.
2. **The problem** — the old DNS-driven way. A small, simple animation: DNS record changes → a "propagation" progress bar/clock creeps slowly across 10–20 min (sped up visually, labelled). Message: *waiting = risk*.
3. **The big idea** — the one-liner from §4, large type. Before/after: "10–20 minutes" vs "seconds".
4. **Architecture overview** — a **static** (lightly fading-in) diagram of all components from §5 with connecting lines. No step-by-step yet. This is the map the audience will see again in the pinned section.
5. **How it works — pinned interactive window** — the main event. See §7 and §8.
6. **The other actions** — three simple cards, **not animated flows**:
   - **Migrate** — for apps that already have a CNAME: after the wide IP is built, a separate migrate action updates Infoblox to point the existing CNAME at the wide IP.
   - **Patch** — enable/disable toggle between primary and secondary. *This is the DR failover button.*
   - **Delete** — tears down the configuration.
   Each card ends with: *"Shown live in the demo."*
7. **Closing** — recap of the value (seconds not minutes, DNS changed once, full audit trail via realized state) and a "Questions" slide.

---

## 7. Pinned section storyboard — the CREATE journey

Only the **create** action is animated. It contains an **Infoblox branch** (CNAME absent vs present) — showing both starting conditions is what lets the audience later understand migrate and patch in the live demo.

Each beat = **one idea**. Each beat has: a **plain caption** (default visible) and a **technical line** (hidden until the technical layer is on).

### Part A — Building it (move briskly)

| # | What animates | Plain caption | Technical line |
|---|---|---|---|
| 1 | User node lights up; a "request" card travels to ABCD Gateway. Card shows: action `create`, FQDN, primary + secondary server. | "A server team asks for DR protection for their application." | `POST` create action on ABCD Gateway with FQDN, primary & secondary server details. |
| 2 | Gateway writes a record into its DB node; record badge shows status **`creating`** (amber). | "The gateway logs the request." | Gateway persists the request in MongoDB with status `creating` — the *desired state*. |
| 3 | A message drops from the Gateway onto the Kafka topic (pipe/conveyor visual). | "The request is passed along a message queue." | Gateway produces a message to the Kafka topic; `action: create`. |
| 4 | DR Automation picks the message off the topic; a "parse" flash shows `action → create`. | "Our automation picks it up and reads what's needed." | Consumer reads the message, parses the `action` attribute, dispatches to the internal create API. |
| 5 | Automation sends a query arrow to Infoblox: *"Does a CNAME exist for app.example.com?"* A **decision diamond** appears. | "First, we check whether this name already exists in DNS." | Lookup in Infoblox for an existing CNAME on the FQDN. |
| 6 | Automation builds GTM objects **one after another** inside the GTM node: virtual servers → pool → pool members (Primary = **active**/green, Secondary = **standby**/amber) → **wide IP** (`app.gslb.example.com`). | "We build the traffic manager setup: two servers, one active, one on standby." | Create virtual servers, pool, pool members (port 0, default check, no extra monitor), and the wide IP. |

### Part B — The Infoblox branch

Use a **scenario switch** inside the pinned window: **"New application" / "Existing name"**. Default = **New application**. The branch beat renders according to the switch, so the presenter can scroll to beat 7, show one outcome, flip the switch, and show the other without leaving the section.

| # | Scenario | What animates | Plain caption | Technical line |
|---|---|---|---|---|
| 7a | **New application** (CNAME not found) | Infoblox gets a **new CNAME** record drawn in: `app.example.com → app.gslb.example.com`. A line connects Infoblox to the GTM wide IP. | "The name is new, so we create it and point it at the traffic manager." | CNAME absent → create CNAME targeting the wide IP. |
| 7b | **Existing name** (CNAME found) | Existing CNAME shown in Infoblox **unchanged** with a "lock / left as-is" marker. A dashed "later: migrate" arrow appears but does not complete. | "The name already exists, so we leave it untouched for now — switching it over is a separate, deliberate step." | CNAME present → no Infoblox change on create. A separate **migrate** action later updates the CNAME to the wide IP. |
| 8 | (both) | Automation sends a result back to the Gateway DB; status badge animates **`creating` → `created`** (green). A small "failed" variant exists in the legend but isn't played. | "Our automation reports back exactly what it did." | Patch realized state (success/failed) to the gateway DB — desired vs realized state. |

### Part C — DNS resolution & redirection (THE CENTREPIECE — slow down)

This is the primary goal of the whole site. Dim/de-emphasise the gateway, Kafka and automation nodes here, and bring **Client → Resolver → Infoblox → GTM → Servers** into focus. Use a single, clearly visible **"query packet"** (a labelled pill) that physically travels each hop. If the scenario switch is on "Existing name", show a small note that resolution works this way **after migrate**.

| # | What animates | Plain caption | Technical line |
|---|---|---|---|
| 9 | A user/laptop node: someone types `app.example.com`. Query packet appears. | "Now, someone opens the application by its name." | Client issues a DNS query for `app.example.com`. |
| 10 | Packet travels to the resolver, then to Infoblox. | "Their computer asks DNS: where is this?" | Recursive resolver queries the authoritative DNS (Infoblox). |
| 11 | Infoblox answers with the CNAME; the packet **changes label** to `app.gslb.example.com` and is visibly **redirected** (bend in the path, arrow "redirect"). | "DNS says: this name is actually handled by the traffic manager — go ask it." | Infoblox returns CNAME → `app.gslb.example.com`; the wide IP's zone is delegated to the GTM. |
| 12 | Packet arrives at GTM → wide IP → pool. The pool **inspects its members**: Primary glows green (**active**), Secondary amber (**standby**). A selector picks Primary. | "The traffic manager checks which server is currently active." | GTM evaluates the wide IP's pool; selects the enabled/active member. |
| 13 | GTM returns the answer `192.0.2.10`; packet travels back to the client; the client then connects to the **Primary** server (connection line lights up). | "It answers with the active server's address, and the user is connected." | GTM returns an A record for the active member; client connects to the primary. |

### Part D — Closing beat of the pinned section

| # | What animates | Plain caption | Technical line |
|---|---|---|---|
| 14 | Freeze-frame of the full path, with a callout: *"To fail over, we just flip which server is active — the DNS name never changes."* A ghosted toggle icon on the pool (not animated as a full flow). | "That's the whole journey. Next: we'll do it live." | Failover = **patch** action toggling member state; shown in the live API demo. |

> Beat count: 14 (with 7a/7b as one beat position driven by the scenario switch). Keep the beat list in a single data array in JS (§9) so beats can be added, removed or reworded without touching animation code.

---

## 8. Pinned-scroll mechanics (how the window behaves)

- Section 5 is a tall outer container (height ≈ `number_of_beats × ~80vh`, tunable via config) with an inner **"window"** that is `position: sticky; top: 0; height: 100vh`.
- While the outer container scrolls past, the window **stays fixed** and the **diagram advances one beat per scroll segment**. When the last beat finishes, the section releases and the page scrolls on normally.
- Progress → beat: `beatIndex = clamp(floor(progress × beatCount))` where progress is how far the outer container has scrolled through its range. Use a scroll listener throttled with `requestAnimationFrame` (or `IntersectionObserver` sentinels — choose the more robust option and explain why).
- **State must be a pure function of the beat index.** Scrolling backwards must cleanly reverse to the previous beat. No animation should depend on "having played" an earlier one. Implement by setting `data-beat="N"` (and `data-scenario="new|existing"`) on the window and letting CSS (transitions on attributes/classes) render that state; use JS only for things CSS can't do (moving the packet along a path).
- **Presenter controls** (very important — the presenter controls pace while talking):
  - `→` / `PageDown` / `Space`: jump to next beat (scrolls to that beat's position smoothly).
  - `←` / `PageUp`: previous beat.
  - `T`: toggle technical layer on/off.
  - `S`: toggle scenario (New application / Existing name).
  - `Home`/`End` within the section: first/last beat.
  - These work whether the presenter uses a mouse wheel, trackpad, keyboard or a clicker (clickers send PageUp/PageDown).
- **Progress indicator** inside the window: a row of dots/steps with the current beat highlighted; dots are clickable to jump.
- **Deep link:** URL hash like `#how-it-works/9` jumps to that beat (handy for rehearsal and Q&A).
- **`prefers-reduced-motion`:** replace movement with instant state changes/fades.

---

## 9. Animation techniques (native only)

- **Path drawing:** SVG `stroke-dasharray` / `stroke-dashoffset` transitions to "draw" connection lines.
- **Packet travel:** move a labelled SVG group along a path using `path.getTotalLength()` + `getPointAtLength()` driven by `requestAnimationFrame`, **or** CSS `offset-path` — pick one and use it consistently. Travel duration per hop ~0.8–1.2s (configurable).
- **Status changes:** CSS transitions on `fill`, `opacity`, `transform` (e.g. badge `creating → created`, member glow active/standby).
- **Focus/dim:** in Part C, non-DNS nodes go to ~25% opacity.
- **Data model:** one `BEATS` array, each item with `id`, `caption`, `techLine`, `focusNodes[]`, `actions` (what to show/draw/move), and optional `scenario` variants. One `CONFIG` object for names, IPs, colours, timing, beat height.
- Keep animation code generic (a small renderer that applies a beat's state) rather than 14 hand-written functions.

---

## 10. Visual design

- **Projector-first:** must be legible at 1920×1080 on a big screen from the back of a room, and still work at 1366×768.
- **Theme:** dark background with high-contrast nodes is recommended for projection; define all colours as CSS custom properties so a light theme is a one-line switch.
- **Type sizes:** captions ≥ 28px on 1080p; node labels ≥ 18px; technical line ≥ 20px, monospace for identifiers (`Consolas`, monospace).
- **Captions panel:** fixed region of the window (bottom or right), never overlapping the diagram. Plain caption large; technical line smaller, visually distinct (e.g. monospace, muted accent colour, small "TECH" tag).
- **Consistent node positions** between the §6.4 architecture overview and the pinned window, so the audience recognises the same map.
- Status colours: active = green, standby = amber, creating = amber, created = green, failed = red. Don't rely on colour alone — add text labels.
- Clean, calm, minimal. No gratuitous motion — every movement should mean something.

---

## 11. Build phases (do these in order, stop for review after each)

1. **Plan:** propose file structure, the `BEATS` data shape, and the scroll/pin approach. Wait for approval.
2. **Skeleton:** all page sections with placeholder content; pinned section working with empty beats, keyboard controls, progress dots, deep links.
3. **Diagram:** inline SVG with all nodes and paths in their final layout (static), shared between overview and pinned window.
4. **Parts A + B:** beats 1–8 including the scenario switch.
5. **Part C:** beats 9–13 (the centrepiece — spend the most polish here) and beat 14.
6. **Other sections:** problem animation, big idea, action cards, closing.
7. **Polish & checks:** reduced motion, technical-layer toggle, 1080p and 1366 layouts, backward scrolling, no console errors.

---

## 12. File structure (suggested)

```
/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── config.js        # names, IPs, colours, timing
│   ├── beats.js         # BEATS data array (captions, tech lines, states)
│   ├── diagram.js       # SVG helpers: draw paths, move packet
│   └── story.js         # pinning, scroll → beat, keyboard, deep links
├── .gitlab-ci.yml       # GitLab Pages job: copy site into public/
└── README.md            # how to run locally, presenter keys, how to edit beats
```

No external files of any kind. Local preview should work by opening `index.html` directly or via a simple local server.

**`.gitlab-ci.yml`:** minimal `pages` job that copies the site files into `public/` and publishes it as the artifact. Use whatever base image our runners allow — leave a comment flagging that the image name may need changing for our environment.

---

## 13. Acceptance criteria

- [ ] Zero external requests (verify in DevTools Network tab: only local files).
- [ ] No libraries, no build step.
- [ ] Pinned section holds in place and advances exactly one beat per scroll segment, and releases at the end.
- [ ] Scrolling backwards reverses cleanly, beat by beat.
- [ ] Keyboard/clicker controls, progress dots and `#how-it-works/N` deep links all work.
- [ ] Scenario switch shows both Infoblox outcomes at the branch beat.
- [ ] Technical layer hidden by default; `T` reveals it on every beat.
- [ ] The DNS resolution part (beats 9–13) clearly shows the packet being **redirected** by the CNAME to the wide IP and the GTM choosing the **active** server.
- [ ] Legible on a projector at 1080p; works at 1366×768.
- [ ] Only placeholder names ("ABCD Gateway", `example.com` FQDNs, documentation IPs). No real names, logos, or company identifiers.
- [ ] All wording editable in `beats.js` / `config.js` without touching animation code.

---

## 14. As built: decisions & changes (supersedes earlier sections where they conflict)

> Added after the build. Agents: also read `CLAUDE.md` (architecture, data model, status).

### 14.1 Answers to the Phase 1 open questions
| Topic | Decision |
|---|---|
| DNS hops in Part C | **Technically accurate**: Infoblox returns the CNAME **to the resolver**; the resolver then asks the GTM (GSLB zone delegated). Answers return via the resolver to the client. |
| Packet when going backwards | Forward by exactly one step **plays** the packet; going back or jumping shows the **finished state** instantly. |
| Colours | CSS custom properties only (`:root`, `[data-theme="light"]`); `CONFIG.theme` selects. |
| Clicker outside pinned sections | → / PageDown move **section by section** like slides; inside a pinned section, step by step. |
| Beat-7 dot label | Plain number; the scenario switch shows which variant. |
| GTM monitor (§5 "port 0 … default connectivity check") | **Superseded.** No GTM health monitor is in scope — servers are covered by existing observability; failover is a **deliberate** enable/disable (`patch`). TECH lines say so. |

### 14.2 Changes to the storyboard
- **Decision diamond** (§7 beat 5/7) asks **"Create CNAME?"** — New application → **Yes** (create CNAME → wide IP); Existing name → **No** (record left as-is).
- **Migrate flow added** (Existing name only): after beat 8, four steps — migrate request (status `migrating`) → queue/automation (`action → migrate`) → Infoblox CNAME updated to the wide IP ("Migrated") → report (`migrated`). "How it works" therefore has **14 steps (New)** / **18 steps (Existing)**. Part C runs identically afterwards.
- **New pinned section "Request journey"** after "How it works" (owner request), switch **Today (DNS only) / With GTM**, 9 steps: type → ask DNS → answer (A record vs CNAME + redirect) → decide (GTM picks active) → connect → disaster (primary down) → failover (Today: change record + wait 10–20 min; GTM: flip pool toggle in seconds, CNAME unchanged) → retry (Today: cached old answer still fails; GTM: same path, secondary) → recap. Runs slower (1.8 s per hop) than "How it works" (1.0 s).
- "How it works" Part C (beats 9–14) is kept as well (owner chose to keep both).
- **Switching scenario** (button or `S`) **restarts that section at step 1**.
- Problem section: animated record change + 10 DNS caches flipping unevenly + clock to 20:00 (sped up, labelled), plays on view, Replay button.
- Big idea: added "time until users reach the secondary" race bars (Today slow, GTM instant).
- Action cards: inline line icons; **Patch** highlighted as "The DR failover button".
- Sections fade in on scroll; reduced motion → fades only.

### 14.3 Files (final)
`index.html`, `css/styles.css`, `js/config.js`, `js/beats.js`, `js/util.js`, `js/sections.js`, `js/diagram.js`, `js/story.js`, `.gitlab-ci.yml`, `README.md`, `CLAUDE.md`. Classic `defer` scripts (not ES modules) so `file://` works.

### 14.4 Phase status
Phases 1–6 done (plus the additions above). **Phase 7 (polish & checks) remaining** — see the TODO list in `CLAUDE.md`.
