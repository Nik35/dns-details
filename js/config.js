/* =====================================================================
   CONFIG — every name, IP, label, page text and timing lives here.
   Edit freely; no animation code reads hard-coded text.

   Tokens: any string (here or in beats.js) may contain {path} tokens,
   e.g. {fqdn}, {wideIp}, {gateway}, {primary.ip}. They are replaced
   with the matching value from this object at render time.
   Backticks mark identifiers: `app.example.com` renders in monospace.
   ===================================================================== */
window.DR = window.DR || {};

DR.CONFIG = {
  /* ---- Placeholder names (documentation-safe values only) ---- */
  gateway: 'ABCD Gateway',
  fqdn: 'app.example.com',
  wideIp: 'app.gslb.example.com',
  primary:   { label: 'Primary DC',   ip: '192.0.2.10' },
  secondary: { label: 'Secondary DC', ip: '198.51.100.10' },

  bigIdea: 'We put the GTM in charge of failover, so switching servers takes seconds — and DNS never has to change again.',

  /* ---- Diagram labels: [main label, sub label] ---- */
  nodes: {
    user:      ['Server team', 'Asks for DR'],
    gateway:   ['{gateway}', 'Front-door APIs'],
    db:        ['Gateway DB', ''],
    kafka:     ['Message queue', 'Kafka topic'],
    auto:      ['DR Automation', 'Our app'],
    infoblox:  ['DNS', 'Infoblox'],
    gtm:       ['Traffic manager', 'F5 GTM'],
    primary:   ['{primary.label}', '{primary.ip}'],
    secondary: ['{secondary.label}', '{secondary.ip}'],
    client:    ['Someone’s laptop', 'Opens the app'],
    resolver:  ['DNS resolver', 'Asks on their behalf'],
  },
  labels: {
    wideIp: 'Wide IP',
    pool: 'Pool',
    virtualServers: 'Virtual servers',
    vs1: 'VS 1',
    vs2: 'VS 2',
    active: 'Active',
    standby: 'Standby',
    creating: 'creating',
    created: 'created',
    failed: 'failed',
    statusLegend: 'Request status',
    requestTitle: 'DR request',
    requestLines: ['action: create', '{fqdn}', 'primary {primary.ip}', 'secondary {secondary.ip}'],
    migrateTitle: 'Migrate request',
    migrateLines: ['action: migrate', '{fqdn}', '→ {wideIp}'],
    parseMigrate: 'action → migrate',
    migrating: 'migrating',
    migrated: 'migrated',
    migratedTag: 'Migrated',
    parse: 'action → create',
    queued: 'create',
    dnsQuestion: 'Create CNAME?',
    answerCreate: 'Yes',   // new application: name not in DNS yet
    answerSkip: 'No',      // existing name: leave the record as-is
    currentTarget: '→ current server',
    newTarget: '→ {wideIp}',
    leftAsIs: 'Left as-is',
    laterMigrate: 'later: migrate',
    // DNS lookup (How it works Part C + Request journey)
    typed: 'typed: {fqdn}',
    redirect: '↪ redirected to the traffic manager',
    chosen: 'chosen',
    down: 'Down',
    connected: 'Connected',
    cantConnect: 'Can’t connect',
    aPrimary: 'A → {primary.ip}',
    aSecondary: 'A → {secondary.ip}',
    unchanged: 'Unchanged',
    changed: 'Changed',
    waitMinutesTitle: 'Waiting for DNS to spread',
    waitMinutesValue: '10–20 min, maybe more',
    waitSecondsTitle: 'Switched over in',
    waitSecondsValue: 'seconds',
  },

  /* ---- Pinned sections ---- */
  // Each pinned section: its beats live in beats.js (BEATS / JOURNEY).
  pins: {
    'how-it-works': {
      kicker: 'How it works',
      scenarios: { new: 'New application', existing: 'Existing name' },
      defaultScenario: 'new',
    },
    'request-journey': {
      kicker: 'Request journey',
      scenarios: { today: 'Today (DNS only)', gtm: 'With GTM' },
      defaultScenario: 'today',
      hopMs: 1800,            // slower packet travel in this section
      stateMs: 1200,          // slower fades / colour changes (switch flip, server down…)
    },
  },
  parts: {
    A: 'Building it',
    B: 'Connecting the name',
    C: 'Following a lookup',
    M: 'Migrating the name',
    D: 'Wrap-up',
    J1: 'Finding the app',
    J2: 'Disaster',
    J3: 'Failover',
  },
  showTechByDefault: false,   // technical layer hidden until T is pressed

  /* ---- Look & timing ---- */
  theme: 'dark',              // 'dark' | 'light'
  beatHeightVh: 80,           // scroll distance per beat, in viewport heights
  timing: {
    hopMs: 1000,              // packet travel time per hop (0.8–1.2s recommended)
    buildStaggerMs: 350,      // delay between GTM objects appearing in beat 6
    navSettleMs: 1500,        // safety timeout for keyboard navigation
    problemSeconds: 14,       // length of the "DNS propagation" animation…
    problemMinutes: 20,       // …and the real-world minutes it represents
  },

  /* ---- Page text (sections outside the pinned window) ---- */
  text: {
    problem: {
      kicker: 'Today',
      heading: 'Failover waits on DNS',
      body: 'Every application has a primary and a secondary server. To fail over, we change the DNS record in Infoblox to point at the secondary — and then we wait.',
      wait: '10–20 minutes, sometimes longer, for the change to spread across DNS.',
      callout: 'Waiting = risk. In a real disaster, every minute is downtime — and we can’t predict how many.',
      anim: {
        recordLabel: 'DNS record for `{fqdn}`',
        before: '→ {primary.label} · {primary.ip}',
        after: '→ {secondary.label} · {secondary.ip}',
        changed: 'Changed in Infoblox',
        cachesLabel: 'DNS caches around the network',
        cacheName: 'Cache',
        caches: 10,
        oldAnswer: '✕ {primary.label}',
        newAnswer: '✓ {secondary.label}',
        clockLabel: 'Time since the change',
        speedNote: 'Sped up: {timing.problemSeconds} seconds here ≈ {timing.problemMinutes} minutes in real life',
        stillOld: '{n} of {total} caches still send users to the failed server',
        done: 'All caches updated — after ~{timing.problemMinutes} minutes of risk',
        replay: 'Replay',
      },
    },
    bigIdea: {
      kicker: 'The big idea',
      before: { label: 'Today',    value: '10–20 minutes', sub: 'change DNS, then wait' },
      after:  { label: 'With GTM', value: 'Seconds',       sub: 'flip the active server' },
      raceTitle: 'Time until users reach the secondary',
      raceToday: 'Today',
      raceGtm: 'With GTM',
      raceTodayEnd: '10–20 min+',
      raceGtmEnd: 'seconds',
    },
    overview: {
      kicker: 'The map',
      heading: 'All the moving parts',
      body: 'Here is everything involved. Next, we’ll follow a single request through it, one step at a time.',
    },
    howItWorks: {
      kicker: 'How it works',
      techTag: 'TECH',
    },
  },
};
