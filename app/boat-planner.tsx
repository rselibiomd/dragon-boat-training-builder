"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConsoleTheme } from "./page";
import BoatPlannerCore from "./boat-planner-core";
import "./boat-planner-native.css";

type BoatPlannerProps = {
  theme: ConsoleTheme;
  onThemeChange: (theme: ConsoleTheme) => void;
  sessionTitle: string;
  sessionDate: string;
  sessionId: string;
};

type SquadRole = "Core" | "Reserve" | "Waitlist" | "Development" | "Inactive";
type SquadRoleOption = SquadRole | "None";
type Attendance = "Confirmed" | "Unconfirmed" | "Out";
type ClubRole = "Paddler" | "Coach" | "Drummer" | "Steer";
type PhysicalRole = "Paddler" | "Drummer" | "Steer" | "Off-boat";
type Panel = "" | "roster" | "reserves";
type LineupStatus = "Draft" | "Final" | "Revised";

type StoredPaddler = {
  id: string;
  name: string;
  participating?: boolean;
  sessionRole?: string;
  eligibleRoles?: string[];
  clubRoles?: string[];
  sidePref?: string;
  sideExclusive?: boolean;
  weightKg?: number | null;
  preferredPosition?: string;
  ratings?: Record<string, number | null>;
  [key: string]: unknown;
};

type SquadMember = { role: SquadRole; priority: number | null };
type Squad = {
  id: string;
  name: string;
  createdAt: string;
  coreFirst: boolean;
  members: Record<string, SquadMember>;
};

type TodayAssignment = { physicalRole: PhysicalRole; coachToday: boolean };
type NativeSessionState = {
  attendance: Record<string, Attendance>;
  activated: Record<string, boolean>;
  assignments: Record<string, TodayAssignment>;
};

type StoredSeat = {
  row?: number;
  leftId?: string | null;
  rightId?: string | null;
  leftLocked?: boolean;
  rightLocked?: boolean;
  [key: string]: unknown;
};

type StoredBoat = {
  seats?: StoredSeat[];
  steerId?: string | null;
  drummerId?: string | null;
  [key: string]: unknown;
};

type StoredDraft = {
  version?: number;
  paddlers?: StoredPaddler[];
  boats?: StoredBoat[];
  spares?: StoredPaddler[];
  rebuildNeeded?: boolean;
  savedAt?: string;
  [key: string]: unknown;
};

type LineupStatusRecord = { status: LineupStatus; at: string };

const ROSTER_KEY = "kdbc-boat-roster-v1";
const DRAFT_KEY = "kdbc-boat-draft-v1";
const SQUADS_KEY = "kdbc-squads-v1";
const ACTIVE_SQUAD_KEY = "kdbc-active-squad-v1";
const SESSION_STATES_KEY = "kdbc-squad-session-state-v1";
const CLUB_ROLES_KEY = "kdbc-club-roles-native-v1";
const LINEUP_STATUS_KEY = "kdbc-lineup-status-v1";
const OLD_MULTI_ROLE_KEY = "kdbc-multi-role-session-v1";

const SQUAD_ROLES: SquadRoleOption[] = ["None", "Core", "Reserve", "Waitlist", "Development", "Inactive"];
const ATTENDANCE_OPTIONS: Attendance[] = ["Confirmed", "Unconfirmed", "Out"];
const CLUB_ROLES: ClubRole[] = ["Paddler", "Coach", "Drummer", "Steer"];

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function inferClubRoles(paddler: StoredPaddler): ClubRole[] {
  const source = Array.isArray(paddler.clubRoles) && paddler.clubRoles.length
    ? paddler.clubRoles
    : Array.isArray(paddler.eligibleRoles)
      ? paddler.eligibleRoles
      : [];
  const roles = source.filter((role): role is ClubRole => CLUB_ROLES.includes(role as ClubRole));
  if (paddler.sessionRole === "Steer" && !roles.includes("Steer")) roles.push("Steer");
  if (paddler.sessionRole === "Drummer" && !roles.includes("Drummer")) roles.push("Drummer");
  if (!roles.length || paddler.sessionRole === "Paddler") {
    if (!roles.includes("Paddler")) roles.unshift("Paddler");
  }
  return [...new Set(roles)];
}

