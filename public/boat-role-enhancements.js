(() => {
  const ROSTER_KEY = 'kdbc-boat-roster-v1';
  const DRAFT_KEY = 'kdbc-boat-draft-v1';
  const SESSION_ROLE_KEY = 'kdbc-multi-role-session-v1';
  const SQUADS_KEY = 'kdbc-squads-v1';
  const ACTIVE_SQUAD_KEY = 'kdbc-active-squad-v1';
  const SQUAD_SESSION_KEY = 'kdbc-squad-session-state-v1';
  const CLUB_ROLES = ['Paddler', 'Coach', 'Drummer', 'Steer'];
  const PHYSICAL_ROLES = ['Paddler', 'Drummer', 'Steer', 'Off-boat'];

  const safeParse = (text, fallback) => {
    try { return JSON.parse(text ?? '') ?? fallback; } catch { return fallback; }
  };
  const roster = () => safeParse(localStorage.getItem(ROSTER_KEY), []);
  const draft = () => safeParse(localStorage.getItem(DRAFT_KEY), null);
  const sessions = () => safeParse(localStorage.getItem(SESSION_ROLE_KEY), {});
  const squads = () => safeParse(localStorage.getItem(SQUADS_KEY), []);
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

  function sessionParts() {
    const chip = document.querySelector('.active-session-chip');
    const title = chip?.querySelector('strong')?.textContent?.trim() || 'Current session';
    const date = chip?.querySelector('small')?.textContent?.trim() || 'Date not set';
    return { title, date };
  }

  function sessionDescriptor() {
    const { title, date } = sessionParts();
    return `${title}::${date}`;
  }

  function activeSquad() {
    const id = localStorage.getItem(ACTIVE_SQUAD_KEY) || '';
    return squads().find((item) => item.id === id) || null;
  }

  function squadSessionState(squadId) {
    const { title, date } = sessionParts();
    const all = safeParse(localStorage.getItem(SQUAD_SESSION_KEY), {});
    return all[`${squadId || 'no-squad'}::${title}::${date}`] || { attendance: {}, activated: {} };
  }

  function normalizedClubRoles(paddler) {
    const stored = Array.isArray(paddler.clubRoles) ? paddler.clubRoles : Array.isArray(paddler.eligibleRoles) ? paddler.eligibleRoles : [];
    const roles = stored.filter((role) => CLUB_ROLES.includes(role));
    if (paddler.sessionRole === 'Steer' && !roles.includes('Steer')) roles.push('Steer');
    if (paddler.sessionRole === 'Drummer' && !roles.includes('Drummer')) roles.push('Drummer');
    if (!roles.length || paddler.sessionRole === 'Paddler') {
      if (!roles.includes('Paddler')) roles.unshift('Paddler');
    }
    return [...new Set(roles)];
  }

  function getSessionAssignment(paddler) {
    const all = sessions();
    const current = all[sessionDescriptor()]?.[paddler.id];
    if (current) return current;
    const physicalRole = ['Paddler', 'Drummer', 'Steer'].includes(paddler.sessionRole) ? paddler.sessionRole : 'Off-boat';
    return { physicalRole, coachToday: false };
  }

  function resolvedPhysicalRole(paddler) {
    const roles = normalizedClubRoles(paddler);
    const assignment = getSessionAssignment(paddler);
    if (assignment.physicalRole === 'Off-boat') return 'Off-boat';
    if (roles.includes(assignment.physicalRole)) return assignment.physicalRole;
    return roles.includes('Paddler') ? 'Paddler' : 'Off-boat';
  }

  function setClubRoles(paddlerId, roles) {
    const next = roster().map((paddler) => paddler.id === paddlerId ? {
      ...paddler,
      clubRoles: [...new Set(roles)],
      eligibleRoles: [...new Set(roles.filter((role) => role !== 'Coach'))],
    } : paddler);
    localStorage.setItem(ROSTER_KEY, JSON.stringify(next));
    const currentDraft = draft();
    if (currentDraft?.version === 1) {
      currentDraft.paddlers = next;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft));
    }
  }

  function setSessionAssignment(paddlerId, patch) {
    const all = sessions();
    const key = sessionDescriptor();
    all[key] ||= {};
    all[key][paddlerId] = { ...(all[key][paddlerId] || {}), ...patch };
    localStorage.setItem(SESSION_ROLE_KEY, JSON.stringify(all));

    const nextRoster = roster().map((paddler) => {
      if (paddler.id !== paddlerId) return paddler;
      const physicalRole = resolvedPhysicalRole({ ...paddler, sessionRole: all[key][paddlerId].physicalRole || paddler.sessionRole });
      return {
        ...paddler,
        sessionRole: physicalRole === 'Off-boat' ? 'Unavailable' : physicalRole,
        participating: physicalRole !== 'Off-boat',
      };
    });
    localStorage.setItem(ROSTER_KEY, JSON.stringify(nextRoster));

    const currentDraft = draft();
    if (currentDraft?.version === 1) {
      currentDraft.paddlers = nextRoster;
      currentDraft.rebuildNeeded = true;
      currentDraft.savedAt = new Date().toISOString();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft));
    }
  }

  function roleCellHtml(paddler) {
    const roles = normalizedClubRoles(paddler);
    return `<td class="kdbc-role-cell"><div class="kdbc-role-chips">${CLUB_ROLES.map((role) => `<label class="kdbc-role-chip"><input type="checkbox" data-club-role="${esc(role)}" ${roles.includes(role) ? 'checked' : ''}><span>${esc(role)}</span></label>`).join('')}</div><small class="kdbc-role-note">Permanent roles this person can fill.</small></td>`;
  }

  function todayCellHtml(paddler) {
    const assignment = getSessionAssignment(paddler);
    const roles = normalizedClubRoles(paddler);
    const allowed = PHYSICAL_ROLES.filter((role) => role === 'Off-boat' || roles.includes(role));
    const physical = allowed.includes(assignment.physicalRole) ? assignment.physicalRole : (roles.includes('Paddler') ? 'Paddler' : 'Off-boat');
    return `<td class="kdbc-today-role"><select data-today-role>${allowed.map((role) => `<option value="${esc(role)}" ${role === physical ? 'selected' : ''}>${esc(role)}</option>`).join('')}</select>${roles.includes('Coach') ? `<label class="kdbc-coach-today"><input type="checkbox" data-coach-today ${assignment.coachToday ? 'checked' : ''}><span>Coach today</span></label>` : ''}<div class="kdbc-role-summary">${roles.map((role) => `<span>${esc(role)}</span>`).join('')}</div></td>`;
  }

  function ensureWaitlistOption(row) {
    const select = row.querySelector('[data-squad-role]');
    if (!select || [...select.options].some((option) => option.value === 'Waitlist')) return;
    const option = document.createElement('option');
    option.value = 'Waitlist';
    option.textContent = 'Waitlist';
    const squad = activeSquad();
    const memberRole = squad?.members?.[row.dataset.paddlerId]?.role;
    if (memberRole === 'Waitlist') option.selected = true;
    select.appendChild(option);
  }

  function enhanceTable() {
    const table = document.querySelector('#kdbc-squad-workspace .kdbc-quick-table');
    if (!table || table.dataset.rolesEnhanced === 'true') return;
    table.dataset.rolesEnhanced = 'true';
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return;
    const headers = [...headerRow.children];
    const profileHeader = headers.at(-1);
    const roleHeader = document.createElement('th');
    roleHeader.textContent = 'Club roles';
    const todayHeader = document.createElement('th');
    todayHeader.textContent = 'Today';
    headerRow.insertBefore(roleHeader, profileHeader || null);
    headerRow.insertBefore(todayHeader, profileHeader || null);

    const byId = new Map(roster().map((paddler) => [paddler.id, paddler]));
    table.querySelectorAll('tbody tr[data-paddler-id]').forEach((row) => {
      const paddler = byId.get(row.dataset.paddlerId);
      if (!paddler) return;
      ensureWaitlistOption(row);
      const last = row.children[row.children.length - 1];
      if (last) last.innerHTML = `<span>${esc(paddler.experience || 'Experience not set')}</span><small>${paddler.weightKg ? `${esc(paddler.weightKg)} kg` : 'Weight not set'}</small>`;
      last?.insertAdjacentHTML('beforebegin', roleCellHtml(paddler) + todayCellHtml(paddler));
    });

    table.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      const row = target.closest('tr[data-paddler-id]');
      const id = row?.dataset.paddlerId;
      if (!id) return;
      if (target.matches('[data-club-role]')) {
        const roles = [...row.querySelectorAll('[data-club-role]:checked')].map((input) => input.getAttribute('data-club-role')).filter(Boolean);
        setClubRoles(id, roles);
        const paddler = roster().find((item) => item.id === id);
        const today = row.querySelector('.kdbc-today-role');
        if (paddler && today) today.outerHTML = todayCellHtml(paddler);
      } else if (target.matches('[data-today-role]')) {
        setSessionAssignment(id, { physicalRole: target.value });
      } else if (target.matches('[data-coach-today]')) {
        setSessionAssignment(id, { coachToday: target.checked });
      }
    });
  }

  function enhanceRosterDrawer() {
    const drawer = document.querySelector('[aria-label="Manage roster"]');
    if (!drawer || drawer.querySelector('.kdbc-role-drawer-note')) return;
    const heading = drawer.querySelector('h2,h3');
    if (!heading) return;
    const note = document.createElement('p');
    note.className = 'kdbc-role-drawer-note';
    note.textContent = 'Use Squad Quick Roster for permanent multi-role assignments. Advanced profiles remain for side, ratings, restrictions, eligibility, and notes.';
    heading.insertAdjacentElement('afterend', note);
  }

  function applyMultiRoleSquad() {
    const squad = activeSquad();
    if (!squad) return;
    const state = squadSessionState(squad.id);
    const nextRoster = roster().map((paddler) => {
      const member = squad.members?.[paddler.id];
      const attend = state.attendance?.[paddler.id] || 'Unconfirmed';
      const activated = Boolean(state.activated?.[paddler.id]);
      const physicalRole = resolvedPhysicalRole(paddler);
      const memberActive = Boolean(member && !['None', 'Inactive'].includes(member.role));
      const paddlerActive = attend === 'Confirmed' && (member?.role === 'Core' || (member?.role === 'Reserve' && activated));
      const officialActive = attend === 'Confirmed' && memberActive && ['Drummer', 'Steer'].includes(physicalRole);
      const active = physicalRole === 'Paddler' ? paddlerActive : officialActive;
      return {
        ...paddler,
        sessionRole: active ? physicalRole : 'Unavailable',
        participating: active,
      };
    });
    localStorage.setItem(ROSTER_KEY, JSON.stringify(nextRoster));

    const currentDraft = draft();
    if (currentDraft?.version === 1) {
      const map = new Map(nextRoster.map((paddler) => [paddler.id, paddler]));
      const nextBoats = (currentDraft.boats || []).map((boat) => ({
        ...boat,
        seats: (boat.seats || []).map((seat) => {
          const left = seat.leftId ? map.get(seat.leftId) : null;
          const right = seat.rightId ? map.get(seat.rightId) : null;
          const leftActive = Boolean(left?.participating && left.sessionRole === 'Paddler');
          const rightActive = Boolean(right?.participating && right.sessionRole === 'Paddler');
          return {
            ...seat,
            leftId: leftActive ? seat.leftId : null,
            rightId: rightActive ? seat.rightId : null,
            leftLocked: Boolean(leftActive && seat.leftLocked),
            rightLocked: Boolean(rightActive && seat.rightLocked),
          };
        }),
        steerId: boat.steerId && map.get(boat.steerId)?.participating && map.get(boat.steerId)?.sessionRole === 'Steer' ? boat.steerId : null,
        drummerId: boat.drummerId && map.get(boat.drummerId)?.participating && map.get(boat.drummerId)?.sessionRole === 'Drummer' ? boat.drummerId : null,
      }));
      const assigned = new Set(nextBoats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
      currentDraft.paddlers = nextRoster;
      currentDraft.boats = nextBoats;
      currentDraft.spares = nextRoster.filter((paddler) => paddler.participating && paddler.sessionRole === 'Paddler' && !assigned.has(paddler.id));
      currentDraft.rebuildNeeded = true;
      currentDraft.savedAt = new Date().toISOString();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft));
    }
    window.location.reload();
  }

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('#kdbc-squad-workspace [data-apply]') : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    applyMultiRoleSquad();
  }, true);

  function run() {
    enhanceTable();
    enhanceRosterDrawer();
  }

  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  run();
})();
