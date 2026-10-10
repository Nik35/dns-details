/* =====================================================================
   BEATS — the pinned "How it works" story, one entry per scroll step.
   Reword, add or remove beats here; animation code is generic.

   Fields
     id         stable slug (shown in debug / used by CSS hooks)
     part       'A' | 'B' | 'C' | 'D'  (labels in CONFIG.parts)
     caption    plain-language caption (always visible)
     techLine   technical detail (shown when the TECH layer is on)
     note       optional small note shown in the diagram corner
     focus      null = all nodes normal; array of node ids = dim the rest
     only       optional ['scenario', …] — beat exists only in those scenarios
     set        { 'element-key': 'state' } — CHANGES at this beat.
                The state of beat N = all `set`s from beat 1..N merged,
                so it is a pure function of (beat, scenario).
     packet     optional query-packet hop for this beat (Phase 5)
     scenarios  optional { new: {...}, existing: {...} } overrides of any
                field above (`set` is merged on top of the base `set`).

   Tokens like {fqdn} come from CONFIG; `backticks` render as code.
   (`set` / `focus` / `packet` are filled in during Phases 3–5.)
   ===================================================================== */
window.DR = window.DR || {};

(() => {
  const AFTER_MIGRATE = 'Existing name — now migrated, so lookups follow the same path.';
  // Parts A/B: the end-user DNS path is not involved yet, so it is dimmed.
  const CONTROL = ['user', 'gateway', 'db', 'kafka', 'auto', 'infoblox', 'gtm', 'primary', 'secondary'];
  // Part C: only the end-user DNS path is in focus.
  const DNS_FOCUS = ['client', 'resolver', 'infoblox', 'gtm', 'primary', 'secondary'];

  /* The static architecture map (section 4) uses this state. */
  DR.OVERVIEW = {
    set: {
      'path:user-gw': 'drawn', 'path:gw-db': 'drawn', 'path:gw-kafka': 'drawn',
      'path:kafka-auto': 'drawn', 'path:auto-ib': 'drawn', 'path:auto-gtm': 'drawn',
      'path:m1-srv': 'drawn', 'path:m2-srv': 'drawn',
      'path:client-res': 'drawn', 'path:res-ib': 'drawn', 'path:res-gtm': 'drawn',
      'gtm:vs': 'built', 'gtm:pool': 'built', 'gtm:wideip': 'built',
      'gtm:m1': 'active', 'gtm:m2': 'standby',
      'node:primary': 'active', 'node:secondary': 'standby',
    },
  };

  DR.BEATS = [
    /* ---------- Part A — Building it ---------- */
    {
      id: 'request',
      part: 'A',
      caption: 'A server team asks for DR protection for their application.',
      techLine: '`POST` create action on {gateway} with FQDN, primary & secondary server details.',
      focus: CONTROL,
      set: { 'node:user': 'lit', 'card:request': 'shown', 'path:user-gw': 'drawn', 'node:gateway': 'lit' },
      packet: { hops: [{ path: 'user-gw', label: 'create' }] },
      scenarios: { existing: { set: { record: 'old' } } },
    },
    {
      id: 'log',
      part: 'A',
      caption: 'The gateway logs the request.',
      techLine: 'Gateway persists the request in MongoDB with status `creating` — the desired state.',
      focus: CONTROL,
      set: { 'node:user': '', 'card:request': '', 'path:gw-db': 'drawn', 'node:db': 'lit', 'badge:db': 'creating', legend: 'shown' },
      packet: { hops: [{ path: 'gw-db', label: 'creating' }] },
    },
    {
      id: 'queue',
      part: 'A',
      caption: 'The request is passed along a message queue.',
      techLine: 'Gateway produces a message to the Kafka topic; `action: create`.',
      focus: CONTROL,
      set: { 'node:db': '', 'path:gw-kafka': 'drawn', 'node:kafka': 'lit', 'kafka:msg': 'shown' },
      packet: { hops: [{ path: 'gw-kafka', label: 'action: create' }] },
    },
    {
      id: 'consume',
      part: 'A',
      caption: 'Our automation picks it up and reads what’s needed.',
      techLine: 'Consumer reads the message, parses the `action` attribute, dispatches to the internal create API.',
      focus: CONTROL,
      set: { 'node:gateway': '', 'node:kafka': '', 'kafka:msg': '', 'path:kafka-auto': 'drawn', 'node:auto': 'lit', 'flash:parse': 'shown' },
      packet: { hops: [{ path: 'kafka-auto', label: 'action: create' }] },
    },
    {
      id: 'dns-check',
      part: 'A',
      caption: 'First, we check whether this name already exists in DNS.',
      techLine: 'Lookup in Infoblox for an existing CNAME on `{fqdn}`.',
      focus: CONTROL,
      set: { 'flash:parse': '', 'path:auto-ib': 'drawn', diamond: 'asking', 'node:infoblox': 'lit' },
      packet: { hops: [{ path: 'auto-ib', label: '{fqdn} ?' }] },
    },
    {
      id: 'build-gtm',
      part: 'A',
      caption: 'We build the traffic manager setup: two servers, one active, one on standby.',
      techLine: 'Create virtual servers, pool, pool members (port 0; primary enabled, secondary disabled) and the wide IP `{wideIp}`. No GTM health monitor — servers are already covered by our monitoring; failover is a deliberate switch.',
      focus: CONTROL,
      set: {
        'node:infoblox': '', 'path:auto-gtm': 'drawn', 'node:gtm': 'lit',
        'gtm:vs': 'built', 'gtm:pool': 'built', 'gtm:m1': 'active', 'gtm:m2': 'standby', 'gtm:wideip': 'built',
        'path:m1-srv': 'drawn', 'path:m2-srv': 'drawn', 'node:primary': 'active', 'node:secondary': 'standby',
      },
      packet: { hops: [{ path: 'auto-gtm', label: 'build' }] },
    },

    /* ---------- Part B — The Infoblox branch ---------- */
    {
      id: 'branch',
      part: 'B',
      hotSwitch: true,
      caption: '',
      techLine: '',
      focus: CONTROL,
      set: { 'node:gtm': '' },
      scenarios: {
        new: {
          caption: 'The name is new, so we create it and point it at the traffic manager.',
          techLine: 'CNAME absent → create CNAME `{fqdn}` → `{wideIp}`.',
          set: { diamond: 'create', record: 'new', 'path:ib-gtm': 'drawn', 'node:infoblox': 'lit', 'gtm:wideip': 'linked' },
          packet: { hops: [{ path: 'ib-gtm', label: 'CNAME' }] },
        },
        existing: {
          caption: 'The name already exists, so we leave it untouched for now — switching it over is a separate, deliberate step.',
          techLine: 'CNAME present → no Infoblox change on create. A separate `migrate` action later points the CNAME at the wide IP.',
          set: { diamond: 'skip', record: 'old-locked', migrate: 'shown', 'node:infoblox': 'lit' },
        },
      },
    },
    {
      id: 'report',
      part: 'B',
      caption: 'Our automation reports back exactly what it did.',
      techLine: 'Patch realized state (`success` / `failed`) to the gateway DB — desired vs realized state, the same pattern cloud control planes use.',
      focus: CONTROL,
      set: { 'node:infoblox': '', 'node:gtm': '', 'path:auto-db': 'drawn', 'badge:db': 'created', 'node:db': 'lit' },
      packet: { hops: [{ path: 'auto-db', label: 'success' }] },
    },

    /* ---------- Migrate (Existing name only) ---------- */
    {
      id: 'migrate-request',
      part: 'M',
      only: ['existing'],
      caption: 'Later, the team submits a separate migrate request for the existing name.',
      techLine: '`POST` migrate action on {gateway} for `{fqdn}` — a deliberate, scheduled change. Logged with status `migrating`.',
      focus: CONTROL,
      set: { 'node:db': '', 'node:auto': '', 'node:user': 'lit', 'card:migrate': 'shown' },
      packet: { hops: [{ path: 'user-gw', label: 'migrate' }, { path: 'gw-db', label: 'migrating' }] },
      after: { 'node:gateway': 'lit', 'node:db': 'lit', 'badge:db': 'migrating' },
    },
    {
      id: 'migrate-queue',
      part: 'M',
      only: ['existing'],
      caption: 'It travels the same path: queued, then picked up by our automation.',
      techLine: 'Gateway produces `action: migrate` to the Kafka topic; the consumer parses it and dispatches to the internal migrate API.',
      focus: CONTROL,
      set: { 'card:migrate': '', 'node:user': '', 'node:gateway': '', 'node:db': '' },
      packet: { hops: [{ path: 'gw-kafka', label: 'action: migrate' }, { path: 'kafka-auto', label: 'action: migrate' }] },
      after: { 'node:auto': 'lit', 'flash:parse': 'migrate' },
    },
    {
      id: 'migrate-dns',
      part: 'M',
      only: ['existing'],
      caption: 'Our automation points the existing name at the traffic manager.',
      techLine: 'Update CNAME `{fqdn}` → `{wideIp}` in Infoblox. This is the only DNS change — from now on, failover never touches DNS.',
      focus: CONTROL,
      set: { 'flash:parse': '', diamond: '', migrate: '' },
      packet: { hops: [{ path: 'auto-ib', label: 'CNAME → {wideIp}' }] },
      after: { record: 'migrated', 'path:ib-gtm': 'drawn', 'gtm:wideip': 'linked', 'node:infoblox': 'lit' },
    },
    {
      id: 'migrate-report',
      part: 'M',
      only: ['existing'],
      caption: 'And reports back: migrated.',
      techLine: 'Patch realized state `migrated` to the gateway DB — desired vs realized state again.',
      focus: CONTROL,
      set: { 'node:infoblox': '', 'node:auto': 'lit' },
      packet: { hops: [{ path: 'auto-db', label: 'success' }] },
      after: { 'badge:db': 'migrated', 'node:db': 'lit' },
    },

    /* ---------- Part C — DNS resolution & redirection ---------- */
    {
      id: 'type-name',
      part: 'C',
      caption: 'Now, someone opens the application by its name.',
      techLine: 'Client issues a DNS query for `{fqdn}`.',
      focus: DNS_FOCUS,
      set: {
        'node:db': '', 'node:auto': '', 'node:gateway': '', 'node:infoblox': '', legend: '', diamond: '',
        'node:client': 'lit', bubble: 'shown',
      },
      scenarios: {
        existing: {
          note: AFTER_MIGRATE,
          set: { record: 'migrated', migrate: '', 'path:ib-gtm': 'drawn', 'gtm:wideip': 'linked' },
        },
      },
    },
    {
      id: 'ask-dns',
      part: 'C',
      caption: 'Their computer asks DNS: where is this?',
      techLine: 'Recursive resolver queries the authoritative DNS (Infoblox).',
      focus: DNS_FOCUS,
      set: { bubble: '', 'node:resolver': 'lit' },
      packet: { hops: [{ path: 'client-res', label: '{fqdn} ?' }, { path: 'res-ib', label: '{fqdn} ?' }], stay: true },
      after: { 'path:client-res': 'drawn', 'path:res-ib': 'drawn', 'node:infoblox': 'lit' },
      scenarios: { existing: { note: AFTER_MIGRATE } },
    },
    {
      id: 'redirect',
      part: 'C',
      caption: 'DNS says: this name is actually handled by the traffic manager — go ask it.',
      techLine: 'Infoblox returns CNAME → `{wideIp}`. The resolver follows it: the GSLB zone is delegated to the GTM, so the next query goes there.',
      focus: DNS_FOCUS,
      set: {},
      packet: {
        hops: [
          { path: 'ib-res', label: 'CNAME → {wideIp}', kind: 'answer' },
          { path: 'res-gtm', label: '{wideIp} ?', kind: 'redirect' },
        ],
        stay: true,
      },
      after: { 'path:ib-res': 'drawn', 'path:res-gtm': 'drawn', redirect: 'shown', 'node:gtm': 'lit' },
      scenarios: { existing: { note: AFTER_MIGRATE } },
    },
    {
      id: 'pick-active',
      part: 'C',
      caption: 'The traffic manager checks which server is currently active.',
      techLine: 'GTM evaluates the wide IP’s pool and selects the enabled (active) member.',
      focus: ['client', 'resolver', 'gtm', 'primary', 'secondary'],
      set: { 'node:infoblox': '' },
      packet: { hops: [{ path: 'gtm-in1', label: '{wideIp} ?', draw: false }] },
      after: { 'pick:m1': 'shown' },
      scenarios: { existing: { note: AFTER_MIGRATE } },
    },
    {
      id: 'connect',
      part: 'C',
      caption: 'It answers with the active server’s address, and the user is connected.',
      techLine: 'GTM returns an A record `{primary.ip}` via the resolver; the client connects to the primary.',
      focus: ['client', 'resolver', 'gtm', 'primary', 'secondary'],
      set: {},
      packet: {
        hops: [
          { path: 'gtm-res', label: 'A {primary.ip}', kind: 'answer' },
          { path: 'res-client', label: 'A {primary.ip}', kind: 'answer' },
        ],
      },
      after: { 'path:gtm-res': 'drawn', 'path:res-client': 'drawn', 'path:client-primary': 'drawn', 'node:client': 'ok' },
      scenarios: { existing: { note: AFTER_MIGRATE } },
    },

    /* ---------- Part D — Closing beat ---------- */
    {
      id: 'recap',
      part: 'D',
      caption: 'That’s the whole journey. Next: we’ll do it live.',
      techLine: 'Failover = `patch` action toggling which pool member is enabled; shown in the live API demo.',
      callout: 'To fail over, we just flip which server is active — the DNS name never changes.',
      focus: DNS_FOCUS,
      set: { toggle: 'ghost' },
    },
  ];

  /* =====================================================================
     JOURNEY — "Request journey" section: the same lookup, Today vs With GTM,
     then a disaster and the failover. Switch values: 'today' | 'gtm'.
     ===================================================================== */
  const J_TODAY = ['client', 'resolver', 'infoblox', 'primary', 'secondary'];
  const J_GTM = [...J_TODAY, 'gtm'];

  /** Build a journey beat: shared fields + per-scenario overrides (focus added automatically). */
  const j = (beat, today = {}, gtm = {}) => ({
    ...beat,
    scenarios: {
      today: { focus: J_TODAY, ...today },
      gtm: { focus: J_GTM, ...gtm },
    },
  });

  DR.JOURNEY = [
    j({
      id: 'j-type',
      part: 'J1',
      caption: 'Someone opens the application by its name.',
      techLine: 'Client issues a DNS query for `{fqdn}`.',
      set: { 'node:client': 'lit', bubble: 'shown', 'node:primary': 'active', 'node:secondary': 'standby' },
      hotSwitch: true,
    }, {
      set: { record: 'a-primary' },
    }, {
      set: {
        record: 'new', 'path:ib-gtm': 'drawn', toggle: 'on',
        'gtm:vs': 'built', 'gtm:pool': 'built', 'gtm:m1': 'active', 'gtm:m2': 'standby', 'gtm:wideip': 'linked',
        'path:m1-srv': 'drawn', 'path:m2-srv': 'drawn',
      },
    }),
    j({
      id: 'j-ask',
      part: 'J1',
      caption: 'Their computer asks DNS: where is this?',
      techLine: 'Recursive resolver queries the authoritative DNS (Infoblox) for `{fqdn}`.',
      set: { bubble: '', 'node:resolver': 'lit' },
      packet: { hops: [{ path: 'client-res', label: '{fqdn} ?' }, { path: 'res-ib', label: '{fqdn} ?' }], stay: true },
      after: { 'path:client-res': 'drawn', 'path:res-ib': 'drawn', 'node:infoblox': 'lit' },
    }),
    j({
      id: 'j-answer',
      part: 'J1',
      hotSwitch: true,
    }, {
      caption: 'Today: DNS answers straight away with the server’s address.',
      techLine: 'Infoblox returns an A record `{primary.ip}` — the server is hard-wired into DNS.',
      packet: { hops: [{ path: 'ib-res', label: 'A {primary.ip}', kind: 'answer' }], stay: true },
      after: { 'path:ib-res': 'drawn' },
    }, {
      caption: 'With GTM: DNS says “ask the traffic manager” and redirects the question.',
      techLine: 'Infoblox returns CNAME → `{wideIp}`; the GSLB zone is delegated to the GTM, so the resolver asks it next.',
      packet: {
        hops: [
          { path: 'ib-res', label: 'CNAME → {wideIp}', kind: 'answer' },
          { path: 'res-gtm', label: '{wideIp} ?', kind: 'redirect' },
        ],
        stay: true,
      },
      after: { 'path:ib-res': 'drawn', 'path:res-gtm': 'drawn', redirect: 'shown', 'node:gtm': 'lit' },
    }),
    j({
      id: 'j-decide',
      part: 'J1',
    }, {
      caption: 'Nobody else is involved: whatever DNS says is final.',
      techLine: 'No traffic-management layer — the A record alone decides the server.',
      packet: { hold: { path: 'ib-res', at: 1, label: 'A {primary.ip}', kind: 'answer' } },
    }, {
      caption: 'The traffic manager checks which server is active and picks it.',
      techLine: 'GTM evaluates the wide IP’s pool and selects the enabled member (`{primary.label}`).',
      packet: { hops: [{ path: 'gtm-in1', label: '{wideIp} ?', draw: false }] },
      after: { 'pick:m1': 'shown' },
    }),
    j({
      id: 'j-connect',
      part: 'J1',
      caption: 'They get the primary’s address and connect.',
      after: { 'path:res-client': 'drawn', 'path:client-primary': 'drawn', 'node:client': 'ok' },
    }, {
      techLine: 'Resolver returns `{primary.ip}` (and caches it for the record’s TTL).',
      packet: { hops: [{ path: 'res-client', label: 'A {primary.ip}', kind: 'answer' }] },
    }, {
      techLine: 'GTM returns an A record `{primary.ip}` with a short TTL; the client connects to the primary.',
      packet: {
        hops: [
          { path: 'gtm-res', label: 'A {primary.ip}', kind: 'answer' },
          { path: 'res-client', label: 'A {primary.ip}', kind: 'answer' },
        ],
      },
      after: { 'path:gtm-res': 'drawn' },
    }),
    j({
      id: 'j-disaster',
      part: 'J2',
      caption: 'Disaster: the primary site goes down. Users can’t connect.',
      set: {
        'node:primary': 'down', 'path:client-primary': 'failing', 'node:client': 'error',
        redirect: '', 'pick:m1': '', 'node:infoblox': '', 'node:gtm': '', 'node:resolver': '',
      },
    }, {
      techLine: '`{primary.ip}` is unreachable; every client holding that address fails.',
    }, {
      techLine: 'No automatic switch: we deliberately run no GTM health monitor — failover is a decision, not a guess.',
    }),
    j({
      id: 'j-failover',
      part: 'J3',
      hotSwitch: true,
    }, {
      caption: 'Today: we change the DNS record — then wait 10–20 minutes for it to spread.',
      techLine: 'Update the A record in Infoblox to `{secondary.ip}`; resolvers keep the old answer until their cache TTL expires.',
      set: { record: 'a-secondary', wait: 'minutes', 'node:infoblox': 'lit' },
    }, {
      caption: 'With GTM: we flip one switch. The secondary is active in seconds — DNS is not touched.',
      techLine: '`patch` action: disable `{primary.label}`, enable `{secondary.label}` in the pool. The CNAME is unchanged.',
      set: {
        'gtm:m1': 'standby', 'gtm:m2': 'active', toggle: 'flipped', record: 'new-locked',
        wait: 'seconds', 'node:secondary': 'active', 'node:gtm': 'lit',
      },
    }),
    j({
      id: 'j-retry',
      part: 'J3',
      set: { 'node:infoblox': '', 'node:gtm': '' },
    }, {
      caption: 'Users try again — but their DNS cache still says “primary”. Still down.',
      techLine: 'The resolver answers from cache (`{primary.ip}`) until the TTL runs out — 10–20 minutes, sometimes longer.',
      packet: {
        hops: [
          { path: 'client-res', label: '{fqdn} ?' },
          { path: 'res-client', label: 'A {primary.ip} (cached)', kind: 'answer' },
        ],
      },
      after: { 'node:client': 'error' },
    }, {
      caption: 'Users try again: same name, same path — and the traffic manager now answers with the secondary.',
      techLine: 'GTM answers carry a short TTL, so resolvers re-ask quickly; GTM now returns `{secondary.ip}`.',
      packet: {
        hopMs: 1200,             // 7 hops — a little quicker than the rest of the section
        hops: [
          { path: 'client-res', label: '{fqdn} ?' },
          { path: 'res-ib', label: '{fqdn} ?' },
          { path: 'ib-res', label: 'CNAME → {wideIp}', kind: 'answer' },
          { path: 'res-gtm', label: '{wideIp} ?', kind: 'redirect' },
          { path: 'gtm-in2', label: '{wideIp} ?', draw: false },
          { path: 'gtm-res', label: 'A {secondary.ip}', kind: 'answer' },
          { path: 'res-client', label: 'A {secondary.ip}', kind: 'answer' },
        ],
      },
      after: { 'pick:m2': 'shown', 'path:client-primary': '', 'path:client-secondary': 'drawn', 'node:client': 'ok' },
    }),
    j({
      id: 'j-recap',
      part: 'J3',
      callout: 'Today: change DNS, then wait 10–20+ minutes. With GTM: flip one switch — seconds, and the DNS name never changes.',
    }, {
      caption: 'Today: recovery depends on every DNS cache out there — not on us.',
      techLine: 'Recovery time ≈ record TTL + propagation across resolvers; unpredictable.',
    }, {
      caption: 'With GTM: one switch, seconds of impact, and the DNS name never changes.',
      techLine: 'Recovery time ≈ one `patch` call + a short GTM TTL. Fully audited via realized state.',
    }),
  ];

  DR.PIN_BEATS = {
    'how-it-works': DR.BEATS,
    'request-journey': DR.JOURNEY,
  };
})();
