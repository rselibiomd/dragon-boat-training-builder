(() => {
  const KEYS = {
    squads: 'kdbc-squads-v1',
    activeSquad: 'kdbc-active-squad-v1',
    sessions: 'kdbc-squad-session-state-v1',
    lineupStatus: 'kdbc-lineup-status-v1',
  };
  const ROSTER_KEY = 'kdbc-boat-roster-v1';
  const DRAFT_KEY = 'kdbc-boat-draft-v1';
  const safeParse = (text, fallback) => { try { return JSON.parse(text ?? '') ?? fallback; } catch { return fallback; } };
  const load = (key, fallback) => safeParse(localStorage.getItem(key), fallback);
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const activeSquadId = () => localStorage.getItem(KEYS.activeSquad) || '';
  const activeSquad = () => load(KEYS.squads, []).find((item) => item.id === activeSquadId()) || null;
  const sessionDescriptor = () => {
    const chip = document.querySelector('.active-session-chip');
    return {
      title: chip?.querySelector('strong')?.textContent?.trim() || 'Current session',
      date: chip?.querySelector('small')?.textContent?.trim() || 'Date not set',
    };
  };
  const sessionKey = () => {
    const { title, date } = sessionDescriptor();
    return `${activeSquadId() || 'no-squad'}::${title}::${date}`;
  };
  const sessionState = () => load(KEYS.sessions, {})[sessionKey()] || { attendance: {}, activated: {} };
  const attendance = (state, id) => state.attendance?.[id] || 'Unconfirmed';
  const capacity = () => Math.max(20, Number(load(DRAFT_KEY, {})?.boatCount || 1) * 20);
  const roster = () => load(ROSTER_KEY, []);

  function ensureWaitlistOptions() {
    document.querySelectorAll('[data-squad-role]').forEach((select) => {
      if (![...select.options].some((option) => option.value === 'Waitlist')) {
        const option = document.createElement('option');
        option.value = 'Waitlist';
        option.textContent = 'Waitlist';
        select.insertBefore(option, [...select.options].find((item) => item.value === 'Inactive') || null);
      }
    });
  }

  function reserveRoom() {
    const squad = activeSquad();
    if (!squad) return 0;
    const state = sessionState();
    const coreIds = Object.entries(squad.members || {}).filter(([, member]) => member.role === 'Core').map(([id]) => id);
    const confirmedCore = coreIds.filter((id) => attendance(state, id) === 'Confirmed').length;
    return Math.max(0, capacity() - confirmedCore);
  }

  function activeReserveCount() {
    const squad = activeSquad();
    if (!squad) return 0;
    const state = sessionState();
    return Object.entries(squad.members || {}).filter(([id, member]) => member.role === 'Reserve' && attendance(state, id) === 'Confirmed' && state.activated?.[id]).length;
  }

  function applyCoreFirst() {
    const squad = activeSquad();
    if (!squad) return;
    const state = sessionState();
    const current = roster();
    const cap = capacity();
    const confirmedCore = current.filter((paddler) => squad.members?.[paddler.id]?.role === 'Core' && attendance(state, paddler.id) === 'Confirmed');
    const open = Math.max(0, cap - confirmedCore.length);
    const reserves = current
      .filter((paddler) => squad.members?.[paddler.id]?.role === 'Reserve' && attendance(state, paddler.id) === 'Confirmed' && state.activated?.[paddler.id])
      .sort((a, b) => (squad.members[a.id]?.priority || 999) - (squad.members[b.id]?.priority || 999))
      .slice(0, open);
    const activeIds = new Set([...confirmedCore, ...reserves].map((paddler) => paddler.id));
    const nextRoster = current.map((paddler) => {
      if (paddler.sessionRole === 'Steer' || paddler.sessionRole === 'Drummer') return paddler;
      return { ...paddler, participating: activeIds.has(paddler.id), sessionRole: activeIds.has(paddler.id) ? 'Paddler' : 'Unavailable' };
    });
    save(ROSTER_KEY, nextRoster);

    const draft = load(DRAFT_KEY, null);
    if (draft?.version === 1) {
      const map = new Map(nextRoster.map((paddler) => [paddler.id, paddler]));
      draft.paddlers = nextRoster;
      draft.boats = (draft.boats || []).map((boat) => ({
        ...boat,
        seats: (boat.seats || []).map((seat) => {
          const left = seat.leftId && map.get(seat.leftId)?.participating;
          const right = seat.rightId && map.get(seat.rightId)?.participating;
          return { ...seat, leftId: left ? seat.leftId : null, rightId: right ? seat.rightId : null, leftLocked: Boolean(left && seat.leftLocked), rightLocked: Boolean(right && seat.rightLocked) };
        }),
      }));
      const seated = new Set(draft.boats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
      draft.spares = nextRoster.filter((paddler) => paddler.participating && paddler.sessionRole === 'Paddler' && !seated.has(paddler.id));
      draft.rebuildNeeded = true;
      draft.savedAt = new Date().toISOString();
      save(DRAFT_KEY, draft);
    }
    window.location.reload();
  }

  function statusRecord() {
    return load(KEYS.lineupStatus, {})[sessionKey()] || { status: 'Draft', at: '' };
  }

  function addPrintStatus() {
    const record = statusRecord();
    document.querySelectorAll('.print-boat-sheet').forEach((sheet) => {
      let stamp = sheet.querySelector('.kdbc-print-status');
      if (!stamp) {
        stamp = document.createElement('div');
        stamp.className = 'kdbc-print-status';
        sheet.querySelector('.print-brand-header')?.appendChild(stamp);
      }
      const when = record.at ? new Date(record.at).toLocaleString('en-CA', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : 'Not finalized';
      stamp.innerHTML = `<strong>${record.status.toUpperCase()}</strong><span>${when}</span>`;
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-activate]');
    if (button && button.textContent?.trim() === 'Activate') {
      if (activeReserveCount() >= reserveRoom()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.alert('There is no open Core spot for another Reserve. Mark a Core paddler Out or Unconfirmed first, or increase boat capacity.');
        return;
      }
    }

    const apply = event.target.closest?.('[data-apply]');
    if (apply) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      applyCoreFirst();
    }
  }, true);

  const observer = new MutationObserver(() => {
    ensureWaitlistOptions();
    addPrintStatus();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureWaitlistOptions();
  addPrintStatus();
})();
