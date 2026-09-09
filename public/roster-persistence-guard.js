(() => {
  if (typeof window === 'undefined' || window.__kdbcRosterPersistenceGuardInstalled) return;
  window.__kdbcRosterPersistenceGuardInstalled = true;

  const ROSTER_KEY = 'kdbc-boat-roster-v1';
  const SQUAD_MODE_ACTIVE_KEY = 'kdbc-squad-mode-active-v1';
  const SQUAD_BACKUP_KEY = 'kdbc-roster-before-squad-v1';
  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;

  const parse = (value, fallback) => {
    try {
      const parsed = JSON.parse(value ?? 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  };

  const baseRoleFor = (paddler) => {
    const eligible = Array.isArray(paddler?.eligibleRoles) ? paddler.eligibleRoles : [];
    if (eligible.includes('Paddler')) return 'Paddler';
    if (eligible.includes('Steer')) return 'Steer';
    if (eligible.includes('Drummer')) return 'Drummer';
    return 'Paddler';
  };

  const repairBasePaddler = (paddler) => {
    if (!paddler || typeof paddler !== 'object') return paddler;
    if (paddler.sessionRole === 'Unavailable' || !paddler.sessionRole) {
      return { ...paddler, sessionRole: baseRoleFor(paddler) };
    }
    return paddler;
  };

  const mergePermanentRoster = (backupRoster, workingRoster) => {
    const workingById = new Map(
      workingRoster
        .filter((paddler) => paddler && typeof paddler === 'object' && paddler.id)
        .map((paddler) => [paddler.id, paddler]),
    );

    const merged = backupRoster.map((basePaddler) => {
      const working = workingById.get(basePaddler.id);
      if (!working) return repairBasePaddler(basePaddler);
      workingById.delete(basePaddler.id);
      const repairedBase = repairBasePaddler(basePaddler);
      return {
        ...repairedBase,
        ...working,
        // Squad Mode may temporarily change these two fields. Keep the normal
        // Roster-mode values while allowing all true profile edits to persist.
        participating: repairedBase.participating,
        sessionRole: repairedBase.sessionRole,
      };
    });

    // Any ID that was not in the backup is a genuinely new club-roster member.
    // Append it immediately so leaving Squad Mode cannot erase the paddler.
    workingById.forEach((paddler) => merged.push(repairBasePaddler(paddler)));
    return merged;
  };

  const syncBackupFromWorkingRoster = (storage, workingRoster) => {
    if (!Array.isArray(workingRoster)) return;
    if (nativeGetItem.call(storage, SQUAD_MODE_ACTIVE_KEY) !== '1') return;

    const backup = parse(nativeGetItem.call(storage, SQUAD_BACKUP_KEY), null);
    if (!backup || !Array.isArray(backup.roster)) return;

    const mergedRoster = mergePermanentRoster(backup.roster, workingRoster);
    const now = new Date().toISOString();
    const nextBackup = {
      ...backup,
      roster: mergedRoster,
      savedAt: now,
    };

    // The core planner restores draft.paddlers before roster data. Keep that
    // snapshot aligned too, otherwise an old draft could hide the new paddler.
    if (backup.draft && typeof backup.draft === 'object') {
      nextBackup.draft = {
        ...backup.draft,
        paddlers: mergedRoster,
        rebuildNeeded: true,
        savedAt: now,
      };
    }

    nativeSetItem.call(storage, SQUAD_BACKUP_KEY, JSON.stringify(nextBackup));
  };

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    nativeSetItem.call(this, key, value);
    try {
      if (this !== window.localStorage || key !== ROSTER_KEY) return;
      syncBackupFromWorkingRoster(this, parse(value, []));
    } catch {
      // Persistence protection must never block a normal localStorage write.
    }
  };

  // Repair an already-active Squad session immediately when this release loads.
  try {
    const currentRoster = parse(nativeGetItem.call(window.localStorage, ROSTER_KEY), []);
    syncBackupFromWorkingRoster(window.localStorage, currentRoster);
  } catch {
    // localStorage may be unavailable in restricted/private browser contexts.
  }
})();
