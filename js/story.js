/* =====================================================================
   story.js — pinned sections + presenter navigation.

   How it works
   - Every <section data-pin> becomes a pinned section. Its beats come
     from DR.PIN_BEATS[section.id]; its switch labels from CONFIG.pins.
   - A pinned section is tall (beats × beatHeightVh + 100vh). Its child
     .pin-window is position:sticky, so it stays on screen while the
     section scrolls past.
   - Scroll position → progress (0..1) → beat index, computed on every
     frame that scrolls (rAF-throttled). Stateless: wherever the page
     lands (wheel, keys, deep link, reload) the beat is correct.
     (Chosen over IntersectionObserver sentinels, which only report
     edge crossings and can be skipped by a fast flick or a jump.)
   - Keys and dots never set the beat directly: they scroll to a "stop"
     and the scroll handler renders. One code path for all input.
   - Stops = one per normal section (its top) + one per beat (middle of
     the beat's scroll segment). → / PageDown / Space = next stop,
     ← / PageUp = previous, so a clicker walks the whole talk.
   - Rendering sets data-beat / data-scenario on .pin-window and hands
     the merged state for (beat, scenario) to DR.diagram.apply.
   ===================================================================== */
(() => {
  const { CONFIG, clamp } = DR;
  const root = document.documentElement;
  const sections = [...document.querySelectorAll('main > section')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let tech = !!CONFIG.showTechByDefault;
  let pendingStop = null;   // stop index we are smooth-scrolling towards
  let pendingTimer = 0;
  let lastStop = 0;         // remembered so a resize (e.g. F11) keeps our place
  let ready = false;

  history.scrollRestoration = 'manual';

  /* ---------------- Beat data (pure) ---------------- */

  /** Beat fields with the scenario override applied. */
  function resolveBeat(beats, i, scenario) {
    const b = beats[i];
    const o = (b.scenarios && b.scenarios[scenario]) || {};
    return { ...b, ...o, set: { ...b.set, ...o.set }, after: { ...b.after, ...o.after } };
  }

  /** Diagram state at beat i. `pre` = before this beat's packet lands; `full` = after. */
  function computeState(beats, i, scenario) {
    const pre = {};
    for (let k = 0; k < i; k++) {
      const b = resolveBeat(beats, k, scenario);
      Object.assign(pre, b.set, b.after);
    }
    const cur = resolveBeat(beats, i, scenario);
    Object.assign(pre, cur.set);
    return { pre, full: { ...pre, ...cur.after } };
  }

  /* ---------------- Building a pinned section ---------------- */

  function template(cfg) {
    const f = DR.fmtHtml;
    const tag = f(CONFIG.text.howItWorks.techTag);
    const seg = Object.entries(cfg.scenarios)
      .map(([k, v]) => `<button type="button" class="seg__btn" data-scenario-btn="${k}">${f(v)}</button>`).join('');
    return `
      <div class="pin-window" data-beat="1">
        <header class="pin-bar">
          <div class="pin-title">
            <span class="pin-kicker">${f(cfg.kicker)}</span>
            <span class="pin-part"></span>
          </div>
          <div class="pin-controls">
            <div class="seg" role="group" aria-label="Scenario (S)">${seg}</div>
            <button type="button" class="tech-toggle" aria-pressed="false" title="Technical layer (T)">
              <span class="tag">${tag}</span>
              <span class="tech-toggle__state">off</span>
            </button>
          </div>
        </header>
        <div class="pin-stage">
          <div class="diagram-slot diagram-slot--pinned"></div>
          <p class="pin-note" hidden></p>
          <p class="pin-callout" hidden></p>
        </div>
        <footer class="pin-captions">
          <p class="caption" aria-live="polite"></p>
          <p class="tech-line"><span class="tag">${tag}</span><span class="tech-text"></span></p>
        </footer>
        <nav class="pin-dots" aria-label="Steps"></nav>
      </div>`;
  }

  function createPin(section) {
    const id = section.id;
    const cfg = CONFIG.pins[id];
    const beats = DR.PIN_BEATS[id];
    if (!cfg || !beats) { console.warn('[DR] no config/beats for pinned section', id); return null; }

    section.innerHTML = template(cfg);
    section.style.setProperty('--beats', beats.length);
    section.style.setProperty('--beat-vh', CONFIG.beatHeightVh);
    const win = section.querySelector('.pin-window');
    // Optional per-section pace (CONFIG.pins[id].hopMs / stateMs).
    if (cfg.hopMs) win.style.setProperty('--hop', `${cfg.hopMs}ms`);
    if (cfg.stateMs) win.style.setProperty('--dur', `${cfg.stateMs}ms`);
    const pin = {
      id, section, cfg, win,
      allBeats: beats,
      beats: beatsFor(beats, cfg.defaultScenario),
      scenario: cfg.defaultScenario,
      beat: 0,
      shown: { beat: -1, scenario: null, tech: null },
      els: {
        part: win.querySelector('.pin-part'),
        caption: win.querySelector('.caption'),
        tech: win.querySelector('.tech-text'),
        note: win.querySelector('.pin-note'),
        callout: win.querySelector('.pin-callout'),
        dots: win.querySelector('.pin-dots'),
        techBtn: win.querySelector('.tech-toggle'),
        techState: win.querySelector('.tech-toggle__state'),
        scenarioBtns: [...win.querySelectorAll('[data-scenario-btn]')],
      },
    };
    pin.N = pin.beats.length;
    section.style.setProperty('--beats', pin.N);
    DR.diagram.build(win.querySelector('.diagram-slot'), 'pinned');
    buildDots(pin);
    pin.els.dots.addEventListener('click', (e) => {
      const btn = e.target.closest('.dot');
      if (btn) goToBeat(pin, Number(btn.dataset.beat));
    });
    pin.els.techBtn.addEventListener('click', toggleTech);
    pin.els.scenarioBtns.forEach((btn) => btn.addEventListener('click', () => setScenario(pin, btn.dataset.scenarioBtn)));
    return pin;
  }

  /** Beats that exist in a scenario (beats may be limited with `only`). */
  function beatsFor(all, scenario) {
    return all.filter((b) => !b.only || b.only.includes(scenario));
  }

  function buildDots(pin) {
    pin.els.dots.innerHTML = '';
    let group = null;
    let lastPart = null;
    pin.beats.forEach((b, i) => {
      if (b.part !== lastPart) {
        group = document.createElement('div');
        group.className = 'dot-group';
        group.innerHTML = `<span class="dot-group__label">${DR.fmtHtml(CONFIG.parts[b.part] || b.part)}</span><span class="dot-group__dots"></span>`;
        pin.els.dots.appendChild(group);
        lastPart = b.part;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dot';
      btn.textContent = String(i + 1);
      btn.dataset.beat = String(i);
      group.querySelector('.dot-group__dots').appendChild(btn);
    });
  }

  const pins = [...document.querySelectorAll('main > section[data-pin]')].map(createPin).filter(Boolean);
  const pinOf = (section) => pins.find((p) => p.section === section);

  /* ---------------- Geometry ---------------- */

  const absTop = (el) => el.getBoundingClientRect().top + scrollY;

  function pinGeom(pin) {
    const top = absTop(pin.section);
    const range = Math.max(1, pin.section.offsetHeight - innerHeight);
    return { top, range, seg: range / pin.N };
  }

  function beatFromScroll(pin) {
    const { top, range } = pinGeom(pin);
    const p = clamp((scrollY - top) / range, 0, 1);
    return Math.min(pin.N - 1, Math.floor(p * pin.N));
  }

  /** Every navigation stop on the page, in order. */
  function stopList() {
    const list = [];
    sections.forEach((s) => {
      const pin = pinOf(s);
      if (pin) {
        const g = pinGeom(pin);
        for (let i = 0; i < pin.N; i++) list.push({ section: s, pin, beat: i, pos: g.top + (i + 0.5) * g.seg });
      } else {
        list.push({ section: s, pos: absTop(s) });
      }
    });
    return list;
  }

  const firstStopOf = (list, section) => list.findIndex((s) => s.section === section);

  function isEngaged(pin) {
    const r = pin.section.getBoundingClientRect();
    return r.top <= 1 && r.bottom >= innerHeight - 1;
  }

  function currentSection() {
    const mid = scrollY + innerHeight / 2;
    let sec = sections[0];
    for (const s of sections) if (absTop(s) <= mid) sec = s;
    return sec;
  }

  /** Current stop. Fractional = "between stops" (entering/leaving a pin). */
  function currentStop() {
    if (pendingStop !== null) return pendingStop;
    const list = stopList();
    const sec = currentSection();
    const first = firstStopOf(list, sec);
    const pin = pinOf(sec);
    if (!pin) return first;
    const r = sec.getBoundingClientRect();
    if (r.top > 1) return first - 0.5;                           // entering, not yet pinned
    if (r.bottom < innerHeight - 1) return first + pin.N - 0.5;  // released past the end
    return first + beatFromScroll(pin);
  }

  /** The pinned section the presenter is in (for S / Home / End). */
  function activePin() {
    return pinOf(currentSection()) || null;
  }

  /* ---------------- Navigation ---------------- */

  function goToStop(index, { instant = false } = {}) {
    const list = stopList();
    const i = clamp(index, 0, list.length - 1);
    pendingStop = i;
    lastStop = i;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pendingStop = null; }, instant ? 0 : CONFIG.timing.navSettleMs);
    scrollTo({ top: list[i].pos, behavior: instant || reducedMotion.matches ? 'auto' : 'smooth' });
  }

  const goToBeat = (pin, b, opts) =>
    goToStop(firstStopOf(stopList(), pin.section) + clamp(b, 0, pin.N - 1), opts);
  const next = () => goToStop(Math.floor(currentStop()) + 1);
  const prev = () => goToStop(Math.ceil(currentStop()) - 1);

  const clearPending = () => { pendingStop = null; clearTimeout(pendingTimer); };
  addEventListener('scrollend', clearPending);
  ['wheel', 'touchstart', 'pointerdown'].forEach((t) => addEventListener(t, clearPending, { passive: true }));

  /* ---------------- Toggles ---------------- */

  function toggleTech() { tech = !tech; pins.forEach(render); }
  /**
   * Switch scenario and restart the section at step 1, so the presenter can
   * walk the other flow from the beginning without clicking back.
   */
  function setScenario(pin, s) {
    if (s === pin.scenario) return;
    const nextBeats = beatsFor(pin.allBeats, s);
    pin.scenario = s;
    pin.beats = nextBeats;
    if (nextBeats.length !== pin.N) {
      // Step list changes (e.g. migrate steps exist only for "Existing name").
      pin.N = nextBeats.length;
      pin.section.style.setProperty('--beats', pin.N);
      buildDots(pin);
    }
    pin.shown = { beat: -1, scenario: null, tech: null };
    goToBeat(pin, 0, { instant: true });
    pin.beat = 0;
    render(pin);
    syncHash();
  }
  function toggleScenario(pin) {
    const keys = Object.keys(pin.cfg.scenarios);
    setScenario(pin, keys[(keys.indexOf(pin.scenario) + 1) % keys.length]);
  }

  /* ---------------- Rendering ---------------- */

  function swapText(el, html) {
    if (el.innerHTML === html) return;
    el.innerHTML = html;
    el.classList.remove('is-entering');
    void el.offsetWidth; // restart the fade-in
    el.classList.add('is-entering');
  }

  function render(pin) {
    const { beat, scenario, shown, els, win } = pin;
    if (beat === shown.beat && scenario === shown.scenario && tech === shown.tech) return;
    const prevBeat = shown.beat;
    const b = resolveBeat(pin.beats, beat, scenario);

    win.dataset.beat = String(beat + 1);
    win.dataset.beatId = b.id;
    win.dataset.part = b.part;
    win.dataset.scenario = scenario;
    win.dataset.switch = b.hotSwitch ? 'hot' : '';
    root.dataset.tech = tech ? 'on' : 'off';

    els.part.textContent = DR.fmtText(CONFIG.parts[b.part] || '');
    swapText(els.caption, DR.fmtHtml(b.caption));
    swapText(els.tech, DR.fmtHtml(b.techLine));
    els.note.hidden = !b.note;
    els.note.innerHTML = b.note ? DR.fmtHtml(b.note) : '';
    els.callout.hidden = !b.callout;
    if (b.callout) swapText(els.callout, DR.fmtHtml(b.callout));

    els.techBtn.setAttribute('aria-pressed', String(tech));
    els.techState.textContent = tech ? 'on' : 'off';
    els.scenarioBtns.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.scenarioBtn === scenario)));

    els.dots.querySelectorAll('.dot').forEach((d, i) => {
      d.classList.toggle('is-current', i === beat);
      d.classList.toggle('is-done', i < beat);
      if (i === beat) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
      d.title = `${i + 1}. ${DR.fmtText(resolveBeat(pin.beats, i, scenario).caption)}`;
      d.setAttribute('aria-label', d.title);
    });

    // Only the beat itself matters for the diagram; tech toggles don't replay packets.
    if (beat !== shown.beat || scenario !== shown.scenario) {
      const { pre, full } = computeState(pin.beats, beat, scenario);
      DR.diagram.apply(win, full, {
        pre, focus: b.focus, packet: b.packet || null,
        hopMs: (b.packet && b.packet.hopMs) || pin.cfg.hopMs || CONFIG.timing.hopMs,
        animate: beat === prevBeat + 1 && scenario === shown.scenario && !reducedMotion.matches,
      });
    }

    pin.shown = { beat, scenario, tech };
  }

  /* ---------------- Deep links ---------------- */

  function syncHash() {
    if (!ready) return;
    const sec = currentSection();
    const pin = pinOf(sec);
    const hash = pin ? `#${pin.id}/${pin.beat + 1}` : `#${sec.id}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  /** Jump to whatever the URL hash points at (#section or #pinned-id/N). */
  function applyHash() {
    const h = decodeURIComponent(location.hash || '');
    const m = h.match(/^#([\w-]+)(?:\/(\d+))?$/);
    if (!m) return false;
    const el = document.getElementById(m[1]);
    if (!el || !sections.includes(el)) return false;
    const pin = pinOf(el);
    if (pin) goToBeat(pin, (Number(m[2]) || 1) - 1, { instant: true });
    else goToStop(firstStopOf(stopList(), el), { instant: true });
    return true;
  }

  /* ---------------- Events ---------------- */

  function update() {
    pins.forEach((pin) => { pin.beat = beatFromScroll(pin); render(pin); });
    syncHash();
    if (pendingStop === null) lastStop = currentStop();
  }

  function onResize() {
    // Heights are in vh, so a new viewport moves every stop. Return to ours.
    if (Number.isInteger(lastStop)) goToStop(lastStop, { instant: true });
    update();
  }

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('hashchange', () => { applyHash(); update(); });

  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const pin = activePin();
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        next(); break;
      case ' ':
        if (e.shiftKey) prev(); else next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        prev(); break;
      case 'Home':
      case 'End':
        if (!pin || !isEngaged(pin)) return;   // outside a pin: normal browser behaviour
        goToBeat(pin, e.key === 'Home' ? 0 : pin.N - 1);
        break;
      case 't': case 'T':
        toggleTech(); break;
      case 's': case 'S':
        if (!pin) return;
        toggleScenario(pin); break;
      default:
        return;
    }
    e.preventDefault();
  });

  /* ---------------- Boot ---------------- */

  if (!applyHash()) scrollTo(0, 0);
  update();
  ready = true;
  syncHash();
  // Chrome can reset scroll during load (fragment handling); apply the deep link again.
  addEventListener('load', () => { applyHash(); update(); }, { once: true });

  // Exposed for debugging.
  DR.story = {
    pins, next, prev, toggleTech,
    goToBeat: (id, b) => goToBeat(pins.find((p) => p.id === id), b),
    setScenario: (id, s) => setScenario(pins.find((p) => p.id === id), s),
  };
})();
