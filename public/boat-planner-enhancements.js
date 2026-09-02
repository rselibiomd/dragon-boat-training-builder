(() => {
  const ROOT_ID = 'kdbc-squad-workspace';
  const KEYS = {
    squads: 'kdbc-squads-v1',
    activeSquad: 'kdbc-active-squad-v1',
    sessions: 'kdbc-squad-session-state-v1',
    lineupStatus: 'kdbc-lineup-status-v1',
    leadPairs: 'kdbc-lead-pairs-v1',
  };
  const ROSTER_KEY = 'kdbc-boat-roster-v1';
  const DRAFT_KEY = 'kdbc-boat-draft-v1';
  const SQUAD_ROLES = ['None', 'Core', 'Reserve', 'Development', 'Inactive'];
  const ATTENDANCE = ['Confirmed', 'Unconfirmed', 'Out'];

  const safeParse = (text, fallback) => {
    try { return JSON.parse(text ?? '') ?? fallback; } catch { return fallback; }
  };
  const load = (key, fallback) => safeParse(localStorage.getItem(key), fallback);
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const uid = () => `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const roster = () => load(ROSTER_KEY, []);
  const draft = () => load(DRAFT_KEY, null);
  const squads = () => load(KEYS.squads, []);
  const activeSquadId = () => localStorage.getItem(KEYS.activeSquad) || '';
  const activeSquad = () => squads().find((item) => item.id === activeSquadId()) || null;

  function sessionDescriptor() {
    const chip = document.querySelector('.active-session-chip');
    const title = chip?.querySelector('strong')?.textContent?.trim() || 'Current session';
    const date = chip?.querySelector('small')?.textContent?.trim() || 'Date not set';
    return { title, date };
  }

  function sessionKey(squadId = activeSquadId()) {
    const { title, date } = sessionDescriptor();
    return `${squadId || 'no-squad'}::${title}::${date}`;
  }

  function getSessionState(squadId = activeSquadId()) {
    const all = load(KEYS.sessions, {});
    return all[sessionKey(squadId)] || { attendance: {}, activated: {} };
  }

  function setSessionState(next, squadId = activeSquadId()) {
    const all = load(KEYS.sessions, {});
    all[sessionKey(squadId)] = next;
    save(KEYS.sessions, all);
  }

  function memberFor(squad, paddlerId) {
    return squad?.members?.[paddlerId] || null;
  }

  function attendanceFor(state, paddlerId) {
    return state.attendance?.[paddlerId] || 'Unconfirmed';
  }

  function isActivated(state, paddlerId) {
    return Boolean(state.activated?.[paddlerId]);
  }

  function zoneForRow(row) {
    if (row <= 3) return 'Front';
    if (row <= 7) return 'Middle';
    return 'Back';
  }

  function createSquad() {
    const name = window.prompt('Squad / team name')?.trim();
    if (!name) return;
    const list = squads();
    const id = uid();
    const members = {};
    roster().forEach((paddler) => { members[paddler.id] = { role: 'Development', priority: null }; });
    list.unshift({ id, name, createdAt: new Date().toISOString(), members, coreFirst: true });
    save(KEYS.squads, list);
    localStorage.setItem(KEYS.activeSquad, id);
    render();
  }

  function deleteActiveSquad() {
    const squad = activeSquad();
    if (!squad) return;
    if (!window.confirm(`Delete ${squad.name}? This does not delete paddlers from the club roster.`)) return;
    const list = squads().filter((item) => item.id !== squad.id);
    save(KEYS.squads, list);
    localStorage.setItem(KEYS.activeSquad, list[0]?.id || '');
    render();
  }

  function updateSquad(mutator) {
    const id = activeSquadId();
    if (!id) return;
    const list = squads();
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return;
    const next = structuredClone(list[index]);
    mutator(next);
    list[index] = next;
    save(KEYS.squads, list);
  }

  function setMemberRole(paddlerId, role) {
    updateSquad((squad) => {
      squad.members ||= {};
      if (role === 'None') delete squad.members[paddlerId];
      else squad.members[paddlerId] = { ...(squad.members[paddlerId] || {}), role };
    });
    render();
  }

  function setReservePriority(paddlerId, value) {
    updateSquad((squad) => {
      squad.members ||= {};
      const member = squad.members[paddlerId];
      if (!member) return;
      const parsed = Number(value);
      member.priority = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    });
  }

  function setAttendance(paddlerId, value) {
    const state = getSessionState();
    state.attendance ||= {};
    state.attendance[paddlerId] = value;
    if (value !== 'Confirmed') {
      state.activated ||= {};
      delete state.activated[paddlerId];
    }
    setSessionState(state);
    render();
  }

  function toggleReserve(paddlerId) {
    const state = getSessionState();
    state.activated ||= {};
    if (state.activated[paddlerId]) delete state.activated[paddlerId];
    else state.activated[paddlerId] = true;
    setSessionState(state);
    render();
  }

  function applySquadToPlanner() {
    const squad = activeSquad();
    if (!squad) return window.alert('Create or choose a squad first.');
    const state = getSessionState();
    const currentRoster = roster();
    const nextRoster = currentRoster.map((paddler) => {
      const member = memberFor(squad, paddler.id);
      if (paddler.sessionRole === 'Steer' || paddler.sessionRole === 'Drummer') return paddler;
      const attend = attendanceFor(state, paddler.id);
      const active = attend === 'Confirmed' && (member?.role === 'Core' || (member?.role === 'Reserve' && isActivated(state, paddler.id)));
      return { ...paddler, participating: active, sessionRole: active ? 'Paddler' : 'Unavailable' };
    });
    save(ROSTER_KEY, nextRoster);

    const currentDraft = draft();
    if (currentDraft?.version === 1) {
      const map = new Map(nextRoster.map((paddler) => [paddler.id, paddler]));
      const nextBoats = (currentDraft.boats || []).map((boat) => ({
        ...boat,
        seats: (boat.seats || []).map((seat) => {
          const leftActive = seat.leftId && map.get(seat.leftId)?.participating;
          const rightActive = seat.rightId && map.get(seat.rightId)?.participating;
          return {
            ...seat,
            leftId: leftActive ? seat.leftId : null,
            rightId: rightActive ? seat.rightId : null,
            leftLocked: Boolean(leftActive && seat.leftLocked),
            rightLocked: Boolean(rightActive && seat.rightLocked),
          };
        }),
      }));
      const assigned = new Set(nextBoats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
      currentDraft.paddlers = nextRoster;
      currentDraft.boats = nextBoats;
      currentDraft.spares = nextRoster.filter((paddler) => paddler.participating && paddler.sessionRole === 'Paddler' && !assigned.has(paddler.id));
      currentDraft.rebuildNeeded = true;
      currentDraft.savedAt = new Date().toISOString();
      save(DRAFT_KEY, currentDraft);
    }
    window.location.reload();
  }

  function statusRecord() {
    const all = load(KEYS.lineupStatus, {});
    return all[sessionKey()] || { status: 'Draft', at: '' };
  }

  function setLineupStatus(status) {
    const all = load(KEYS.lineupStatus, {});
    all[sessionKey()] = { status, at: new Date().toISOString() };
    save(KEYS.lineupStatus, all);
    render();
  }

  function markRevisedIfFinal() {
    const current = statusRecord();
    if (current.status === 'Final') setLineupStatus('Revised');
  }

  function formatTime(iso) {
    if (!iso) return 'Not timestamped';
    try { return new Date(iso).toLocaleString('en-CA', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
    catch { return 'Not timestamped'; }
  }

  function squadStats(squad, state) {
    const r = roster();
    const ids = new Set(r.map((p) => p.id));
    const members = Object.entries(squad?.members || {}).filter(([id]) => ids.has(id));
    const roleIds = (role) => members.filter(([, value]) => value.role === role).map(([id]) => id);
    const core = roleIds('Core');
    const reserves = roleIds('Reserve');
    const coreConfirmed = core.filter((id) => attendanceFor(state, id) === 'Confirmed').length;
    const coreOut = core.filter((id) => attendanceFor(state, id) === 'Out').length;
    const coreUnconfirmed = core.filter((id) => attendanceFor(state, id) === 'Unconfirmed').length;
    const reserveConfirmed = reserves.filter((id) => attendanceFor(state, id) === 'Confirmed').length;
    const reserveActive = reserves.filter((id) => attendanceFor(state, id) === 'Confirmed' && isActivated(state, id)).length;
    return { core: core.length, reserves: reserves.length, coreConfirmed, coreOut, coreUnconfirmed, reserveConfirmed, reserveActive };
  }

  function openAdvancedProfiles() {
    const button = [...document.querySelectorAll('.setup-actions button')].find((item) => item.textContent?.trim() === 'Manage roster');
    button?.click();
  }

  function togglePanel(name) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.querySelectorAll('[data-squad-panel]').forEach((panel) => panel.classList.toggle('is-open', panel.dataset.squadPanel === name && !panel.classList.contains('is-open')));
  }

  function quickRosterHtml(squad, state) {
    const rows = [...roster()].sort((a, b) => a.name.localeCompare(b.name)).map((paddler) => {
      const member = memberFor(squad, paddler.id);
      const role = member?.role || 'None';
      const attendance = attendanceFor(state, paddler.id);
      const priority = member?.priority ?? '';
      return `<tr data-paddler-id="${esc(paddler.id)}">
        <td><strong>${esc(paddler.name)}</strong><small>${esc(paddler.sideExclusive ? `${paddler.sidePref} only` : `Pref ${paddler.sidePref}`)}</small></td>
        <td><select data-squad-role>${SQUAD_ROLES.map((item) => `<option ${item === role ? 'selected' : ''}>${item}</option>`).join('')}</select></td>
        <td><select data-attendance ${role === 'None' ? 'disabled' : ''}>${ATTENDANCE.map((item) => `<option ${item === attendance ? 'selected' : ''}>${item}</option>`).join('')}</select></td>
        <td><input data-priority type="number" min="1" step="1" value="${esc(priority)}" placeholder="-" ${role === 'Reserve' ? '' : 'disabled'} /></td>
        <td><span>${esc(paddler.sessionRole || 'Paddler')}</span><small>${paddler.weightKg ? `${esc(paddler.weightKg)} kg` : 'Weight not set'}</small></td>
      </tr>`;
    }).join('');
    return `<div class="kdbc-panel-heading"><div><span>QUICK ROSTER</span><h3>Squad membership and attendance</h3></div><div><button type="button" data-advanced>Advanced profiles</button><button type="button" data-delete-squad class="danger">Delete squad</button></div></div>
      <p class="kdbc-panel-note">Core and Reserve are fixed squad roles. Attendance is session-specific. Reserves only enter the active crew when they are confirmed and activated.</p>
      <div class="kdbc-quick-table-wrap"><table class="kdbc-quick-table"><thead><tr><th>Paddler</th><th>Squad role</th><th>Attendance</th><th>Reserve priority</th><th>Profile</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Add paddlers to the club roster first.</td></tr>'}</tbody></table></div>`;
  }

  function reserveDeskHtml(squad, state) {
    const r = roster();
    const byId = new Map(r.map((p) => [p.id, p]));
    const core = Object.entries(squad?.members || {}).filter(([, m]) => m.role === 'Core');
    const reserves = Object.entries(squad?.members || {}).filter(([, m]) => m.role === 'Reserve').sort((a, b) => (a[1].priority || 999) - (b[1].priority || 999));
    const unresolved = core.filter(([id]) => attendanceFor(state, id) !== 'Confirmed');
    const reserveRows = reserves.map(([id, member]) => {
      const p = byId.get(id); if (!p) return '';
      const attend = attendanceFor(state, id);
      const active = isActivated(state, id);
      return `<div class="kdbc-reserve-row"><div><strong>${esc(p.name)}</strong><span>${member.priority ? `Priority ${member.priority}` : 'No fixed priority'} · ${esc(p.sideExclusive ? `${p.sidePref} only` : `Pref ${p.sidePref}`)}</span></div><span class="attendance-${attend.toLowerCase()}">${attend}</span><button type="button" data-activate="${esc(id)}" ${attend === 'Confirmed' ? '' : 'disabled'}>${active ? 'Deactivate' : 'Activate'}</button></div>`;
    }).join('');
    const unresolvedRows = unresolved.map(([id]) => {
      const p = byId.get(id); if (!p) return '';
      const attend = attendanceFor(state, id);
      return `<div class="kdbc-unresolved-row"><strong>${esc(p.name)}</strong><span>${attend === 'Out' ? 'Core spot open' : 'Awaiting confirmation'}</span></div>`;
    }).join('');
    return `<div class="kdbc-panel-heading"><div><span>RESERVE DESK</span><h3>Resolve core availability without changing the squad</h3></div></div>
      <div class="kdbc-reserve-grid"><section><h4>Core issues</h4>${unresolvedRows || '<p>All Core paddlers are confirmed.</p>'}</section><section><h4>Reserves</h4>${reserveRows || '<p>No reserves assigned to this squad.</p>'}</section></div>`;
  }

  function render() {
    const shell = document.querySelector('.boat-planner-shell');
    if (!shell) return;
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('section');
      root.id = ROOT_ID;
      root.className = 'kdbc-squad-workspace';
      const anchor = shell.querySelector('.boat-hero');
      anchor?.insertAdjacentElement('afterend', root);
    }

    const list = squads();
    let squad = activeSquad();
    if (!squad && list[0]) {
      localStorage.setItem(KEYS.activeSquad, list[0].id);
      squad = list[0];
    }
    const state = getSessionState(squad?.id || '');
    const stats = squad ? squadStats(squad, state) : null;
    const lineup = statusRecord();
    const openPanel = root.querySelector('[data-squad-panel].is-open')?.dataset.squadPanel || '';

    root.innerHTML = `<div class="kdbc-squad-bar">
      <div class="kdbc-squad-title"><span>SQUAD / TEAM</span><strong>${squad ? esc(squad.name) : 'No squad selected'}</strong><small>${squad ? `${stats.core} Core · ${stats.reserves} Reserves` : 'Create a fixed team from the club roster'}</small></div>
      <label class="kdbc-squad-select"><span>Squad</span><select data-squad-select><option value="">Choose squad…</option>${list.map((item) => `<option value="${esc(item.id)}" ${item.id === squad?.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      <div class="kdbc-squad-actions"><button type="button" data-new-squad>+ New squad</button><button type="button" data-panel="quick" ${squad ? '' : 'disabled'}>Quick roster</button><button type="button" data-panel="reserves" ${squad ? '' : 'disabled'}>Reserve desk</button><button type="button" data-race-day>Race day</button><button type="button" data-suggest>Suggest one improvement</button></div>
      <div class="kdbc-lineup-status"><label><span>Lineup</span><select data-lineup-status><option ${lineup.status === 'Draft' ? 'selected' : ''}>Draft</option><option ${lineup.status === 'Final' ? 'selected' : ''}>Final</option><option ${lineup.status === 'Revised' ? 'selected' : ''}>Revised</option></select></label><small>${esc(formatTime(lineup.at))}</small></div>
    </div>
    ${squad ? `<div class="kdbc-squad-summary"><span><b>${stats.coreConfirmed}/${stats.core}</b> Core confirmed</span><span><b>${stats.coreUnconfirmed}</b> Core unconfirmed</span><span><b>${stats.coreOut}</b> Core out</span><span><b>${stats.reserveActive}/${stats.reserveConfirmed}</b> confirmed reserves active</span><button type="button" data-apply>Apply squad to planner</button></div>` : ''}
    <div class="kdbc-suggestion-result" data-suggestion-result></div>
    <div class="kdbc-squad-panel ${openPanel === 'quick' ? 'is-open' : ''}" data-squad-panel="quick">${squad ? quickRosterHtml(squad, state) : ''}</div>
    <div class="kdbc-squad-panel ${openPanel === 'reserves' ? 'is-open' : ''}" data-squad-panel="reserves">${squad ? reserveDeskHtml(squad, state) : ''}</div>`;

    bindRoot(root);
    enhanceBoatCards();
    enhanceSubstitutions();
    stripRecommendationScores();
  }

  function bindRoot(root) {
    root.querySelector('[data-new-squad]')?.addEventListener('click', createSquad);
    root.querySelector('[data-squad-select]')?.addEventListener('change', (event) => {
      localStorage.setItem(KEYS.activeSquad, event.target.value || '');
      render();
    });
    root.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => togglePanel(button.dataset.panel)));
    root.querySelector('[data-race-day]')?.addEventListener('click', () => {
      document.body.classList.toggle('kdbc-race-day-view');
      root.querySelector('[data-race-day]').textContent = document.body.classList.contains('kdbc-race-day-view') ? 'Exit race day' : 'Race day';
    });
    root.querySelector('[data-suggest]')?.addEventListener('click', showOneImprovement);
    root.querySelector('[data-apply]')?.addEventListener('click', applySquadToPlanner);
    root.querySelector('[data-lineup-status]')?.addEventListener('change', (event) => setLineupStatus(event.target.value));
    root.querySelector('[data-advanced]')?.addEventListener('click', openAdvancedProfiles);
    root.querySelector('[data-delete-squad]')?.addEventListener('click', deleteActiveSquad);
    root.querySelectorAll('[data-squad-role]').forEach((select) => select.addEventListener('change', () => setMemberRole(select.closest('tr').dataset.paddlerId, select.value)));
    root.querySelectorAll('[data-attendance]').forEach((select) => select.addEventListener('change', () => setAttendance(select.closest('tr').dataset.paddlerId, select.value)));
    root.querySelectorAll('[data-priority]').forEach((input) => input.addEventListener('change', () => setReservePriority(input.closest('tr').dataset.paddlerId, input.value)));
    root.querySelectorAll('[data-activate]').forEach((button) => button.addEventListener('click', () => toggleReserve(button.dataset.activate)));
  }

  function stripRecommendationScores() {
    document.querySelectorAll('.boat-score').forEach((node) => node.setAttribute('hidden', ''));
  }

  function boatIndexFor(card) {
    return [...document.querySelectorAll('.boat-card')].indexOf(card);
  }

  function rowNumber(row) {
    return Number(row.querySelector('.row-number strong')?.textContent || 0);
  }

  function setLocks(card, mode) {
    const rows = [...card.querySelectorAll('.seat-row')];
    rows.forEach((row) => {
      const number = rowNumber(row);
      const shouldLock = mode === 'all' || (mode === 'front' && number <= 3) || (mode === 'lead' && number === 1);
      row.querySelectorAll('.seat-lock').forEach((button) => {
        const locked = button.textContent?.trim() === '●';
        if ((shouldLock && !locked) || (mode === 'unlock' && locked)) button.click();
      });
    });
  }

  function currentLeadPair(card) {
    const row = [...card.querySelectorAll('.seat-row')].find((item) => rowNumber(item) === 1);
    if (!row) return [];
    return [...row.querySelectorAll('.seat-cell select')].map((select) => select.selectedOptions[0]?.textContent?.replace(' · bench', '').trim()).filter((name) => name && name !== 'Unassigned');
  }

  function saveLeadPair(card) {
    const pair = currentLeadPair(card);
    const all = load(KEYS.leadPairs, {});
    all[`${sessionKey()}::boat-${boatIndexFor(card) + 1}`] = pair;
    save(KEYS.leadPairs, all);
    setLocks(card, 'lead');
    enhanceBoatCards();
  }

  function enhanceBoatCards() {
    document.querySelectorAll('.boat-card').forEach((card) => {
      let tools = card.querySelector('.kdbc-boat-lock-tools');
      if (!tools) {
        tools = document.createElement('div');
        tools.className = 'kdbc-boat-lock-tools';
        card.querySelector('.boat-role-assignments')?.insertAdjacentElement('afterend', tools);
      }
      const key = `${sessionKey()}::boat-${boatIndexFor(card) + 1}`;
      const storedPair = load(KEYS.leadPairs, {})[key] || [];
      tools.innerHTML = `<div><span>Lead pair</span><strong>${storedPair.length ? esc(storedPair.join(' / ')) : esc(currentLeadPair(card).join(' / ') || 'Row 1')}</strong></div><button type="button" data-lead>Mark + lock Row 1</button><button type="button" data-front>Lock front 3</button><button type="button" data-all>Lock boat</button><button type="button" data-unlock>Unlock boat</button>`;
      tools.querySelector('[data-lead]').addEventListener('click', () => saveLeadPair(card));
      tools.querySelector('[data-front]').addEventListener('click', () => setLocks(card, 'front'));
      tools.querySelector('[data-all]').addEventListener('click', () => setLocks(card, 'all'));
      tools.querySelector('[data-unlock]').addEventListener('click', () => setLocks(card, 'unlock'));
    });
  }

  function paddlerMap() {
    return new Map(roster().map((paddler) => [paddler.id, paddler]));
  }

  function seatedPosition(paddlerId) {
    const d = draft();
    for (let b = 0; b < (d?.boats || []).length; b += 1) {
      for (const seat of d.boats[b].seats || []) {
        if (seat.leftId === paddlerId) return { boat: b, row: seat.row, side: 'L' };
        if (seat.rightId === paddlerId) return { boat: b, row: seat.row, side: 'R' };
      }
    }
    return null;
  }

  function replacementScore(candidate, out, position, squad) {
    if (!position) return -999;
    if (candidate.sideExclusive && candidate.sidePref !== 'Either' && candidate.sidePref !== position.side) return -999;
    const zone = zoneForRow(position.row);
    if (candidate.rowRestriction && candidate.rowRestriction !== 'Any' && candidate.rowRestriction !== zone) return -999;
    let score = candidate.sidePref === position.side ? 8 : candidate.sidePref === 'Either' ? 4 : 1;
    if (candidate.preferredPosition === zone) score += 5;
    if (candidate.weightKg && out?.weightKg) score += Math.max(0, 5 - Math.abs(candidate.weightKg - out.weightKg) / 4);
    const zoneWeights = zone === 'Front' ? { timing: 1.2, connection: 1.1, consistency: 0.9 } : zone === 'Middle' ? { power: 1.2, connection: 0.9, consistency: 0.7 } : { stability: 1.1, timing: 0.9, power: 0.7, consistency: 0.7 };
    Object.entries(zoneWeights).forEach(([key, weight]) => { score += (candidate.ratings?.[key] || 0) * weight; });
    const member = memberFor(squad, candidate.id);
    if (member?.role === 'Reserve') score += Math.max(0, 4 - ((member.priority || 4) - 1));
    return score;
  }

  function enhanceSubstitutions() {
    const panel = document.querySelector('.substitution-panel');
    if (!panel || panel.dataset.smartSubs === '1') return;
    panel.dataset.smartSubs = '1';
    const selects = panel.querySelectorAll('select');
    const outSelect = selects[0];
    const inSelect = selects[1];
    if (!outSelect || !inSelect) return;
    const box = document.createElement('div');
    box.className = 'kdbc-smart-subs';
    panel.appendChild(box);

    const update = () => {
      const outId = outSelect.value;
      if (!outId) { box.innerHTML = '<span>Suggested replacements</span><p>Choose the unavailable paddler to see the best bench fits.</p>'; return; }
      const map = paddlerMap();
      const out = map.get(outId);
      const position = seatedPosition(outId);
      const optionIds = [...inSelect.options].map((option) => option.value).filter(Boolean);
      const squad = activeSquad();
      const ranked = optionIds.map((id) => ({ p: map.get(id), score: replacementScore(map.get(id), out, position, squad) })).filter((item) => item.p && item.score > -999).sort((a, b) => b.score - a.score).slice(0, 3);
      box.innerHTML = `<span>Suggested replacements</span>${ranked.length ? ranked.map(({ p }, index) => `<button type="button" data-smart-sub="${esc(p.id)}"><b>${index + 1}</b><strong>${esc(p.name)}</strong><small>${esc(p.sideExclusive ? `${p.sidePref} only` : `Pref ${p.sidePref}`)}${p.weightKg ? ` · ${esc(p.weightKg)} kg` : ''}</small></button>`).join('') : '<p>No compatible bench paddler is available for that seat.</p>'}`;
      box.querySelectorAll('[data-smart-sub]').forEach((button) => button.addEventListener('click', () => {
        inSelect.value = button.dataset.smartSub;
        inSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }));
    };
    outSelect.addEventListener('change', update);
    update();
  }

  function compatibleAcrossSides(paddler, targetSide) {
    return !paddler?.sideExclusive || paddler.sidePref === 'Either' || paddler.sidePref === targetSide;
  }

  function showOneImprovement() {
    const result = document.querySelector('[data-suggestion-result]');
    if (!result) return;
    const d = draft();
    const map = paddlerMap();
    if (!d?.boats?.length) { result.innerHTML = '<strong>Suggestion</strong><span>Build a lineup first.</span>'; return; }

    for (const boat of d.boats) {
      for (const seat of boat.seats || []) {
        if (Boolean(seat.leftId) === Boolean(seat.rightId)) continue;
        const side = seat.leftId ? 'R' : 'L';
        const spares = d.spares || [];
        const candidate = spares.map((p) => ({ p, score: replacementScore(p, null, { row: seat.row, side }, activeSquad()) })).filter((item) => item.score > -999).sort((a, b) => b.score - a.score)[0]?.p;
        if (candidate) {
          result.innerHTML = `<strong>One useful change</strong><span>${esc(boat.name)}: fill Row ${seat.row} ${side} with ${esc(candidate.name)}. This preserves the rest of the boat.</span>`;
          return;
        }
      }
    }

    let best = null;
    for (const boat of d.boats) {
      const rows = boat.seats || [];
      const totals = rows.reduce((acc, seat) => {
        const left = seat.leftId ? map.get(seat.leftId)?.weightKg : null;
        const right = seat.rightId ? map.get(seat.rightId)?.weightKg : null;
        if (left) acc.left += left;
        if (right) acc.right += right;
        if (left && right) acc.known += 2;
        return acc;
      }, { left: 0, right: 0, known: 0 });
      if (totals.known < 12) continue;
      const before = Math.abs(totals.left - totals.right);
      rows.forEach((seat) => {
        const left = seat.leftId ? map.get(seat.leftId) : null;
        const right = seat.rightId ? map.get(seat.rightId) : null;
        if (!left?.weightKg || !right?.weightKg) return;
        if (!compatibleAcrossSides(left, 'R') || !compatibleAcrossSides(right, 'L')) return;
        const afterLeft = totals.left - left.weightKg + right.weightKg;
        const afterRight = totals.right - right.weightKg + left.weightKg;
        const after = Math.abs(afterLeft - afterRight);
        const gain = before - after;
        if (gain > 2 && (!best || gain > best.gain)) best = { boat: boat.name, row: seat.row, left: left.name, right: right.name, before, after, gain };
      });
    }
    if (best) {
      result.innerHTML = `<strong>One useful change</strong><span>${esc(best.boat)}: consider switching ${esc(best.left)} and ${esc(best.right)} across Row ${best.row}. Known side-weight difference improves from ${best.before.toFixed(1)} kg to ${best.after.toFixed(1)} kg. Coach judgment still comes first.</span>`;
    } else {
      result.innerHTML = '<strong>One useful change</strong><span>No meaningful single-seat or single-row change stands out from the data currently entered.</span>';
    }
  }

  function bindRevisionTracking() {
    document.addEventListener('change', (event) => {
      const target = event.target;
      if (target?.closest?.('.seat-cell select, .boat-role-assignments select, .substitution-panel select')) markRevisedIfFinal();
    }, true);
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target?.closest?.('.seat-remove, .substitution-actions button:first-child, .seat-lock, .kdbc-boat-lock-tools button')) markRevisedIfFinal();
    }, true);
  }

  function mountLoop() {
    let lastShell = null;
    const observer = new MutationObserver(() => {
      const shell = document.querySelector('.boat-planner-shell');
      if (shell && shell !== lastShell) {
        lastShell = shell;
        window.setTimeout(render, 30);
      } else if (shell) {
        enhanceBoatCards();
        enhanceSubstitutions();
        stripRecommendationScores();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (document.querySelector('.boat-planner-shell')) render();
  }

  bindRevisionTracking();
  mountLoop();
})();
