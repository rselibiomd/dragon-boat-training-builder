export const DATA_SCHEMA_VERSION = 3;
export const SESSION_STORE_KEY = "kdbc-sessions-v3";
export const ACTIVE_SESSION_ID_KEY = "kdbc-active-session-id-v3";

export type CoachSessionRecord = {
  id: string;
  title: string;
  date: string;
  updatedAt: string;
  training?: unknown;
  attendance?: string[];
  boatPlan?: unknown;
  review?: unknown;
  conditions?: string;
  coachNotes?: string;
};

export function newSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseSessionStore(value: string | null): CoachSessionRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CoachSessionRecord => Boolean(item && typeof item.id === "string" && typeof item.title === "string" && typeof item.date === "string"));
  } catch {
    return [];
  }
}

export function mergeSession(sessions: CoachSessionRecord[], id: string, patch: Partial<CoachSessionRecord>) {
  const current = sessions.find((session) => session.id === id);
  const next: CoachSessionRecord = {
    id,
    title: patch.title ?? current?.title ?? "Practice session",
    date: patch.date ?? current?.date ?? new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
    ...current,
    ...patch,
  };
  return [next, ...sessions.filter((session) => session.id !== id)].slice(0, 100);
}

export function readSessions(storage: Storage) {
  return parseSessionStore(storage.getItem(SESSION_STORE_KEY));
}

export function updateSession(storage: Storage, id: string, patch: Partial<CoachSessionRecord>) {
  const next = mergeSession(readSessions(storage), id, patch);
  storage.setItem(SESSION_STORE_KEY, JSON.stringify(next));
  storage.setItem(ACTIVE_SESSION_ID_KEY, id);
  storage.setItem("kdbc-data-schema-version", String(DATA_SCHEMA_VERSION));
  return next[0];
}

export function migrateLegacySession(storage: Storage) {
  const existing = readSessions(storage);
  const storedId = storage.getItem(ACTIVE_SESSION_ID_KEY);
  if (existing.length && storedId && existing.some((session) => session.id === storedId)) return storedId;
  const id = storedId || newSessionId();
  let legacyTraining: unknown = undefined;
  let legacyBoat: unknown = undefined;
  try { legacyTraining = JSON.parse(storage.getItem("kdbc-active-session-v2") ?? "null") || undefined; } catch { /* invalid legacy draft is ignored */ }
  try { legacyBoat = JSON.parse(storage.getItem("kdbc-boat-draft-v1") ?? "null") || undefined; } catch { /* invalid legacy draft is ignored */ }
  const training = legacyTraining && typeof legacyTraining === "object" ? legacyTraining as Record<string, unknown> : {};
  updateSession(storage, id, {
    title: String(training.title ?? "Practice session"),
    date: String(training.sessionDate ?? new Date().toISOString().slice(0, 10)),
    training: legacyTraining,
    boatPlan: legacyBoat,
    coachNotes: String(training.notes ?? ""),
  });
  return id;
}

export function validateBackupData(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Backup data is invalid.");
  const entries = Object.entries(data as Record<string, unknown>);
  if (!entries.length) throw new Error("Backup data is empty.");
  if (entries.some(([key, value]) => !(key.startsWith("kdbc-") || key.startsWith("dragonboat-")) || typeof value !== "string")) throw new Error("Backup contains invalid keys or values.");
  return { ...Object.fromEntries(entries), "kdbc-data-schema-version": String(DATA_SCHEMA_VERSION) } as Record<string, string>;
}
