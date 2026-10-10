/* Non-pinned sections: theme, text binding, cards and recap lists.
   (Problem-section animation and fade-ins arrive in Phase 6.) */
(() => {
  const { CONFIG } = DR;
  const T = CONFIG.text;

  document.documentElement.dataset.theme = CONFIG.theme || 'dark';

  // Generic line icons (no vendor logos), drawn with currentColor.
  const ICONS = {
    migrate: '<path d="M6 16h22l-6-6M28 16l-6 6"/><circle cx="6" cy="16" r="3"/>',
    patch: '<rect x="3" y="9" width="28" height="14" rx="7"/><circle class="icon-knob" cx="23" cy="16" r="5"/>',
    delete: '<path d="M6 9h22M13 9V5h8v4M9 9l2 20h12l2-20M15 14v10M19 14v10"/>',
  };
  const icon = (name) => (ICONS[name]
    ? `<svg class="card__icon" viewBox="0 0 34 34" aria-hidden="true">${ICONS[name]}</svg>` : '');

  // Action cards
  const cards = document.querySelector('[data-cards]');
  if (cards) {
    cards.innerHTML = T.actions.cards.map((c, i) => `
      <article class="card reveal${c.highlight ? ' card--highlight' : ''}" style="--i:${i}">
        <div class="card__head">${icon(c.icon)}<h3 class="card__title">${DR.fmtHtml(c.title)}</h3></div>
        ${c.badge ? `<p class="card__badge">${DR.fmtHtml(c.badge)}</p>` : ''}
        <p class="card__body">${DR.fmtHtml(c.body)}</p>
        <p class="card__footer">${DR.fmtHtml(T.actions.footer)}</p>
      </article>`).join('');
  }

  // Closing recap
  const recap = document.querySelector('[data-recap]');
  if (recap) {
    recap.innerHTML = T.closing.items.map((it, i) => `
      <li class="recap__item reveal" style="--i:${i}">
        <strong class="recap__value">${DR.fmtHtml(it.value)}</strong>
        <span class="recap__label">${DR.fmtHtml(it.label)}</span>
      </li>`).join('');
  }

  DR.bindText();

  /* ---------- Fade-in on scroll (normal slides only) ----------
     Each slide gets .is-visible when it enters the viewport; children
     marked .reveal fade/slide in with a stagger (--i). Re-arms on leave
     so the effect replays when the presenter scrolls back. */
  document.querySelectorAll('.slide .slide__inner').forEach((el) => el.classList.add('reveal-scope'));
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle('is-visible', e.isIntersecting));
  }, { threshold: 0.25 });
  document.querySelectorAll('.reveal-scope').forEach((el) => revealIO.observe(el));

  /* ---------- Problem section: DNS change + slow propagation ----------
     Plays when the section comes into view, resets when it leaves.
     Timeline: record changes → caches flip one by one while a clock
     creeps towards CONFIG.timing.problemMinutes. */
  (function propagation() {
    const root = document.querySelector('[data-prop]');
    if (!root) return;
    const A = T.problem.anim;
    const total = A.caches;
    const secs = CONFIG.timing.problemSeconds;
    const minutes = CONFIG.timing.problemMinutes;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');

    // When each cache picks up the new answer (fraction of the timeline).
    // Uneven on purpose: propagation is unpredictable, the last ones lag.
    const flipAt = Array.from({ length: total }, (_, i) => {
      const base = (i + 1) / (total + 0.3);
      const wobble = [0.03, -0.04, 0.06, -0.02, 0.05, -0.05, 0.02, 0.07, -0.03, 0.0][i % 10];
      return Math.min(0.995, Math.max(0.06, base * base * 0.55 + base * 0.45 + wobble));
    }).sort((a, b) => a - b);
    flipAt[total - 1] = 1; // the last one only at the very end

    const cachesEl = root.querySelector('[data-prop-caches]');
    cachesEl.innerHTML = flipAt.map((_, i) => `
      <span class="cache">
        <span class="cache__name">${DR.fmtHtml(A.cacheName)} ${i + 1}</span>
        <span class="cache__ans cache__ans--old">${DR.fmtHtml(A.oldAnswer)}</span>
        <span class="cache__ans cache__ans--new">${DR.fmtHtml(A.newAnswer)}</span>
      </span>`).join('');
    const caches = [...cachesEl.children];
    const fill = root.querySelector('.prop__fill');
    const clock = root.querySelector('.prop__clock');
    const status = root.querySelector('.prop__status');

    const mmss = (m) => {
      const s = Math.round(m * 60);
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };

    function render(frac) {
      let updated = 0;
      caches.forEach((c, i) => {
        const on = frac >= flipAt[i];
        c.classList.toggle('is-new', on);
        if (on) updated++;
      });
      fill.style.transform = `scaleX(${frac})`;
      clock.textContent = mmss(frac * minutes);
      const left = total - updated;
      status.innerHTML = left
        ? DR.fmtHtml(A.stillOld).replace('{n}', left).replace('{total}', total)
        : DR.fmtHtml(A.done);
    }

    let raf = 0;
    let timers = [];
    function reset() {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      timers = [];
      root.dataset.phase = 'idle';
      render(0);
    }

    function play() {
      reset();
      if (reduced.matches) { root.dataset.phase = 'done'; render(1); return; }
      timers.push(setTimeout(() => { root.dataset.phase = 'changed'; }, 500));
      timers.push(setTimeout(() => {
        root.dataset.phase = 'spreading';
        const t0 = performance.now();
        const tick = (now) => {
          const frac = Math.min(1, (now - t0) / (secs * 1000));
          render(frac);
          if (frac < 1) raf = requestAnimationFrame(tick);
          else root.dataset.phase = 'done';
        };
        raf = requestAnimationFrame(tick);
      }, 1700));
    }

    root.querySelector('.prop__replay').addEventListener('click', play);
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (root.dataset.phase === 'idle') play(); }
      else reset();
    }, { threshold: 0.4 }).observe(root);
    reset();
  })();
})();
