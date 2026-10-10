/* =====================================================================
   diagram.js — builds the architecture SVG and renders a beat's state.

   - Layout (coordinates) lives here; all words come from CONFIG.
   - Every stateful element carries data-el="key". apply() sets its
     data-state from the merged beat state; CSS does the visuals.
   - The only JS animation is the travelling packet/token, moved along
     an SVG path with getPointAtLength() + requestAnimationFrame.
   ===================================================================== */
(() => {
  const { CONFIG } = DR;
  const L = CONFIG.labels;
  const VB = { w: 1700, h: 720 };

  /* ---------------- Layout ---------------- */
  const N = {
    user:      { x: 20,   y: 30,  w: 210, h: 130, c: '--c-neutral' },
    gateway:   { x: 260,  y: 30,  w: 220, h: 130, c: '--c-gateway' },
    db:        { x: 290,  y: 210, w: 160, h: 100, c: '--c-db' },
    kafka:     { x: 530,  y: 30,  w: 220, h: 130, c: '--c-kafka' },
    auto:      { x: 800,  y: 30,  w: 220, h: 130, c: '--c-auto' },
    infoblox:  { x: 780,  y: 330, w: 260, h: 170, c: '--c-dns' },
    gtm:       { x: 1080, y: 30,  w: 300, h: 490, c: '--c-gtm' },
    primary:   { x: 1440, y: 170, w: 220, h: 120, c: '--c-active' },
    secondary: { x: 1440, y: 300, w: 220, h: 120, c: '--c-standby' },
    client:    { x: 20,   y: 550, w: 210, h: 120, c: '--c-neutral' },
    resolver:  { x: 260,  y: 550, w: 220, h: 120, c: '--c-neutral' },
  };

  // id: [d, "endA endB", structural (shown on the overview map / as faint track)]
  const PATHS = {
    'user-gw':        ['M230 95 H260', 'user gateway', true],
    'gw-db':          ['M370 160 V210', 'gateway db', true],
    'gw-kafka':       ['M480 95 H530', 'gateway kafka', true],
    'kafka-auto':     ['M750 95 H800', 'kafka auto', true],
    'auto-ib':        ['M910 160 V330', 'auto infoblox', true],
    'auto-gtm':       ['M1020 95 H1080', 'auto gtm', true],
    'auto-db':        ['M860 160 V290 H450', 'auto db', false],
    'ib-gtm':         ['M1040 415 H1060 V128 H1100', 'infoblox gtm', false],
    'm1-srv':         ['M1348 245 H1440', 'gtm primary', true],
    'm2-srv':         ['M1348 335 H1440', 'gtm secondary', true],
    'client-res':     ['M230 590 H260', 'client resolver', true],
    'res-ib':         ['M480 580 H890 V500', 'resolver infoblox', true],
    'ib-res':         ['M930 500 V610 H480', 'infoblox resolver', false],
    'res-gtm':        ['M370 670 V690 H1300 V520', 'resolver gtm', true],
    'gtm-res':        ['M1160 520 V640 H480', 'gtm resolver', false],
    'res-client':     ['M260 640 H230', 'resolver client', false],
    'client-primary': ['M125 670 V708 H1690 V230 H1660', 'client primary', false],
    'client-secondary': ['M125 670 V708 H1690 V360 H1660', 'client secondary', false],
    // Inside the GTM: up to the wide IP, then down the pool to the chosen member
    'gtm-in1':        ['M1300 520 V512 H1094 V128 H1100 M1094 128 V245 H1112', 'gtm', false],
    'gtm-in2':        ['M1300 520 V512 H1094 V128 H1100 M1094 128 V335 H1112', 'gtm', false],
  };

  /* ---------------- Markup helpers ---------------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const t = (s) => DR.fmtText(s).replace(/[&<>"]/g, (c) => ESC[c]);
  const text = (x, y, s, cls = '', anchor = 'start') =>
    `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${t(s)}</text>`;

  function nodeShell(id, inner = '') {
    const n = N[id];
    const [label, sub] = CONFIG.nodes[id] || [id, ''];
    const cx = n.x + n.w / 2;
    const isServer = id === 'primary' || id === 'secondary';
    const tight = id === 'gtm';   // GTM header sits above the wide IP
    return `
      <g class="node node--${id}" data-node="${id}" data-el="node:${id}" style="--node-c: var(${n.c})">
        <rect class="n-box" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14"/>
        ${text(cx, n.y + (tight ? 34 : 40), label, 'n-label', 'middle')}
        ${sub ? text(cx, n.y + (tight ? 58 : 66), sub, isServer ? 'n-sub mono' : 'n-sub', 'middle') : ''}
        ${inner}
      </g>`;
  }

  function pill(x, y, w, label, cls) {
    return `<g class="pill ${cls}">
      <rect x="${x}" y="${y}" width="${w}" height="28" rx="14"/>
      ${text(x + w / 2, y + 20, label, 'pill-text', 'middle')}
    </g>`;
  }

  function statusPills(cx, y) {
    return pill(cx - 55, y, 110, L.active, 'pill--active') + pill(cx - 55, y, 110, L.standby, 'pill--standby');
  }

  function serverExtras(id) {
    const n = N[id];
    const cx = n.x + n.w / 2;
    return statusPills(cx, n.y + 80) + pill(cx - 55, n.y + 80, 110, L.down, 'pill--down') + `
      <g class="down-x"><path d="M${n.x + 14} ${n.y + 14} l26 26 m0 -26 l-26 26"/></g>`;
  }

  function clientExtras() {
    const n = N.client;
    const cx = n.x + n.w / 2;
    return pill(cx - 80, n.y + 80, 160, L.connected, 'pill--ok') + pill(cx - 80, n.y + 80, 160, L.cantConnect, 'pill--down');
  }

  /* ---------------- SVG ---------------- */
  function markup() {
    const g = N.gtm;
    const ib = N.infoblox;

    const links = Object.entries(PATHS).map(([id, [d, ends, structural]]) => `
      ${structural ? `<path class="track" d="${d}" data-ends="${ends}"/>` : ''}
      <path class="link" d="${d}" pathLength="100" data-el="path:${id}" data-ends="${ends}"/>`).join('');

    const card = `
      <g class="card-req" data-el="card:request" data-node="user">
        <rect x="20" y="182" width="232" height="140" rx="12"/>
        ${text(34, 208, L.requestTitle, 'card-title')}
        ${L.requestLines.map((s, i) => text(34, 236 + i * 23, s, 'card-line mono')).join('')}
      </g>
      <g class="card-req" data-el="card:migrate" data-node="user">
        <rect x="20" y="182" width="232" height="117" rx="12"/>
        ${text(34, 208, L.migrateTitle, 'card-title')}
        ${L.migrateLines.map((s, i) => text(34, 236 + i * 23, s, 'card-line mono')).join('')}
      </g>`;

    const db = `
      <g class="badge" data-el="badge:db">
        ${pill(N.db.x + 25, N.db.y + 56, 110, L.creating, 'pill--creating')}
        ${pill(N.db.x + 20, N.db.y + 56, 120, L.migrating, 'pill--migrating')}
        ${pill(N.db.x + 25, N.db.y + 56, 110, L.migrated, 'pill--migrated')}
        ${pill(N.db.x + 25, N.db.y + 56, 110, L.created, 'pill--created')}
      </g>`;

    const kafka = `
      <g class="kafka-lanes">
        ${[0, 1, 2, 3, 4].map((i) => `<rect x="${N.kafka.x + 22 + i * 36}" y="${N.kafka.y + 88}" width="30" height="26" rx="5"/>`).join('')}
      </g>
      <g class="chip" data-el="kafka:msg">${pill(N.kafka.x + 130, N.kafka.y + 87, 80, L.queued, 'pill--msg')}</g>`;

    const auto = `<g class="chip" data-el="flash:parse">
        ${pill(N.auto.x + 25, N.auto.y + 86, 170, L.parse, 'pill--parse pill--parse-create')}
        ${pill(N.auto.x + 20, N.auto.y + 86, 180, L.parseMigrate, 'pill--parse pill--parse-migrate')}
      </g>`;

    const diamond = `
      <g class="diamond" data-el="diamond" data-node="infoblox">
        <polygon points="910,207 948,245 910,283 872,245"/>
        ${text(910, 253, '?', 'd-q', 'middle')}
        ${text(910, 252, L.answerCreate, 'd-create', 'middle')}
        ${text(910, 252, L.answerSkip, 'd-skip', 'middle')}
        ${text(948, 200, L.dnsQuestion, 'd-label')}
      </g>`;

    const record = `
      <g class="record" data-el="record">
        <rect x="${ib.x + 14}" y="${ib.y + 84}" width="${ib.w - 28}" height="74" rx="10"/>
        ${text(ib.x + 28, ib.y + 112, '{fqdn}', 'rec-line mono')}
        ${text(ib.x + 28, ib.y + 140, L.currentTarget, 'rec-line mono rec-old')}
        ${text(ib.x + 28, ib.y + 140, L.newTarget, 'rec-line mono rec-new')}
        ${text(ib.x + 28, ib.y + 140, L.aPrimary, 'rec-line mono rec-a1')}
        ${text(ib.x + 28, ib.y + 140, L.aSecondary, 'rec-line mono rec-a2')}
        <g class="rec-lock">
          <rect x="${ib.x + 206}" y="${ib.y + 100}" width="20" height="16" rx="3"/>
          <path d="M${ib.x + 210} ${ib.y + 100} v-5 a6 6 0 0 1 12 0 v5"/>
        </g>
        ${text(ib.x + ib.w - 16, ib.y + 78, L.leftAsIs, 'rec-tag rec-tag--left', 'end')}
        ${text(ib.x + ib.w - 16, ib.y + 78, L.unchanged, 'rec-tag rec-tag--unchanged', 'end')}
        ${text(ib.x + ib.w - 16, ib.y + 78, L.changed, 'rec-tag rec-tag--changed', 'end')}
        ${text(ib.x + ib.w - 16, ib.y + 78, L.migratedTag, 'rec-tag rec-tag--migrated', 'end')}
      </g>`;

    const migrate = `
      <g class="migrate" data-el="migrate">
        <path class="migrate-line" d="M1040 445 H1060 V250"/>
        ${text(1052, 300, L.laterMigrate, 'migrate-label', 'end')}
      </g>`;

    const gtmInner = `
      <g class="gtm-obj" data-el="gtm:wideip" style="--i:4">
        <rect class="obj-box obj-box--wideip" x="${g.x + 20}" y="100" width="260" height="56" rx="10"/>
        ${text(g.x + 32, 122, L.wideIp, 'obj-label')}
        ${text(g.x + 32, 146, '{wideIp}', 'obj-value mono')}
      </g>
      <g class="gtm-obj" data-el="gtm:pool" style="--i:1">
        <rect class="obj-box obj-box--pool" x="${g.x + 20}" y="172" width="260" height="214" rx="12"/>
        ${text(g.x + 32, 194, L.pool, 'obj-label')}
        <g class="toggle" data-el="toggle">
          <rect x="${g.x + 216}" y="178" width="50" height="24" rx="12"/>
          <circle class="toggle__knob" cx="${g.x + 229}" cy="190" r="8"/>
        </g>
      </g>
      <g class="gtm-obj member" data-el="gtm:m1" style="--i:2">
        <rect class="obj-box member-box" x="${g.x + 32}" y="205" width="236" height="80" rx="10"/>
        ${text(g.x + 46, 237, '{primary.label}', 'member-label')}
        ${statusPills(g.x + 200, 248)}
      </g>
      <g class="gtm-obj member" data-el="gtm:m2" style="--i:3">
        <rect class="obj-box member-box" x="${g.x + 32}" y="295" width="236" height="80" rx="10"/>
        ${text(g.x + 46, 327, '{secondary.label}', 'member-label')}
        ${statusPills(g.x + 200, 338)}
      </g>
      <g class="gtm-obj" data-el="gtm:vs" style="--i:0">
        <rect class="obj-box" x="${g.x + 20}" y="400" width="260" height="104" rx="12"/>
        ${text(g.x + 32, 424, L.virtualServers, 'obj-label')}
        <rect class="vs-box" x="${g.x + 32}" y="438" width="110" height="52" rx="8"/>
        <rect class="vs-box" x="${g.x + 158}" y="438" width="110" height="52" rx="8"/>
        ${text(g.x + 87, 470, L.vs1, 'vs-label', 'middle')}
        ${text(g.x + 213, 470, L.vs2, 'vs-label', 'middle')}
      </g>`;

    const lookup = `
      <g class="bubble" data-el="bubble" data-node="client">
        <rect x="20" y="500" width="262" height="38" rx="19"/>
        ${text(36, 525, L.typed, 'bubble-text mono')}
      </g>
      <g class="redirect" data-el="redirect">${text(835, 680, L.redirect, 'redirect-text', 'middle')}</g>
      <g class="pick" data-el="pick:m1">
        <rect x="${g.x + 26}" y="199" width="248" height="92" rx="13"/>
        ${text(g.x + 262, 223, L.chosen, 'pick-text', 'end')}
      </g>
      <g class="pick" data-el="pick:m2">
        <rect x="${g.x + 26}" y="289" width="248" height="92" rx="13"/>
        ${text(g.x + 262, 313, L.chosen, 'pick-text', 'end')}
      </g>
      <g class="wait" data-el="wait">
        <rect class="wait-box" x="530" y="330" width="240" height="130" rx="12"/>
        <g class="wait-min">
          ${text(546, 360, L.waitMinutesTitle, 'wait-title')}
          <rect class="wait-track" x="546" y="380" width="208" height="12" rx="6"/>
          <rect class="wait-fill" x="546" y="380" width="208" height="12" rx="6"/>
          ${text(546, 430, L.waitMinutesValue, 'wait-value wait-value--bad')}
        </g>
        <g class="wait-sec">
          ${text(546, 366, L.waitSecondsTitle, 'wait-title')}
          ${text(546, 428, L.waitSecondsValue, 'wait-value wait-value--good wait-value--big')}
        </g>
      </g>`;

    const legend = `
      <g class="legend" data-el="legend">
        ${text(540, 372, L.statusLegend, 'legend-title')}
        ${[['creating', 'creating'], ['created', 'created'], ['failed', 'failed']].map(([k, c], i) => `
          <circle class="legend-dot legend-dot--${c}" cx="552" cy="${396 + i * 28}" r="8"/>
          ${text(568, 402 + i * 28, L[k], 'legend-text')}`).join('')}
      </g>`;

    return `
      <svg class="dr-diagram" viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Architecture: server team, ${t('{gateway}')}, message queue, DR automation, DNS, traffic manager and servers">
        <g class="links">${links}</g>
        ${nodeShell('user')}
        ${nodeShell('gateway')}
        ${nodeShell('db', db)}
        ${nodeShell('kafka', kafka)}
        ${nodeShell('auto', auto)}
        ${nodeShell('infoblox', record)}
        ${nodeShell('gtm', gtmInner)}
        ${nodeShell('primary', serverExtras('primary'))}
        ${nodeShell('secondary', serverExtras('secondary'))}
        ${nodeShell('client', clientExtras())}
        ${nodeShell('resolver')}
        ${card}
        ${diamond}
        ${migrate}
        ${legend}
        ${lookup}
        <g class="packet" aria-hidden="true">
          <rect x="0" y="-17" height="34" rx="17"/>
          <text class="packet-text" x="0" y="6" text-anchor="middle"></text>
        </g>
      </svg>`;
  }

  /** Build the diagram into a slot. mode: 'overview' | 'pinned'. */
  function build(slot, mode) {
    slot.innerHTML = markup();
    const svg = slot.querySelector('svg');
    svg.classList.add(`mode-${mode}`);
    return svg;
  }

  /* ---------------- State rendering ---------------- */

  function applyState(svg, state, focus) {
    svg.querySelectorAll('[data-el]').forEach((el) => {
      const s = state[el.dataset.el] || '';
      if (el.getAttribute('data-state') !== s) el.setAttribute('data-state', s);
    });
    const dim = (ends) => !!focus && ends.some((e) => !focus.includes(e));
    svg.querySelectorAll('[data-node]').forEach((n) => n.classList.toggle('is-dim', dim([n.dataset.node])));
    svg.querySelectorAll('[data-ends]').forEach((p) => p.classList.toggle('is-dim', dim(p.dataset.ends.split(' '))));
  }

  /* ---------------- Packet ---------------- */

  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

  function setPacketLabel(pk, label) {
    const txt = pk.querySelector('text');
    const box = pk.querySelector('rect');
    txt.textContent = DR.fmtText(label || '');
    const w = Math.max(60, txt.getComputedTextLength() + 34);
    box.setAttribute('x', -w / 2);
    box.setAttribute('width', w);
  }

  function placePacket(svg, hold) {
    const pk = svg.querySelector('.packet');
    if (!hold) { pk.classList.remove('is-on'); return; }
    const path = svg.querySelector(`[data-el="path:${hold.path}"]`);
    if (!path) { pk.classList.remove('is-on'); return; }
    const p = path.getPointAtLength(hold.at ? path.getTotalLength() : 0);
    setPacketLabel(pk, hold.label);
    pk.dataset.kind = hold.kind || '';
    pk.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    pk.classList.add('is-on');
  }

  /** Move the packet along each hop's path in turn, then onDone(). Cancelled by a newer token. */
  function playHops(svg, hops, token, dur, onDone) {
    const pk = svg.querySelector('.packet');
    let i = 0;

    const nextHop = () => {
      if (svg.__token !== token) return;
      if (i >= hops.length) { onDone(); return; }
      const hop = hops[i++];
      const path = svg.querySelector(`[data-el="path:${hop.path}"]`);
      if (!path) { console.warn('[DR] unknown path', hop.path); nextHop(); return; }
      const len = path.getTotalLength();
      const from = hop.reverse ? len : 0;
      const to = hop.reverse ? 0 : len;
      if (hop.draw !== false) path.setAttribute('data-state', 'drawn'); // line draws behind the packet
      setPacketLabel(pk, hop.label);
      pk.dataset.kind = hop.kind || '';
      pk.classList.add('is-on');
      const start = performance.now();
      const frame = (now) => {
        if (svg.__token !== token) return;
        const k = Math.min(1, (now - start) / dur);
        const p = path.getPointAtLength(from + (to - from) * ease(k));
        pk.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        if (k < 1) requestAnimationFrame(frame); else nextHop();
      };
      requestAnimationFrame(frame);
    };
    nextHop();
  }

  /** Where the packet rests once a beat has finished (null = hidden). */
  function restOf(packet) {
    if (!packet) return null;
    if (packet.hold) return packet.hold;
    const hops = packet.hops || [];
    const last = hops[hops.length - 1];
    if (packet.stay && last) return { path: last.path, at: last.reverse ? 0 : 1, label: last.label, kind: last.kind };
    return null;
  }

  /**
   * Render a beat into a pinned window. Called by story.js.
   * state = final state; opts.pre = state before this beat's packet lands.
   */
  function apply(win, state, opts) {
    const svg = win.querySelector('svg.dr-diagram');
    if (!svg) return;
    const token = (svg.__token || 0) + 1;
    svg.__token = token;
    const packet = opts.packet;
    const hops = (packet && packet.hops) || [];
    const rest = restOf(packet);

    if (opts.animate && hops.length) {
      applyState(svg, opts.pre || state, opts.focus);
      playHops(svg, hops, token, opts.hopMs || CONFIG.timing.hopMs, () => {
        applyState(svg, state, opts.focus);
        if (rest) placePacket(svg, rest);
        else setTimeout(() => { if (svg.__token === token) placePacket(svg, null); }, 450);
      });
    } else {
      applyState(svg, state, opts.focus);
      placePacket(svg, rest);
    }
  }

  /* ---------------- Boot ---------------- */
  document.documentElement.style.setProperty('--hop', `${CONFIG.timing.hopMs}ms`);
  document.documentElement.style.setProperty('--stagger', `${CONFIG.timing.buildStaggerMs}ms`);

  const overviewSlot = document.querySelector('[data-diagram="overview"]');
  if (overviewSlot) {
    const svg = build(overviewSlot, 'overview');
    applyState(svg, (DR.OVERVIEW && DR.OVERVIEW.set) || {}, null);
  }
  // Pinned windows are built by story.js (one per pinned section).

  DR.diagram = { apply, build, applyState };
})();