function defaultPhysicalRole(roles: ClubRole[], currentRole?: string): PhysicalRole {
  if (currentRole === "Steer" && roles.includes("Steer")) return "Steer";
  if (currentRole === "Drummer" && roles.includes("Drummer")) return "Drummer";
  if (roles.includes("Paddler")) return "Paddler";
  if (roles.includes("Drummer")) return "Drummer";
  if (roles.includes("Steer")) return "Steer";
  return "Off-boat";
}

function normalizeSquads(value: unknown): Squad[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<Squad>;
    if (!raw.id || !raw.name) return [];
    return [{
      id: String(raw.id),
      name: String(raw.name),
      createdAt: String(raw.createdAt || new Date().toISOString()),
      coreFirst: raw.coreFirst !== false,
      members: raw.members && typeof raw.members === "object" ? raw.members as Record<string, SquadMember> : {},
    }];
  });
}

function formatStamp(iso: string) {
  if (!iso) return "Not timestamped";
  try {
    return new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "Not timestamped";
  }
}

export default function BoatPlanner(props: BoatPlannerProps) {
  const [hydrated, setHydrated] = useState(false);
  const [roster, setRoster] = useState<StoredPaddler[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [activeSquadId, setActiveSquadId] = useState("");
  const [sessionStates, setSessionStates] = useState<Record<string, NativeSessionState>>({});
  const [clubRoles, setClubRoles] = useState<Record<string, ClubRole[]>>({});
  const [lineupStatuses, setLineupStatuses] = useState<Record<string, LineupStatusRecord>>({});
  const [panel, setPanel] = useState<Panel>("");
  const [raceDay, setRaceDay] = useState(false);
  const [plannerVersion, setPlannerVersion] = useState(0);
  const [message, setMessage] = useState("");

  const sessionLabel = `${props.sessionTitle}::${props.sessionDate || "Date not set"}`;
  const sessionKey = `${activeSquadId || "no-squad"}::${props.sessionTitle}::${props.sessionDate || "Date not set"}`;
  const activeSquad = useMemo(() => squads.find((squad) => squad.id === activeSquadId) ?? null, [activeSquadId, squads]);
  const rosterMap = useMemo(() => new Map(roster.map((paddler) => [paddler.id, paddler])), [roster]);
  const sessionState = sessionStates[sessionKey] ?? { attendance: {}, activated: {}, assignments: {} };
  const lineupStatus = lineupStatuses[sessionKey] ?? { status: "Draft" as LineupStatus, at: "" };

  function refreshRoster() {
    const storedRoster = readStorage<StoredPaddler[]>(ROSTER_KEY, []);
    const storedDraft = readStorage<StoredDraft | null>(DRAFT_KEY, null);
    const next = Array.isArray(storedRoster) && storedRoster.length
      ? storedRoster
      : Array.isArray(storedDraft?.paddlers) ? storedDraft.paddlers : [];
    setRoster(next);
    setClubRoles((current) => {
      const updated = { ...current };
      next.forEach((paddler) => {
        if (!updated[paddler.id]?.length) updated[paddler.id] = inferClubRoles(paddler);
      });
      return updated;
    });
  }

  useEffect(() => {
    const storedRoster = readStorage<StoredPaddler[]>(ROSTER_KEY, []);
    const storedDraft = readStorage<StoredDraft | null>(DRAFT_KEY, null);
    const nextRoster = Array.isArray(storedRoster) && storedRoster.length
      ? storedRoster
      : Array.isArray(storedDraft?.paddlers) ? storedDraft.paddlers : [];
    const nextSquads = normalizeSquads(readStorage<unknown>(SQUADS_KEY, []));
    const requestedActive = window.localStorage.getItem(ACTIVE_SQUAD_KEY) || "";
    const nextActive = nextSquads.some((squad) => squad.id === requestedActive) ? requestedActive : nextSquads[0]?.id || "";
    const nextRoles = readStorage<Record<string, ClubRole[]>>(CLUB_ROLES_KEY, {});
    nextRoster.forEach((paddler) => {
      if (!Array.isArray(nextRoles[paddler.id]) || !nextRoles[paddler.id].length) nextRoles[paddler.id] = inferClubRoles(paddler);
    });
    const nextSessions = readStorage<Record<string, NativeSessionState>>(SESSION_STATES_KEY, {});
    const oldAssignments = readStorage<Record<string, Record<string, TodayAssignment>>>(OLD_MULTI_ROLE_KEY, {});
    if (nextActive && oldAssignments[sessionLabel]) {
      const nativeKey = `${nextActive}::${props.sessionTitle}::${props.sessionDate || "Date not set"}`;
      const existing = nextSessions[nativeKey] ?? { attendance: {}, activated: {}, assignments: {} };
      if (!Object.keys(existing.assignments || {}).length) nextSessions[nativeKey] = { ...existing, assignments: oldAssignments[sessionLabel] };
    }
    setRoster(nextRoster);
    setSquads(nextSquads);
    setActiveSquadId(nextActive);
    setClubRoles(nextRoles);
    setSessionStates(nextSessions);
    setLineupStatuses(readStorage<Record<string, LineupStatusRecord>>(LINEUP_STATUS_KEY, {}));
    setHydrated(true);
  }, [props.sessionDate, props.sessionTitle, sessionLabel]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(SQUADS_KEY, squads);
  }, [hydrated, squads]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(ACTIVE_SQUAD_KEY, activeSquadId);
  }, [activeSquadId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(SESSION_STATES_KEY, sessionStates);
  }, [hydrated, sessionStates]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(CLUB_ROLES_KEY, clubRoles);
  }, [clubRoles, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(LINEUP_STATUS_KEY, lineupStatuses);
  }, [hydrated, lineupStatuses]);

  useEffect(() => {
    const onFocus = () => refreshRoster();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  function rolesFor(paddlerId: string) {
    const paddler = rosterMap.get(paddlerId);
    return clubRoles[paddlerId]?.length ? clubRoles[paddlerId] : paddler ? inferClubRoles(paddler) : [];
  }

  function assignmentFor(paddlerId: string): TodayAssignment {
    const paddler = rosterMap.get(paddlerId);
    return sessionState.assignments[paddlerId] ?? {
      physicalRole: defaultPhysicalRole(rolesFor(paddlerId), paddler?.sessionRole),
      coachToday: false,
    };
  }

  function attendanceFor(paddlerId: string): Attendance {
    return sessionState.attendance[paddlerId] ?? "Unconfirmed";
  }

  function reviseIfFinal() {
    setLineupStatuses((current) => {
      const existing = current[sessionKey];
      if (existing?.status !== "Final") return current;
      return { ...current, [sessionKey]: { status: "Revised", at: new Date().toISOString() } };
    });
  }

  function updateCurrentSession(mutator: (state: NativeSessionState) => void) {
    setSessionStates((current) => {
      const base = current[sessionKey] ?? { attendance: {}, activated: {}, assignments: {} };
      const next: NativeSessionState = {
        attendance: { ...base.attendance },
        activated: { ...base.activated },
        assignments: { ...base.assignments },
      };
      mutator(next);
      return { ...current, [sessionKey]: next };
    });
  }

  function createSquad() {
    const name = window.prompt("Squad / team name")?.trim();
    if (!name) return;
    const id = `squad-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: Squad = { id, name, createdAt: new Date().toISOString(), coreFirst: true, members: {} };
    setSquads((current) => [next, ...current]);
    setActiveSquadId(id);
    setPanel("roster");
    setMessage("Squad created. Assign Core, Reserve, Waitlist, or Development roles below.");
  }

  function deleteSquad() {
    if (!activeSquad) return;
    if (!window.confirm(`Delete ${activeSquad.name}? This will not delete anyone from the club roster.`)) return;
    const next = squads.filter((squad) => squad.id !== activeSquad.id);
    setSquads(next);
    setActiveSquadId(next[0]?.id || "");
    setPanel("");
  }

  function setSquadRole(paddlerId: string, role: SquadRoleOption) {
    if (!activeSquad) return;
    setSquads((current) => current.map((squad) => {
      if (squad.id !== activeSquad.id) return squad;
      const members = { ...squad.members };
      if (role === "None") delete members[paddlerId];
      else members[paddlerId] = { ...(members[paddlerId] || { priority: null }), role };
      return { ...squad, members };
    }));
    if (role !== "Reserve") updateCurrentSession((state) => { delete state.activated[paddlerId]; });
    reviseIfFinal();
  }

  function setReservePriority(paddlerId: string, value: string) {
    if (!activeSquad) return;
    const parsed = Number(value);
    setSquads((current) => current.map((squad) => squad.id !== activeSquad.id ? squad : {
      ...squad,
      members: {
        ...squad.members,
        [paddlerId]: {
          ...(squad.members[paddlerId] || { role: "Reserve" as SquadRole }),
          priority: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null,
        },
      },
    }));
  }

  function setAttendance(paddlerId: string, attendance: Attendance) {
    updateCurrentSession((state) => {
      state.attendance[paddlerId] = attendance;
      if (attendance !== "Confirmed") delete state.activated[paddlerId];
    });
    reviseIfFinal();
  }

  function setClubRole(paddlerId: string, role: ClubRole, checked: boolean) {
    const currentRoles = rolesFor(paddlerId);
    const nextRoles = checked ? [...new Set([...currentRoles, role])] : currentRoles.filter((item) => item !== role);
    setClubRoles((current) => ({ ...current, [paddlerId]: nextRoles }));
    const currentAssignment = assignmentFor(paddlerId);
    updateCurrentSession((state) => {
      let physicalRole = currentAssignment.physicalRole;
      if (physicalRole !== "Off-boat" && !nextRoles.includes(physicalRole as ClubRole)) physicalRole = defaultPhysicalRole(nextRoles);
      state.assignments[paddlerId] = {
        physicalRole,
        coachToday: nextRoles.includes("Coach") ? currentAssignment.coachToday : false,
      };
    });
    reviseIfFinal();
  }

  function setTodayRole(paddlerId: string, physicalRole: PhysicalRole) {
    const current = assignmentFor(paddlerId);
    updateCurrentSession((state) => { state.assignments[paddlerId] = { ...current, physicalRole }; });
    reviseIfFinal();
  }

  function setCoachToday(paddlerId: string, coachToday: boolean) {
    const current = assignmentFor(paddlerId);
    updateCurrentSession((state) => { state.assignments[paddlerId] = { ...current, coachToday }; });
    reviseIfFinal();
  }

  const stats = useMemo(() => {
    if (!activeSquad) return { core: 0, reserves: 0, waitlist: 0, coreConfirmed: 0, coreOut: 0, coreUnconfirmed: 0, corePaddlersReady: 0, reserveActive: 0, reserveConfirmed: 0, openCoreSpots: 0 };
    const memberEntries = Object.entries(activeSquad.members).filter(([id]) => rosterMap.has(id));
    const idsByRole = (role: SquadRole) => memberEntries.filter(([, member]) => member.role === role).map(([id]) => id);
    const coreIds = idsByRole("Core");
    const reserveIds = idsByRole("Reserve");
    const waitlistIds = idsByRole("Waitlist");
    const coreConfirmed = coreIds.filter((id) => attendanceFor(id) === "Confirmed").length;
    const coreOut = coreIds.filter((id) => attendanceFor(id) === "Out").length;
    const coreUnconfirmed = coreIds.filter((id) => attendanceFor(id) === "Unconfirmed").length;
    const corePaddlersReady = coreIds.filter((id) => attendanceFor(id) === "Confirmed" && assignmentFor(id).physicalRole === "Paddler" && rolesFor(id).includes("Paddler")).length;
    const reserveConfirmed = reserveIds.filter((id) => attendanceFor(id) === "Confirmed").length;
    const reserveActive = reserveIds.filter((id) => attendanceFor(id) === "Confirmed" && sessionState.activated[id] && assignmentFor(id).physicalRole === "Paddler").length;
    return {
      core: coreIds.length,
      reserves: reserveIds.length,
      waitlist: waitlistIds.length,
      coreConfirmed,
      coreOut,
      coreUnconfirmed,
      corePaddlersReady,
      reserveActive,
      reserveConfirmed,
      openCoreSpots: Math.max(0, coreIds.length - corePaddlersReady - reserveActive),
    };
  }, [activeSquad, clubRoles, rosterMap, sessionState]);

  function toggleReserve(paddlerId: string) {
    if (!activeSquad) return;
    if (!activeSquad.coreFirst) {
      setMessage("Practice pool mode already includes confirmed Reserve paddlers. Reserve activation is only needed in Core-first mode.");
      return;
    }
    if (attendanceFor(paddlerId) !== "Confirmed") {
      setMessage("A Reserve must be Confirmed before being activated.");
      return;
    }
    if (assignmentFor(paddlerId).physicalRole !== "Paddler") {
      setMessage("A Reserve assigned as Drummer or Steer does not need a paddler-seat activation.");
      return;
    }
    const active = Boolean(sessionState.activated[paddlerId]);
    if (!active && stats.openCoreSpots <= 0) {
      setMessage("There are no open Core paddling spots. A confirmed Core paddler will not be displaced automatically.");
      return;
    }
    updateCurrentSession((state) => {
      if (active) delete state.activated[paddlerId];
      else state.activated[paddlerId] = true;
    });
    reviseIfFinal();
  }

  function setCoreFirst(coreFirst: boolean) {
    if (!activeSquad) return;
    setSquads((current) => current.map((squad) => squad.id === activeSquad.id ? { ...squad, coreFirst } : squad));
    reviseIfFinal();
  }

  function applySquadToPlanner() {
    if (!activeSquad) {
      setMessage("Create or select a Squad first.");
      return;
    }
    const currentRoster = readStorage<StoredPaddler[]>(ROSTER_KEY, roster);
    const nextRoster = currentRoster.map((paddler) => {
      const member = activeSquad.members[paddler.id];
      const attendance = attendanceFor(paddler.id);
      const roles = rolesFor(paddler.id);
      const assignment = assignmentFor(paddler.id);
      const inWorkingSquad = Boolean(member && !["Inactive", "Waitlist"].includes(member.role));
      let participating = false;
      let sessionRole = "Unavailable";

      if (attendance === "Confirmed" && inWorkingSquad) {
        if (assignment.physicalRole === "Steer" && roles.includes("Steer")) {
          participating = true;
          sessionRole = "Steer";
        } else if (assignment.physicalRole === "Drummer" && roles.includes("Drummer")) {
          participating = true;
          sessionRole = "Drummer";
        } else if (assignment.physicalRole === "Paddler" && roles.includes("Paddler")) {
          const paddlerSelected = member.role === "Core"
            || (member.role === "Reserve" && (!activeSquad.coreFirst || Boolean(sessionState.activated[paddler.id])))
            || (member.role === "Development" && !activeSquad.coreFirst);
          if (paddlerSelected) {
            participating = true;
            sessionRole = "Paddler";
          }
        }
      }

      return {
        ...paddler,
        participating,
        sessionRole,
        eligibleRoles: roles.filter((role) => role !== "Coach"),
      };
    });

    writeStorage(ROSTER_KEY, nextRoster);
    const storedDraft = readStorage<StoredDraft | null>(DRAFT_KEY, null);
    if (storedDraft?.version === 1) {
      const byId = new Map(nextRoster.map((paddler) => [paddler.id, paddler]));
      const nextBoats = (storedDraft.boats || []).map((boat) => ({
        ...boat,
        seats: (boat.seats || []).map((seat) => {
          const left = seat.leftId ? byId.get(seat.leftId) : undefined;
          const right = seat.rightId ? byId.get(seat.rightId) : undefined;
          const keepLeft = Boolean(left?.participating && left.sessionRole === "Paddler");
          const keepRight = Boolean(right?.participating && right.sessionRole === "Paddler");
          return {
            ...seat,
            leftId: keepLeft ? seat.leftId : null,
            rightId: keepRight ? seat.rightId : null,
            leftLocked: Boolean(keepLeft && seat.leftLocked),
            rightLocked: Boolean(keepRight && seat.rightLocked),
          };
        }),
        steerId: boat.steerId && byId.get(boat.steerId)?.participating && byId.get(boat.steerId)?.sessionRole === "Steer" ? boat.steerId : null,
        drummerId: boat.drummerId && byId.get(boat.drummerId)?.participating && byId.get(boat.drummerId)?.sessionRole === "Drummer" ? boat.drummerId : null,
      }));
      const assigned = new Set(nextBoats.flatMap((boat) => (boat.seats || []).flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
      storedDraft.paddlers = nextRoster;
      storedDraft.boats = nextBoats;
      storedDraft.spares = nextRoster.filter((paddler) => paddler.participating && paddler.sessionRole === "Paddler" && !assigned.has(paddler.id));
      storedDraft.rebuildNeeded = true;
      storedDraft.savedAt = new Date().toISOString();
      writeStorage(DRAFT_KEY, storedDraft);
    }

    setRoster(nextRoster);
    reviseIfFinal();
    setPlannerVersion((current) => current + 1);
    const activePaddlers = nextRoster.filter((paddler) => paddler.participating && paddler.sessionRole === "Paddler").length;
    const officials = nextRoster.filter((paddler) => paddler.participating && ["Steer", "Drummer"].includes(String(paddler.sessionRole))).length;
    setMessage(`${activePaddlers} paddlers and ${officials} boat official${officials === 1 ? "" : "s"} applied to the planner. Existing seats are preserved where possible.`);
  }

  function updateLocks(mode: "lead" | "front" | "all" | "unlock") {
    const storedDraft = readStorage<StoredDraft | null>(DRAFT_KEY, null);
    if (!storedDraft?.boats?.length) {
      setMessage("Build a lineup first, then use the group lock controls.");
      return;
    }
    storedDraft.boats = storedDraft.boats.map((boat) => ({
      ...boat,
      seats: (boat.seats || []).map((seat) => {
        const row = Number(seat.row || 0);
        const shouldLock = mode === "all" || (mode === "front" && row <= 3) || (mode === "lead" && row === 1);
        return {
          ...seat,
          leftLocked: mode === "unlock" ? false : shouldLock ? Boolean(seat.leftId) : Boolean(seat.leftLocked),
          rightLocked: mode === "unlock" ? false : shouldLock ? Boolean(seat.rightId) : Boolean(seat.rightLocked),
        };
      }),
    }));
    storedDraft.savedAt = new Date().toISOString();
    writeStorage(DRAFT_KEY, storedDraft);
    reviseIfFinal();
    setPlannerVersion((current) => current + 1);
    setMessage(mode === "lead" ? "Lead pair locked in Row 1." : mode === "front" ? "Front three rows locked." : mode === "all" ? "All occupied seats locked." : "All seat locks cleared.");
  }

  function togglePanel(next: Panel) {
    refreshRoster();
    setPanel((current) => current === next ? "" : next);
  }

  const sortedRoster = useMemo(() => [...roster].sort((a, b) => String(a.name).localeCompare(String(b.name))), [roster]);
  const reserveMembers = useMemo(() => {
    if (!activeSquad) return [];
    return Object.entries(activeSquad.members)
      .filter(([id, member]) => member.role === "Reserve" && rosterMap.has(id))
      .sort((a, b) => (a[1].priority || 999) - (b[1].priority || 999));
  }, [activeSquad, rosterMap]);
  const unresolvedCore = useMemo(() => {
    if (!activeSquad) return [];
    return Object.entries(activeSquad.members).filter(([id, member]) => member.role === "Core" && rosterMap.has(id) && (attendanceFor(id) !== "Confirmed" || assignmentFor(id).physicalRole !== "Paddler"));
  }, [activeSquad, clubRoles, rosterMap, sessionState]);

  return (
    <div className={`boat-planner-native ${raceDay ? "native-race-day" : ""}`}>
      <section className="native-squad-console" aria-label="Squad and role planner">
        <div className="native-squad-topline">
          <div className="native-squad-heading">
            <span>Squad / Team</span>
            <strong>{activeSquad?.name || "No squad selected"}</strong>
            <small>{activeSquad ? `${stats.core} Core · ${stats.reserves} Reserves · ${stats.waitlist} Waitlist` : "Create a fixed team from the club roster"}</small>
          </div>
          <label className="native-field"><span>Squad</span><select value={activeSquadId} onChange={(event) => { setActiveSquadId(event.target.value); setPanel(""); refreshRoster(); }}><option value="">Choose squad...</option>{squads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}</select></label>
          <div className="native-squad-actions">
            <button type="button" onClick={createSquad}>+ New squad</button>
            <button type="button" disabled={!activeSquad} onClick={() => togglePanel("roster")}>Quick roster</button>
            <button type="button" disabled={!activeSquad} onClick={() => togglePanel("reserves")}>Reserve desk</button>
            <button type="button" onClick={() => setRaceDay((current) => !current)}>{raceDay ? "Exit race day" : "Race day"}</button>
            <button type="button" onClick={refreshRoster}>Refresh roster</button>
          </div>
          <label className="native-field native-status"><span>Lineup</span><select value={lineupStatus.status} onChange={(event) => setLineupStatuses((current) => ({ ...current, [sessionKey]: { status: event.target.value as LineupStatus, at: new Date().toISOString() } }))}><option>Draft</option><option>Final</option><option>Revised</option></select><small>{formatStamp(lineupStatus.at)}</small></label>
        </div>

        {activeSquad && <>
          <div className="native-squad-summary">
            <span><b>{stats.coreConfirmed}/{stats.core}</b> Core confirmed</span>
            <span><b>{stats.coreUnconfirmed}</b> Core unconfirmed</span>
            <span><b>{stats.coreOut}</b> Core out</span>
            <span><b>{stats.reserveActive}/{stats.reserveConfirmed}</b> confirmed reserves active</span>
            <label className="native-core-toggle"><input type="checkbox" checked={activeSquad.coreFirst} onChange={(event) => setCoreFirst(event.target.checked)} /><span><b>Core-first</b><small>{activeSquad.coreFirst ? "Only Core plus activated Reserves enter paddling seats" : "Practice pool includes confirmed Core, Reserve, and Development paddlers"}</small></span></label>
            <button className="native-apply" type="button" onClick={applySquadToPlanner}>Apply squad to planner</button>
          </div>
          <div className="native-lock-row">
            <span><b>Quick locks</b><small>Group controls use the saved React planner draft, not DOM scripting.</small></span>
            <button type="button" onClick={() => updateLocks("lead")}>Lock lead pair</button>
            <button type="button" onClick={() => updateLocks("front")}>Lock front 3</button>
            <button type="button" onClick={() => updateLocks("all")}>Lock boat</button>
            <button type="button" onClick={() => updateLocks("unlock")}>Unlock all</button>
          </div>
        </>}

        {message && <div className="native-message" role="status"><span>{message}</span><button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></div>}

        {panel === "roster" && activeSquad && <div className="native-panel">
          <div className="native-panel-heading"><div><span>Quick roster</span><h3>Squad membership, roles, and today&apos;s assignment</h3></div><button className="native-danger" type="button" onClick={deleteSquad}>Delete squad</button></div>
          <p>Squad status is permanent for this team. Club roles describe what a person can do. Attendance and Today are specific to this practice or event.</p>
          <div className="native-table-wrap"><table className="native-roster-table"><thead><tr><th>Paddler</th><th>Squad status</th><th>Attendance</th><th>Club roles</th><th>Today</th><th>Reserve priority</th></tr></thead><tbody>
            {sortedRoster.map((paddler) => {
              const member = activeSquad.members[paddler.id];
              const squadRole: SquadRoleOption = member?.role || "None";
              const roles = rolesFor(paddler.id);
              const assignment = assignmentFor(paddler.id);
              const physicalOptions: PhysicalRole[] = ["Paddler", "Drummer", "Steer"].filter((role) => roles.includes(role as ClubRole)) as PhysicalRole[];
              physicalOptions.push("Off-boat");
              return <tr key={paddler.id}>
                <td><strong>{paddler.name}</strong><small>{paddler.sideExclusive ? `${paddler.sidePref} only` : `Pref ${paddler.sidePref || "Either"}`}{paddler.weightKg ? ` · ${paddler.weightKg} kg` : ""}</small></td>
                <td><select value={squadRole} onChange={(event) => setSquadRole(paddler.id, event.target.value as SquadRoleOption)}>{SQUAD_ROLES.map((role) => <option key={role}>{role}</option>)}</select></td>
                <td><select disabled={squadRole === "None" || squadRole === "Inactive"} value={attendanceFor(paddler.id)} onChange={(event) => setAttendance(paddler.id, event.target.value as Attendance)}>{ATTENDANCE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td>
                <td><div className="native-role-chips">{CLUB_ROLES.map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={(event) => setClubRole(paddler.id, role, event.target.checked)} /><span>{role}</span></label>)}</div></td>
                <td><select value={assignment.physicalRole} onChange={(event) => setTodayRole(paddler.id, event.target.value as PhysicalRole)}>{physicalOptions.map((role) => <option key={role}>{role}</option>)}</select>{roles.includes("Coach") && <label className="native-coach-today"><input type="checkbox" checked={assignment.coachToday} onChange={(event) => setCoachToday(paddler.id, event.target.checked)} /><span>Coach today</span></label>}</td>
                <td><input aria-label={`${paddler.name} reserve priority`} disabled={squadRole !== "Reserve"} min="1" type="number" value={member?.priority ?? ""} onChange={(event) => setReservePriority(paddler.id, event.target.value)} placeholder="-" /></td>
              </tr>;
            })}
          </tbody></table></div>
        </div>}

        {panel === "reserves" && activeSquad && <div className="native-panel native-reserve-panel">
          <div className="native-panel-heading"><div><span>Reserve desk</span><h3>Resolve Core availability without rebuilding the whole team</h3></div></div>
          <div className="native-reserve-grid">
            <section><h4>Core issues</h4>{unresolvedCore.length ? unresolvedCore.map(([id]) => { const paddler = rosterMap.get(id); const assignment = assignmentFor(id); const attendance = attendanceFor(id); return <div className="native-reserve-row" key={id}><div><strong>{paddler?.name}</strong><small>{attendance !== "Confirmed" ? attendance : `${assignment.physicalRole} today, so a paddling spot opens`}</small></div></div>; }) : <p>All Core paddlers are confirmed and assigned to paddling seats.</p>}</section>
            <section><h4>Reserves</h4>{reserveMembers.length ? reserveMembers.map(([id, member]) => { const paddler = rosterMap.get(id); const attendance = attendanceFor(id); const assignment = assignmentFor(id); const active = Boolean(sessionState.activated[id]); return <div className="native-reserve-row" key={id}><div><strong>{paddler?.name}</strong><small>{member.priority ? `Priority ${member.priority}` : "No fixed priority"} · {assignment.physicalRole} today</small></div><span className={`native-attendance ${attendance.toLowerCase()}`}>{attendance}</span><button disabled={attendance !== "Confirmed" || assignment.physicalRole !== "Paddler" || !activeSquad.coreFirst} type="button" onClick={() => toggleReserve(id)}>{active ? "Deactivate" : "Activate"}</button></div>; }) : <p>No Reserves assigned to this squad.</p>}</section>
          </div>
          {activeSquad.coreFirst && <p className="native-panel-note">Open Core paddling spots remaining: <b>{stats.openCoreSpots}</b>. Confirmed Core paddlers are never displaced automatically by a Reserve.</p>}
        </div>}
      </section>

      <BoatPlannerCore key={plannerVersion} {...props} />
    </div>
  );
}
