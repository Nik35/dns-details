# DR Failover Automation — presentation site

A static, animated, scroll-driven presentation that shows how DNS resolution works and why
GTM-based failover takes **seconds instead of 10–20 minutes**. Pure HTML/CSS/JS — no
libraries, no build step, no network requests.

## Run it

- **Quickest:** double-click `index.html` (Chrome or Edge).
- **Local server** (same as GitLab Pages):
  ```bash
  python -m http.server 8765 --directory .
  ```
  then open <http://127.0.0.1:8765>.
- After editing files, press **Ctrl+F5** so the browser doesn't use cached copies.

## Presenter keys

| Key | Action |
|---|---|
| `→` `PageDown` `Space` | Next step / next section (clicker "next" works too) |
| `←` `PageUp` `Shift+Space` | Previous step / section |
| `T` | Show / hide the technical layer (TECH line) |
| `S` | Switch scenario of the current animated section (restarts it at step 1) |
| `Home` / `End` | First / last step (inside an animated section) |
| Dots under the diagram | Jump to a step |

Mouse wheel / trackpad scrolling also steps through the animation.

**Deep links** (handy for rehearsal and Q&A):
`#how-it-works/9`, `#request-journey/7`, `#problem`, `#big-idea`, `#actions` …

## Sections

1. Title · 2. The problem (DNS propagation animation) · 3. The big idea · 4. Architecture map ·
5. **How it works** — New application (14 steps) / Existing name (18 steps, incl. migrate) ·
5b. **Request journey** — Today (DNS only) vs With GTM, incl. disaster and failover ·
6. The other actions (Migrate / Patch / Delete) · 7. Recap · Questions.

## Editing content (no animation code needed)

| To change… | Edit |
|---|---|
| Names, FQDNs, IPs, presenter name | `js/config.js` (top) |
| Diagram labels, pills, request-card lines | `js/config.js` → `nodes`, `labels` |
| Page text (problem, big idea, cards, recap) | `js/config.js` → `text` |
| Switch labels, section titles, speed per section | `js/config.js` → `pins` |
| Step captions / TECH lines / what happens per step | `js/beats.js` (`DR.BEATS`, `DR.JOURNEY`) |
| Animation speed | `js/config.js` → `timing`, `pins[…].hopMs` / `stateMs` |
| Colours / light theme | `css/styles.css` `:root` tokens; `CONFIG.theme = 'light'` |

Text may use tokens such as `{fqdn}`, `{wideIp}`, `{gateway}`, `{primary.ip}` (filled from
`config.js`), and \`backticks\` for monospace identifiers.

## Deploy

- **GitHub Pages** (live preview): `.github/workflows/pages.yml` publishes `index.html`, `css/`, `js/`
  on every push to `main`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
  URL: <https://nik35.github.io/dns-details/>
- **GitLab Pages**: `.gitlab-ci.yml` copies the same files into `public/`. Change the `image:` to
  one your runners are allowed to pull.

## For developers / AI agents

See **`CLAUDE.md`** (architecture, data model, conventions, status, TODO) and
`dr-gtm-presentation-spec.md` (original spec + §14 decisions as built).
