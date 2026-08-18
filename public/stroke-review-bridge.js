/* KDBC Stroke Review -> Training Builder bridge */
(function () {
  const TRANSFER_KEY = 'kdbc-stroke-review-transfer-v1';
  const ACTIVE_KEY = 'kdbc-active-session-v2';
  const PLANS_KEY = 'dragonboat-plans';

  function decodeFallback(value) {
    if (!value) return null;
    try {
      let normalized = value.replaceAll('-', '+').replaceAll('_', '/');
      while (normalized.length % 4) normalized += '=';
      const binary = atob(normalized);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  function readTransfer() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'stroke-review' && !params.get('strokeReview')) return null;
    let payload = null;
    try { payload = JSON.parse(window.localStorage.getItem(TRANSFER_KEY) || 'null'); } catch {}
    if (!payload) payload = decodeFallback(params.get('strokeReview'));
    if (!payload || payload.source !== 'kdbc-stroke-review' || !Array.isArray(payload.drills) || !payload.drills.length) return null;
    return payload;
  }

  function preserveCurrentPractice() {
    try {
      const active = JSON.parse(window.localStorage.getItem(ACTIVE_KEY) || 'null');
      if (!active || !Array.isArray(active.blocks) || !active.blocks.length) return;
      const saved = JSON.parse(window.localStorage.getItem(PLANS_KEY) || '[]');
      const title = active.title || `${active.focus || 'Training'} Practice`;
      const backup = {
        ...active,
        id: `stroke-review-backup-${Date.now()}`,
        title: `${title} (before Stroke Review import)`,
        savedAt: new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
      };
      window.localStorage.setItem(PLANS_KEY, JSON.stringify([backup, ...saved].slice(0, 20)));
    } catch {}
  }

  function drillBlock(drill, index, minutes) {
    const cue = Array.isArray(drill.cues) && drill.cues.length ? drill.cues[0] : 'Keep the movement clean';
    const detailParts = [drill.setup, drill.how, drill.dose].filter(Boolean);
    return {
      id: `drill-${index + 1}`,
      name: `Drill ${index + 1}`,
      detail: drill.name,
      minutes,
      icon: '◒',
      objective: drill.useFor || 'Reinforce the selected technical priority.',
      set: detailParts.join(' '),
      cues: [cue]
    };
  }

  function buildImportedPlan(payload) {
    const drills = payload.drills.slice(0, 3);
    const duration = 90;
    const warmUp = 12;
    const drillMinutesTotal = 21;
    const cooldown = 8;
    const mainMinutes = duration - warmUp - drillMinutesTotal - cooldown;
    const baseDrillMinutes = Math.floor(drillMinutesTotal / drills.length);
    const extra = drillMinutesTotal % drills.length;
    const blocks = [
      {
        id: 'warmup',
        name: 'Warm-up',
        detail: 'Activation + boat feel',
        minutes: warmUp,
        icon: '↗',
        objective: 'Raise body temperature, settle the hull, and establish one relaxed crew rhythm before technical work.',
        set: '2 min mobility and posture reset; 4 min easy continuous paddle; 6 min controlled boat-feel work. Keep timing and hull control clean before starting the imported drills.',
        cues: ['Tall posture']
      },
      ...drills.map((drill, index) => drillBlock(drill, index, baseDrillMinutes + (index < extra ? 1 : 0))),
      {
        id: 'main',
        name: 'Main set',
        detail: 'Technical endurance transfer',
        minutes: mainMinutes,
        icon: '⌁',
        objective: 'Transfer the reviewed technical priorities into repeatable crew paddling without losing timing or blade connection.',
        set: '4 × 3 minutes at controlled technical pace with 60 seconds easy between repetitions. Use the first 10 strokes of every repetition to confirm the imported technical cues. Stop or reset if timing, blade depth, or hull control breaks for three strokes.',
        cues: [payload.priorities?.[0]?.cue || drills[0]?.cues?.[0] || 'Technique first']
      },
      {
        id: 'cooldown',
        name: 'Cool-down',
        detail: 'Easy paddle + mobility',
        minutes: cooldown,
        icon: '⌄',
        objective: 'Lower effort gradually and finish with the session’s best technical feeling.',
        set: '6 min easy continuous paddle, then 2 min shoulder, hip, and thoracic mobility at the dock.',
        cues: ['Long and quiet']
      }
    ];

    const priorityNotes = Array.isArray(payload.priorities) && payload.priorities.length
      ? `Stroke Review priorities:\n${payload.priorities.map((item, index) => `${index + 1}. ${item.title} (${item.phase}) — ${item.cue}`).join('\n')}`
      : 'Imported from KDBC Stroke Review practice shortlist.';

    return {
      id: 'active-session',
      title: 'Stroke Review Technique Practice',
      savedAt: new Date().toISOString(),
      sessionDate: new Date().toISOString().slice(0, 10),
      focus: 'Technique',
      duration,
      crew: 'Performance',
      festivalWeeks: 3,
      emphasis: 'Auto',
      variation: 0,
      notes: priorityNotes,
      blocks,
      intervalPlan: {
        unit: 'time',
        work: 180,
        recoverySeconds: 60,
        repetitions: 4,
        targetRate: 58,
        targetRpe: 5,
        paceSecondsPer100m: 52,
        stopCondition: 'Stop the interval when timing, blade depth, or hull control breaks for three strokes.'
      }
    };
  }

  const transfer = readTransfer();
  if (!transfer) return;

  preserveCurrentPractice();
  const imported = buildImportedPlan(transfer);
  window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(imported));
  window.localStorage.setItem('kdbc-stroke-review-import-notice', JSON.stringify({
    importedAt: new Date().toISOString(),
    drills: transfer.drills.slice(0, 3).map(item => item.name)
  }));
  window.localStorage.removeItem(TRANSFER_KEY);

  const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
  window.history.replaceState({}, document.title, cleanUrl);
})();
