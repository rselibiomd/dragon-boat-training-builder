"use client";

import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

type Side = "L" | "R" | "Either";
type Position = "Front" | "Middle" | "Back" | "Any";
type Gender = "F" | "M" | "X" | "Unknown";
type Experience = "Developing" | "Experienced" | "Pacer" | "Steer" | "Unknown";
type RatingKey = "timing" | "connection" | "power" | "stability" | "consistency";
type Strategy = "balanced" | "strongest";
type CompositionRule = "count" | "mixed" | "women";

type Paddler = {
  id: string;
  name: string;
  participating: boolean;
  sidePref: Side;
  sideExclusive: boolean;
  weightKg: number | null;
  preferredPosition: Position;
  gender: Gender;
  experience: Experience;
  ratings: Record<RatingKey, number | null>;
  notes: string;
};

type Seat = {
  row: number;
  active: boolean;
  leftId: string | null;
  rightId: string | null;
  leftLocked: boolean;
  rightLocked: boolean;
};

type Boat = {
  id: string;
  name: string;
  seats: Seat[];
  warnings: string[];
};

type SavedLineup = {
  id: string;
  name: string;
  savedAt: string;
  strategy: Strategy;
  compositionRule: CompositionRule;
  boats: Boat[];
  paddlers: Paddler[];
};

type SeatSide = "left" | "right";

type TouchDrag = {
  paddlerId: string;
  pointerId: number;
  x: number;
  y: number;
};

const RATING_KEYS: RatingKey[] = ["timing", "connection", "power", "stability", "consistency"];
const RATING_LABELS: Record<RatingKey, string> = {
  timing: "Timing",
  connection: "Connection / technique",
  power: "Power",
  stability: "Stability / boat control",
  consistency: "Consistency under load",
};

const emptyRatings = (): Record<RatingKey, number | null> => ({
  timing: null,
  connection: null,
  power: null,
  stability: null,
  consistency: null,
});

const newPaddler = (): Paddler => ({
  id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  participating: true,
  sidePref: "Either",
  sideExclusive: false,
  weightKg: null,
  preferredPosition: "Any",
  gender: "Unknown",
  experience: "Unknown",
  ratings: emptyRatings(),
  notes: "",
});

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["true", "1", "yes", "y", "participating"].includes(value.trim().toLowerCase());
  return fallback;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asRating(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.max(1, Math.min(5, Math.round(parsed)));
}

function canonicalKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function canonicalRecord(raw: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [canonicalKey(key), value]));
}

function normalizeSide(value: unknown): Side {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "L" || text.startsWith("LEFT")) return "L";
  if (text === "R" || text.startsWith("RIGHT")) return "R";
  return "Either";
}

function normalizePosition(value: unknown): Position {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.startsWith("front")) return "Front";
  if (text.startsWith("mid") || text.startsWith("engine")) return "Middle";
  if (text.startsWith("back") || text.startsWith("rear")) return "Back";
  return "Any";
}

function normalizeGender(value: unknown): Gender {
  const text = String(value ?? "").trim().toUpperCase();
  if (["F", "FEMALE", "W", "WOMAN", "WOMEN"].includes(text)) return "F";
  if (["M", "MALE", "MAN", "MEN"].includes(text)) return "M";
  if (["X", "NB", "NONBINARY", "NON-BINARY"].includes(text)) return "X";
  return "Unknown";
}

function normalizeExperience(value: unknown): Experience {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("pacer")) return "Pacer";
  if (text.includes("steer")) return "Steer";
  if (text.includes("develop") || text.includes("novice") || text.includes("new")) return "Developing";
  if (text.includes("experience") || text.includes("veteran")) return "Experienced";
  return "Unknown";
}

function normalizePaddler(raw: Record<string, unknown>, index: number): Paddler {
  const source = canonicalRecord(raw);
  const nestedRatings = raw.ratings && typeof raw.ratings === "object" ? canonicalRecord(raw.ratings as Record<string, unknown>) : {};
  const pick = (...keys: string[]) => keys.map((key) => source[canonicalKey(key)]).find((value) => value !== undefined);
  const rating = (...keys: string[]) => keys.map((key) => source[canonicalKey(key)] ?? nestedRatings[canonicalKey(key)]).find((value) => value !== undefined);
  const sideValue = pick("side_pref", "sidePref", "side", "preferred_side", "preferred side");
  const sideText = String(sideValue ?? "").toLowerCase();
  const weightKg = pick("weight_kg", "weightKg", "weight kg", "kg");
  const weightLb = pick("weight_lb", "weight_lbs", "weight pounds", "lbs", "lb");
  const parsedKg = asNumber(weightKg);
  const parsedLb = asNumber(weightLb);
  return {
    id: String(pick("id", "paddler_id") ?? `import-${Date.now()}-${index}`),
    name: String(pick("name", "paddler", "full_name", "full name") ?? "").trim(),
    participating: asBoolean(pick("participating", "attending", "selected", "active"), true),
    sidePref: normalizeSide(sideValue),
    sideExclusive: asBoolean(pick("side_excl", "sideExclusive", "side_exclusive", "exclusive")) || sideText.includes("only"),
    weightKg: parsedKg ?? (parsedLb === null ? asNumber(pick("weight")) : Number((parsedLb * 0.453592).toFixed(1))),
    preferredPosition: normalizePosition(pick("pref_pos", "preferredPosition", "position", "preferred_position")),
    gender: normalizeGender(pick("gender", "sex")),
    experience: normalizeExperience(pick("experience", "role", "level")),
    ratings: {
      timing: asRating(rating("timing", "timing_rating")),
      connection: asRating(rating("connection", "technique", "connection_rating", "technical_execution")),
      power: asRating(rating("power", "power_rating")),
      stability: asRating(rating("stability", "boat_control", "stability_rating")),
      consistency: asRating(rating("consistency", "consistency_under_load", "consistency_rating")),
    },
    notes: String(pick("notes", "coach_notes") ?? ""),
  };
}

function normalizeRoster(rows: Record<string, unknown>[]) {
  const used = new Set<string>();
  return rows.map((row, index) => {
    const paddler = normalizePaddler(row, index);
    const base = paddler.id || `import-${Date.now()}-${index}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return { ...paddler, id };
  }).filter((paddler) => paddler.name);
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(canonicalKey);
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function composite(paddler: Paddler) {
  const weights: Record<RatingKey, number> = { timing: 0.25, connection: 0.25, power: 0.2, stability: 0.1, consistency: 0.2 };
  return RATING_KEYS.reduce((total, key) => total + valueOrNeutral(paddler.ratings[key]) * weights[key], 0);
}

function activeRows(pairCount: number) {
  if (pairCount <= 0) return [];
  if (pairCount === 1) return [5];
  const rows = Array.from({ length: pairCount }, (_, index) => Math.round(1 + (index * 9) / (pairCount - 1)));
  return [...new Set(rows)].slice(0, pairCount);
}

function activeRowsWithLocks(pairCount: number, lockedSeats: Seat[] | undefined, groupIds: Set<string>) {
  const lockedRows = (lockedSeats ?? [])
    .filter((seat) => (seat.leftLocked && seat.leftId && groupIds.has(seat.leftId)) || (seat.rightLocked && seat.rightId && groupIds.has(seat.rightId)))
    .map((seat) => seat.row);
  const uniqueLockedRows = [...new Set(lockedRows)];
  if (uniqueLockedRows.length > pairCount) {
    throw new Error("There are more locked seat rows than the selected crew size. Unlock a row or add participating paddlers.");
  }
  const result = [...uniqueLockedRows];
  [...activeRows(pairCount), ...Array.from({ length: 10 }, (_, index) => index + 1)].forEach((row) => {
    if (result.length < pairCount && !result.includes(row)) result.push(row);
  });
  return result.sort((a, b) => a - b);
}

function targetBoatSizes(totalPaddlers: number, boatCount: number) {
  const totalPairs = Math.min(Math.floor(totalPaddlers / 2), boatCount * 10);
  const base = Math.floor(totalPairs / boatCount);
  const extra = totalPairs % boatCount;
  return Array.from({ length: boatCount }, (_, index) => (base + (index < extra ? 1 : 0)) * 2);
}

function zoneForRow(row: number): Position {
  if (row <= 3) return "Front";
  if (row <= 7) return "Middle";
  return "Back";
}

function valueOrNeutral(value: number | null) {
  return value ?? 3;
}

function candidateScore(paddler: Paddler, side: "L" | "R", row: number, pairMate: Paddler | undefined, averageWeight: number) {
  if (paddler.sideExclusive && paddler.sidePref !== "Either" && paddler.sidePref !== side) return -1000;
  const zone = zoneForRow(row);
  let score = paddler.sidePref === side ? 2.2 : paddler.sidePref === "Either" ? 0.7 : -0.35;
  // Place constrained paddlers before flexible paddlers can consume their only viable side.
  if (paddler.sideExclusive && paddler.sidePref === side) score += 40;
  if (paddler.preferredPosition === zone) score += 2.3;
  else if (paddler.preferredPosition !== "Any") score -= 0.25;
  if (zone === "Front") {
    score += valueOrNeutral(paddler.ratings.timing) * 0.65;
    score += valueOrNeutral(paddler.ratings.connection) * 0.55;
    score += valueOrNeutral(paddler.ratings.consistency) * 0.5;
  } else if (zone === "Middle") {
    score += valueOrNeutral(paddler.ratings.power) * 0.7;
    score += valueOrNeutral(paddler.ratings.connection) * 0.45;
    score += valueOrNeutral(paddler.ratings.consistency) * 0.35;
  } else {
    score += valueOrNeutral(paddler.ratings.stability) * 0.55;
    score += valueOrNeutral(paddler.ratings.timing) * 0.45;
    score += valueOrNeutral(paddler.ratings.power) * 0.4;
    score += valueOrNeutral(paddler.ratings.consistency) * 0.35;
  }
  if (["Pacer", "Experienced"].includes(paddler.experience) && zone === "Front") score += 1;
  if (["Steer", "Experienced"].includes(paddler.experience) && zone === "Back") score += 0.8;
  if (paddler.weightKg && averageWeight) {
    const delta = (paddler.weightKg - averageWeight) / 10;
    score += zone === "Front" ? -Math.max(0, delta) * 0.25 : zone === "Middle" ? Math.abs(delta) * 0.08 : Math.max(0, delta) * 0.12;
  }
  if (pairMate?.weightKg && paddler.weightKg) score += Math.max(0, 1.25 - Math.abs(pairMate.weightKg - paddler.weightKg) / 8);
  return score;
}

function buildSeats(group: Paddler[], pairCount: number, lockedSeats?: Seat[]) {
  const groupIds = new Set(group.map((paddler) => paddler.id));
  const rows = activeRowsWithLocks(pairCount, lockedSeats, groupIds);
  const preservedIds = new Set<string>();
  const seats: Seat[] = Array.from({ length: 10 }, (_, index) => {
    const old = lockedSeats?.find((seat) => seat.row === index + 1);
    const active = rows.includes(index + 1);
    const preserveLeft = Boolean(active && old?.leftLocked && old.leftId && groupIds.has(old.leftId) && !preservedIds.has(old.leftId));
    if (preserveLeft && old?.leftId) preservedIds.add(old.leftId);
    const preserveRight = Boolean(active && old?.rightLocked && old.rightId && groupIds.has(old.rightId) && !preservedIds.has(old.rightId));
    if (preserveRight && old?.rightId) preservedIds.add(old.rightId);
    return {
      row: index + 1,
      active,
      leftId: preserveLeft ? old?.leftId ?? null : null,
      rightId: preserveRight ? old?.rightId ?? null : null,
      leftLocked: preserveLeft,
      rightLocked: preserveRight,
    };
  });
  const placed = new Set(seats.flatMap((seat) => [seat.leftId, seat.rightId]).filter(Boolean) as string[]);
  const pool = group.filter((paddler) => !placed.has(paddler.id));
  const knownWeights = group.map((paddler) => paddler.weightKg).filter((value): value is number => value !== null);
  const averageWeight = knownWeights.length ? knownWeights.reduce((sum, value) => sum + value, 0) / knownWeights.length : 0;

  seats.filter((seat) => seat.active).forEach((seat) => {
    (["L", "R"] as const).forEach((side) => {
      const key = side === "L" ? "leftId" : "rightId";
      if (seat[key]) return;
      const mateId = side === "L" ? seat.rightId : seat.leftId;
      const mate = group.find((paddler) => paddler.id === mateId);
      const candidate = [...pool]
        .filter((paddler) => !placed.has(paddler.id))
        .sort((a, b) => candidateScore(b, side, seat.row, mate, averageWeight) - candidateScore(a, side, seat.row, mate, averageWeight))[0];
      if (candidate) {
        seat[key] = candidate.id;
        placed.add(candidate.id);
      }
    });
  });
  return seats;
}

function boatWarnings(boat: Boat, paddlerMap: Map<string, Paddler>, compositionRule: CompositionRule) {
  const assigned = boat.seats.flatMap((seat) => [seat.leftId, seat.rightId]).filter(Boolean).map((id) => paddlerMap.get(id as string)).filter(Boolean) as Paddler[];
  const warnings: string[] = [];
  const wrongSide = boat.seats.some((seat) => {
    const left = seat.leftId ? paddlerMap.get(seat.leftId) : undefined;
    const right = seat.rightId ? paddlerMap.get(seat.rightId) : undefined;
    return (left?.sideExclusive && left.sidePref === "R") || (right?.sideExclusive && right.sidePref === "L");
  });
  if (wrongSide) warnings.push("A side-exclusive paddler could not be placed on their required side.");
  const incompleteRows = boat.seats.filter((seat) => seat.active && Boolean(seat.leftId) !== Boolean(seat.rightId)).length;
  if (incompleteRows) warnings.push(`${incompleteRows} active row${incompleteRows === 1 ? " has" : "s have"} an incomplete seat pair.`);
  const knownPairDeltas = boat.seats.flatMap((seat) => {
    const left = seat.leftId ? paddlerMap.get(seat.leftId)?.weightKg : null;
    const right = seat.rightId ? paddlerMap.get(seat.rightId)?.weightKg : null;
    return left && right ? [left - right] : [];
  });
  const knownWeightDelta = knownPairDeltas.reduce((sum, value) => sum + value, 0);
  if (knownPairDeltas.length >= 3 && Math.abs(knownWeightDelta) > 8) warnings.push(`Across ${knownPairDeltas.length} fully known pairs, the side-weight difference is ${Math.abs(knownWeightDelta).toFixed(1)} kg.`);
  const front = boat.seats.filter((seat) => seat.active && seat.row <= 3).flatMap((seat) => [seat.leftId, seat.rightId]).filter(Boolean).map((id) => paddlerMap.get(id as string)).filter(Boolean) as Paddler[];
  const frontQuality = front.length ? front.reduce((sum, paddler) => sum + (valueOrNeutral(paddler.ratings.timing) + valueOrNeutral(paddler.ratings.connection)) / 2, 0) / front.length : 3;
  if (front.length && frontQuality < 3) warnings.push("Lead section may need stronger timing or connection support.");
  const women = assigned.filter((paddler) => paddler.gender === "F").length;
  const unknownGender = assigned.filter((paddler) => paddler.gender === "Unknown").length;
  if (compositionRule === "mixed" && women < Math.ceil(assigned.length / 2)) warnings.push(`Mixed target: ${women}/${assigned.length} paddlers are marked women${unknownGender ? `; ${unknownGender} unknown` : ""}.`);
  if (compositionRule === "women" && assigned.some((paddler) => paddler.gender !== "F")) warnings.push(`Women’s target is not met${unknownGender ? `; ${unknownGender} gender value${unknownGender === 1 ? " is" : "s are"} unknown` : ""}.`);
  const ratingCoverage = assigned.reduce((sum, paddler) => sum + RATING_KEYS.filter((key) => paddler.ratings[key] !== null).length, 0);
  const totalRatings = assigned.length * RATING_KEYS.length;
  if (totalRatings && ratingCoverage / totalRatings < 0.45) warnings.push("Limited coaching ratings: recommendation relies more on side and position preference.");
  return warnings;
}

function createBoats(paddlers: Paddler[], boatCount: number, strategy: Strategy, compositionRule: CompositionRule, existing: Boat[] = []) {
  const attending = paddlers.filter((paddler) => paddler.participating);
  const sizes = targetBoatSizes(attending.length, boatCount);
  if (sizes.some((size) => size < 10)) throw new Error(`You need at least ${boatCount * 10} participating paddlers for ${boatCount} boats.`);
  const ranked = [...attending].sort((a, b) => composite(b) - composite(a));
  const groups: Paddler[][] = Array.from({ length: boatCount }, () => []);
  const lockedIds = new Set<string>();
  existing.slice(0, boatCount).forEach((boat, boatIndex) => {
    boat.seats.forEach((seat) => {
      [[seat.leftId, seat.leftLocked], [seat.rightId, seat.rightLocked]].forEach(([id, locked]) => {
        if (id && locked && attending.some((paddler) => paddler.id === id) && !lockedIds.has(String(id))) {
          const paddler = attending.find((item) => item.id === id);
          if (paddler) groups[boatIndex].push(paddler);
          lockedIds.add(String(id));
        }
      });
    });
  });
  groups.forEach((group, index) => {
    if (group.length > sizes[index]) throw new Error(`${existing[index]?.name ?? `Boat ${index + 1}`} has more locked paddlers than available seats. Unlock seats or increase attendance.`);
  });
  const remaining = ranked.filter((paddler) => !lockedIds.has(paddler.id));
  if (strategy === "strongest") {
    groups.forEach((group, index) => {
      while (group.length < sizes[index] && remaining.length) group.push(remaining.shift() as Paddler);
    });
  } else {
    remaining.forEach((paddler) => {
      const options = groups.map((group, index) => ({ index, room: group.length < sizes[index], average: group.length ? group.reduce((sum, item) => sum + composite(item), 0) / group.length : 0, size: group.length }));
      const target = options.filter((item) => item.room).sort((a, b) => a.average - b.average || a.size - b.size || a.index - b.index)[0];
      if (target) groups[target.index].push(paddler);
    });
  }
  const paddlerMap = new Map(paddlers.map((paddler) => [paddler.id, paddler]));
  const boats = groups.map((group, index) => {
    const old = existing[index];
    const boat: Boat = {
      id: old?.id ?? `boat-${Date.now()}-${index}`,
      name: `Boat ${index + 1}`,
      seats: buildSeats(group, Math.floor(sizes[index] / 2), old?.seats),
      warnings: [],
    };
    boat.warnings = boatWarnings(boat, paddlerMap, compositionRule);
    return boat;
  });
  const assignedIds = new Set(boats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean) as string[]);
  const spares = attending.filter((paddler) => !assignedIds.has(paddler.id));
  return { boats, spares };
}

function ratingCoverage(paddler: Paddler) {
  return RATING_KEYS.filter((key) => paddler.ratings[key] !== null).length;
}

function averageKnown(paddlers: Paddler[], keys: RatingKey[]) {
  const values = paddlers.flatMap((paddler) => keys.map((key) => paddler.ratings[key]).filter((value): value is number => value !== null));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function profileForBoat(boat: Boat, paddlerMap: Map<string, Paddler>) {
  const membersForRows = (start: number, end: number) => boat.seats
    .filter((seat) => seat.active && seat.row >= start && seat.row <= end)
    .flatMap((seat) => [seat.leftId, seat.rightId])
    .filter(Boolean)
    .map((id) => paddlerMap.get(id as string))
    .filter(Boolean) as Paddler[];
  const members = membersForRows(1, 10);
  const knownRatings = members.reduce((sum, paddler) => sum + ratingCoverage(paddler), 0);
  return {
    front: averageKnown(membersForRows(1, 3), ["timing", "connection", "consistency"]),
    middle: averageKnown(membersForRows(4, 7), ["power", "connection", "consistency"]),
    back: averageKnown(membersForRows(8, 10), ["stability", "timing", "consistency"]),
    coverage: members.length ? Math.round((knownRatings / (members.length * RATING_KEYS.length)) * 100) : 0,
  };
}

function formatProfile(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

function csvCell(value: string | number | boolean | null) {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename: string, contents: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

const CSV_HEADERS = ["name", "participating", "side_pref", "side_exclusive", "weight_kg", "preferred_position", "gender", "experience", "timing", "connection", "power", "stability", "consistency", "notes"];

export default function BoatPlanner() {
  const [paddlers, setPaddlers] = useState<Paddler[]>([]);
  const [boatCount, setBoatCount] = useState(1);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [compositionRule, setCompositionRule] = useState<CompositionRule>("count");
  const [boats, setBoats] = useState<Boat[]>([]);
  const [spares, setSpares] = useState<Paddler[]>([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedLineups, setSavedLineups] = useState<SavedLineup[]>([]);
  const [editing, setEditing] = useState<Paddler | null>(null);
  const [search, setSearch] = useState("");
  const [lineupName, setLineupName] = useState("Practice lineup");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState("");
  const [touchDrag, setTouchDrag] = useState<TouchDrag | null>(null);
  const touchDragRef = useRef<TouchDrag | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedRoster = JSON.parse(window.localStorage.getItem("kdbc-boat-roster-v1") ?? "[]");
        setPaddlers(Array.isArray(storedRoster) ? normalizeRoster(storedRoster) : []);
        setSavedLineups(JSON.parse(window.localStorage.getItem("kdbc-saved-lineups-v1") ?? "[]"));
      } catch {
        setPaddlers([]);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("kdbc-boat-roster-v1", JSON.stringify(paddlers));
  }, [paddlers, hydrated]);

  const participating = useMemo(() => paddlers.filter((paddler) => paddler.participating), [paddlers]);
  const paddlerMap = useMemo(() => new Map(paddlers.map((paddler) => [paddler.id, paddler])), [paddlers]);
  const filteredPaddlers = useMemo(() => paddlers.filter((paddler) => paddler.name.toLowerCase().includes(search.toLowerCase())), [paddlers, search]);

  function replaceRoster(next: Paddler[]) {
    setPaddlers(next);
    setBoats([]);
    setSpares([]);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  async function importRoster(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const raw = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsv(text);
      const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.paddlers) ? raw.paddlers : [];
      const next = normalizeRoster(rows);
      if (!next.length) throw new Error("No paddlers were found in that file.");
      replaceRoster(next);
      setRosterOpen(true);
      setError("");
      const attending = next.filter((paddler) => paddler.participating).length;
      showNotice(`${next.length} paddlers imported · ${attending} participating`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That roster could not be imported.");
    }
  }

  function downloadCsvTemplate() {
    const example = ["Example Paddler", true, "Either", false, "", "Any", "Unknown", "Unknown", "", "", "", "", "", "Leave ratings blank when unknown"];
    downloadText("kdbc-roster-template.csv", `${CSV_HEADERS.join(",")}\n${example.map(csvCell).join(",")}\n`);
    showNotice("CSV template downloaded");
  }

  function exportRoster() {
    const rows = paddlers.map((paddler) => [
      paddler.name,
      paddler.participating,
      paddler.sidePref,
      paddler.sideExclusive,
      paddler.weightKg,
      paddler.preferredPosition,
      paddler.gender,
      paddler.experience,
      ...RATING_KEYS.map((key) => paddler.ratings[key]),
      paddler.notes,
    ].map(csvCell).join(","));
    downloadText("kdbc-roster-export.csv", `${CSV_HEADERS.join(",")}\n${rows.join("\n")}\n`);
    showNotice("Roster exported from this device");
  }

  function savePaddler() {
    if (!editing?.name.trim()) {
      setError("Enter the paddler’s name before saving.");
      return;
    }
    replaceRoster(paddlers.some((item) => item.id === editing.id) ? paddlers.map((item) => item.id === editing.id ? editing : item) : [...paddlers, editing]);
    setEditing(null);
    showNotice("Paddler saved on this device");
  }

  function generate() {
    setError("");
    try {
      const result = createBoats(paddlers, boatCount, strategy, compositionRule, boats);
      setBoats(result.boats);
      setSpares(result.spares);
      window.setTimeout(() => document.getElementById("boat-lineups")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The boats could not be generated.");
    }
  }

  function changeCompositionRule(nextRule: CompositionRule) {
    setCompositionRule(nextRule);
    setBoats((current) => current.map((boat) => ({ ...boat, warnings: boatWarnings(boat, paddlerMap, nextRule) })));
  }

  function toggleLock(boatIndex: number, rowIndex: number, side: SeatSide) {
    setBoats((current) => current.map((boat, bIndex) => bIndex !== boatIndex ? boat : {
      ...boat,
      seats: boat.seats.map((seat, sIndex) => sIndex !== rowIndex ? seat : { ...seat, [side === "left" ? "leftLocked" : "rightLocked"]: !seat[side === "left" ? "leftLocked" : "rightLocked"] }),
    }));
  }

  function finishBoatEdit(next: Boat[]) {
    next.forEach((boat) => { boat.warnings = boatWarnings(boat, paddlerMap, compositionRule); });
    const nextAssigned = new Set(next.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
    setBoats(next);
    setSpares(participating.filter((paddler) => !nextAssigned.has(paddler.id)));
  }

  function movePaddlerToSeat(paddlerId: string, boatIndex: number, rowIndex: number, side: SeatSide) {
    const paddler = paddlerMap.get(paddlerId);
    if (!paddler) return;
    const requiredSide = side === "left" ? "L" : "R";
    if (paddler.sideExclusive && paddler.sidePref !== "Either" && paddler.sidePref !== requiredSide) {
      setError(`${paddler.name} is marked ${paddler.sidePref === "L" ? "left" : "right"}-side only.`);
      return;
    }

    const currentKey = side === "left" ? "leftId" : "rightId";
    const next = structuredClone(boats) as Boat[];
    const targetSeat = next[boatIndex]?.seats[rowIndex];
    if (!targetSeat) return;
    const displacedId = targetSeat[currentKey];
    if (displacedId === paddlerId) return;

    let source: { seat: Seat; key: "leftId" | "rightId" } | null = null;
    next.forEach((boat) => boat.seats.forEach((seat) => {
      if (seat.leftId === paddlerId) source = { seat, key: "leftId" };
      if (seat.rightId === paddlerId) source = { seat, key: "rightId" };
    }));

    if (source) source.seat[source.key] = displacedId;
    targetSeat[currentKey] = paddlerId;
    finishBoatEdit(next);
    setError("");
    if (!source && displacedId) showNotice(`${paddler.name} moved into the boat; ${paddlerMap.get(displacedId)?.name ?? "previous paddler"} moved to the bench`);
  }

  function movePaddlerToBench(paddlerId: string) {
    const next = structuredClone(boats) as Boat[];
    let moved = false;
    next.forEach((boat) => boat.seats.forEach((seat) => {
      if (seat.leftId === paddlerId) { seat.leftId = null; moved = true; }
      if (seat.rightId === paddlerId) { seat.rightId = null; moved = true; }
    }));
    if (!moved) return;
    finishBoatEdit(next);
    showNotice(`${paddlerMap.get(paddlerId)?.name ?? "Paddler"} moved to the bench`);
  }

  function clearSeatsForManualPlanning() {
    const next = structuredClone(boats) as Boat[];
    next.forEach((boat) => boat.seats.forEach((seat) => {
      seat.leftId = null;
      seat.rightId = null;
      seat.leftLocked = false;
      seat.rightLocked = false;
    }));
    finishBoatEdit(next);
    showNotice("All paddlers moved to the roster bench");
  }

  function swapSeat(boatIndex: number, rowIndex: number, side: SeatSide, nextId: string) {
    if (nextId) movePaddlerToSeat(nextId, boatIndex, rowIndex, side);
  }

  function beginNativeDrag(event: DragEvent<HTMLElement>, paddlerId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", paddlerId);
    setDraggingId(paddlerId);
  }

  function endDrag() {
    setDraggingId(null);
    setDropTarget("");
    touchDragRef.current = null;
    setTouchDrag(null);
  }

  function dropOnSeat(event: DragEvent<HTMLElement>, boatIndex: number, rowIndex: number, side: SeatSide) {
    event.preventDefault();
    const paddlerId = event.dataTransfer.getData("text/plain") || draggingId;
    if (paddlerId) movePaddlerToSeat(paddlerId, boatIndex, rowIndex, side);
    endDrag();
  }

  function beginTouchDrag(event: ReactPointerEvent<HTMLElement>, paddlerId: string) {
    if (event.pointerType === "mouse") return;
    const next = { paddlerId, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    touchDragRef.current = next;
    setTouchDrag(next);
    setDraggingId(paddlerId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTouchDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = touchDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = { ...current, x: event.clientX, y: event.clientY };
    touchDragRef.current = next;
    setTouchDrag(next);
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const seat = target?.closest<HTMLElement>("[data-drop-seat]");
    setDropTarget(seat?.dataset.dropSeat ?? (target?.closest("[data-drop-bench]") ? "bench" : ""));
  }

  function finishTouchDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = touchDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const seat = target?.closest<HTMLElement>("[data-drop-seat]");
    if (seat) {
      movePaddlerToSeat(current.paddlerId, Number(seat.dataset.boatIndex), Number(seat.dataset.rowIndex), seat.dataset.side as SeatSide);
    } else if (target?.closest("[data-drop-bench]")) {
      movePaddlerToBench(current.paddlerId);
    }
    endDrag();
  }

  function saveLineup() {
    if (!boats.length) return;
    const saved: SavedLineup = {
      id: String(Date.now()),
      name: lineupName.trim() || "Boat lineup",
      savedAt: new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }),
      strategy,
      compositionRule,
      boats,
      paddlers,
    };
    const next = [saved, ...savedLineups].slice(0, 20);
    setSavedLineups(next);
    window.localStorage.setItem("kdbc-saved-lineups-v1", JSON.stringify(next));
    showNotice("Lineup saved on this device");
  }

  function loadLineup(saved: SavedLineup) {
    setPaddlers(saved.paddlers);
    setBoats(saved.boats);
    setBoatCount(saved.boats.length);
    setStrategy(saved.strategy);
    setCompositionRule(saved.compositionRule);
    setLineupName(saved.name);
    const assigned = new Set(saved.boats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
    setSpares(saved.paddlers.filter((paddler) => paddler.participating && !assigned.has(paddler.id)));
    setSavedOpen(false);
    showNotice("Saved lineup loaded");
  }

  async function copyLineup() {
    const output = [
      lineupName.toUpperCase(),
      `${strategy === "balanced" ? "Balanced boats" : "Strongest-first"} · ${boats.length} boat${boats.length === 1 ? "" : "s"}`,
      "",
      ...boats.flatMap((boat) => [
        boat.name.toUpperCase(),
        ...boat.seats.filter((seat) => seat.active).map((seat) => `Row ${seat.row}: ${seat.leftId ? paddlerMap.get(seat.leftId)?.name : "—"} (L) | ${seat.rightId ? paddlerMap.get(seat.rightId)?.name : "—"} (R)`),
        boat.warnings.length ? `Check: ${boat.warnings.join(" ")}` : "Checks: no major flags",
        "",
      ]),
      spares.length ? `SPARES: ${spares.map((paddler) => paddler.name).join(", ")}` : "",
    ].join("\n");
    await navigator.clipboard.writeText(output);
    showNotice("Lineup copied");
  }

  const assignedPaddlers = [...new Set(boats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean) as string[])];
  const selectablePaddlers = [...participating].sort((a, b) => a.name.localeCompare(b.name));
  const plannedSeats = Math.min(Math.floor(participating.length / 2) * 2, boatCount * 20);
  const potentialSpares = Math.max(0, participating.length - plannedSeats);

  return (
    <section className="boat-planner-shell">
      <div className="boat-hero">
        <div>
          <p className="eyebrow">Boat planning console</p>
          <h1>Build the boats, then coach the crew.</h1>
          <p>Import attendance, apply your coaching ratings, and generate 1–4 complete-pair lineups without surrendering coaching judgment.</p>
        </div>
        <div className="privacy-card"><span aria-hidden="true">⌂</span><div><strong>Device-only roster</strong><p>Names, weights, ratings, and saved lineups stay in this browser. Nothing is uploaded to the public site.</p></div></div>
      </div>

      <div className="planner-setup-grid">
        <section className="setup-card roster-setup-card">
          <div className="setup-heading"><div><span>1</span><h2>Roster & attendance</h2></div><b>{participating.length} participating</b></div>
          {paddlers.length ? (
            <>
              <div className="roster-stat-row"><div><strong>{paddlers.length}</strong><small>Total roster</small></div><div><strong>{paddlers.filter((p) => p.sideExclusive).length}</strong><small>Side-exclusive</small></div><div><strong>{paddlers.filter((p) => p.weightKg).length}</strong><small>Known weights</small></div><div><strong>{paddlers.filter((p) => ratingCoverage(p) === 5).length}</strong><small>Fully rated</small></div></div>
              <div className="setup-actions"><button onClick={() => setRosterOpen(true)} type="button">Manage roster</button><label className="file-button">Replace roster<input accept=".json,.csv,text/csv,application/json" onChange={importRoster} type="file" /></label><button onClick={() => setEditing(newPaddler())} type="button">+ Add paddler</button><button onClick={exportRoster} type="button">Export CSV</button></div>
            </>
          ) : (
            <div className="import-empty"><span aria-hidden="true">⇧</span><h3>Load your working roster</h3><p>Import the KDBC JSON file or a CSV. Missing weights, preferences, and ratings are allowed.</p><div><label className="file-button primary">Import JSON or CSV<input accept=".json,.csv,text/csv,application/json" onChange={importRoster} type="file" /></label><button onClick={() => setEditing(newPaddler())} type="button">Start manually</button><button onClick={downloadCsvTemplate} type="button">CSV template</button></div></div>
          )}
        </section>

        <section className="setup-card">
          <div className="setup-heading"><div><span>2</span><h2>Boat setup</h2></div></div>
          <div className="boat-count-row" role="group" aria-label="Number of boats">
            {[1, 2, 3, 4].map((count) => <button className={boatCount === count ? "active" : ""} key={count} onClick={() => setBoatCount(count)} type="button"><strong>{count}</strong><small>{count === 1 ? "boat" : "boats"}</small></button>)}
          </div>
          <label className="planner-field"><span>Lineup name</span><input onChange={(event) => setLineupName(event.target.value)} value={lineupName} /></label>
          <p className="capacity-note">Requires at least {boatCount * 10} paddlers; maximum {boatCount * 20}. Odd or excess paddlers become spares.</p>
        </section>

        <section className="setup-card">
          <div className="setup-heading"><div><span>3</span><h2>Recommendation</h2></div></div>
          <div className="strategy-toggle" role="group" aria-label="Boat strategy">
            <button className={strategy === "balanced" ? "active" : ""} onClick={() => setStrategy("balanced")} type="button"><strong>Balanced boats</strong><small>Distribute overall crew strength</small></button>
            <button className={strategy === "strongest" ? "active" : ""} onClick={() => setStrategy("strongest")} type="button"><strong>Strongest-first</strong><small>Rank Boat 1 before the next</small></button>
          </div>
          <label className="planner-field"><span>Composition check</span><select onChange={(event) => changeCompositionRule(event.target.value as CompositionRule)} value={compositionRule}><option value="count">Show counts only</option><option value="mixed">Mixed: at least 50% women</option><option value="women">Women’s crew</option></select></label>
          <p className="capacity-note">Composition is a visible check, not a seating score.</p>
        </section>
      </div>

      {error && <div className="planner-error" role="alert"><span>!</span>{error}<button aria-label="Dismiss error" onClick={() => setError("")} type="button">×</button></div>}

      <div className="planner-build-row">
        <div><strong>{participating.length} ready to place</strong><span>{plannedSeats} seats · {potentialSpares} potential spare{potentialSpares === 1 ? "" : "s"}</span></div>
        <button disabled={!paddlers.length} onClick={generate} type="button">Build {boatCount === 1 ? "boat" : `${boatCount} boats`} →</button>
      </div>

      {boats.length > 0 && (
        <section className="lineup-section" id="boat-lineups">
          <div className="lineup-heading">
            <div><p className="eyebrow">Coach review required</p><h2>{lineupName}</h2><p>Drag paddlers between seats and boats, or drag them back to the roster bench. Lock seats only when you want to protect them from a rebuild.</p></div>
            <div className="lineup-actions"><button onClick={generate} type="button">↻ Rebuild unlocked</button><button onClick={clearSeatsForManualPlanning} type="button">Start manual</button><button onClick={saveLineup} type="button">♡ Save</button><button onClick={copyLineup} type="button">▣ Copy</button><button onClick={() => window.print()} type="button">▤ Print</button><button onClick={() => setSavedOpen(true)} type="button">Saved lineups</button></div>
          </div>

          <div
            className={`spares-card roster-bench ${dropTarget === "bench" ? "drop-target" : ""}`}
            data-drop-bench
            onDragEnter={(event) => { event.preventDefault(); setDropTarget("bench"); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(""); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDrop={(event) => { event.preventDefault(); const paddlerId = event.dataTransfer.getData("text/plain") || draggingId; if (paddlerId) movePaddlerToBench(paddlerId); endDrag(); }}
          >
            <div><span>Roster bench</span><strong>{spares.length}</strong><small>Drag into a seat</small></div>
            <div className="bench-paddlers">
              {spares.length ? spares.map((paddler) => <button
                className={draggingId === paddler.id ? "is-dragging" : ""}
                draggable
                key={paddler.id}
                onDragEnd={endDrag}
                onDragStart={(event) => beginNativeDrag(event, paddler.id)}
                onPointerCancel={endDrag}
                onPointerDown={(event) => beginTouchDrag(event, paddler.id)}
                onPointerMove={moveTouchDrag}
                onPointerUp={finishTouchDrag}
                title={`${paddler.sideExclusive ? `${paddler.sidePref} only` : `${paddler.sidePref} preferred`}${paddler.weightKg ? ` · ${paddler.weightKg} kg` : ""}`}
                type="button"
              ><b>⠿</b><span>{paddler.name}</span><small>{paddler.sideExclusive ? `${paddler.sidePref} only` : `Pref ${paddler.sidePref}`}</small></button>) : <p>Everyone is seated. Drag a paddler here to create a vacancy.</p>}
            </div>
          </div>

          <div className={`boats-grid boats-${boats.length}`}>
            {boats.map((boat, boatIndex) => {
              const ids = boat.seats.flatMap((seat) => [seat.leftId, seat.rightId]).filter(Boolean) as string[];
              const members = ids.map((id) => paddlerMap.get(id)).filter(Boolean) as Paddler[];
              const avg = members.length ? members.reduce((sum, paddler) => sum + composite(paddler), 0) / members.length : 0;
              const women = members.filter((paddler) => paddler.gender === "F").length;
              const profile = profileForBoat(boat, paddlerMap);
              return (
                <article className="boat-card" key={boat.id}>
                  <header><div><span>Suggested lineup</span><h3>{boat.name}</h3></div><div className="boat-score"><strong>{avg.toFixed(1)}</strong><small>crew score</small></div></header>
                  <div className="boat-metrics"><span><b>{members.length}</b> paddlers</span><span><b>{women}</b> women</span><span><b>{profile.coverage}%</b> ratings known</span></div>
                  <div className="boat-profile" aria-label={`${boat.name} section profile`}>
                    <div><span>Front</span><strong>{formatProfile(profile.front)}</strong><small>Timing · connection · consistency</small></div>
                    <div><span>Middle</span><strong>{formatProfile(profile.middle)}</strong><small>Power · connection · consistency</small></div>
                    <div><span>Back</span><strong>{formatProfile(profile.back)}</strong><small>Stability · timing · consistency</small></div>
                  </div>
                  <div className="seat-head"><span>Left</span><b>Bow</b><span>Right</span></div>
                  <div className="seat-plan">
                    {boat.seats.map((seat, rowIndex) => seat.active ? (
                      <div className="seat-row" key={seat.row}>
                        {(["left", "right"] as const).map((side, sideIndex) => {
                          const id = side === "left" ? seat.leftId : seat.rightId;
                          const locked = side === "left" ? seat.leftLocked : seat.rightLocked;
                          const paddler = id ? paddlerMap.get(id) : undefined;
                          const targetKey = `${boatIndex}-${rowIndex}-${side}`;
                          return <div
                            className={`seat-cell ${locked ? "locked" : ""} ${paddler ? "has-paddler" : ""} ${draggingId === id ? "is-dragging" : ""} ${dropTarget === targetKey ? "drop-target" : ""}`}
                            data-boat-index={boatIndex}
                            data-drop-seat={targetKey}
                            data-row-index={rowIndex}
                            data-side={side}
                            key={side}
                            onDragEnter={(event) => { event.preventDefault(); setDropTarget(targetKey); }}
                            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(""); }}
                            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                            onDrop={(event) => dropOnSeat(event, boatIndex, rowIndex, side)}
                            style={{ order: sideIndex === 0 ? 0 : 2 }}
                          >
                            <button className="seat-lock" aria-label={`${locked ? "Unlock" : "Lock"} row ${seat.row} ${side}`} onClick={() => toggleLock(boatIndex, rowIndex, side)} title={locked ? "Unlock this seat for rebuilding" : "Keep this seat when rebuilding"} type="button">{locked ? "●" : "○"}</button>
                            {paddler && <button
                              aria-label={`Drag ${paddler.name}`}
                              className="seat-drag-handle"
                              draggable
                              onDragEnd={endDrag}
                              onDragStart={(event) => beginNativeDrag(event, paddler.id)}
                              onPointerCancel={endDrag}
                              onPointerDown={(event) => beginTouchDrag(event, paddler.id)}
                              onPointerMove={moveTouchDrag}
                              onPointerUp={finishTouchDrag}
                              title="Drag to another seat, boat, or the roster bench"
                              type="button"
                            >⠿</button>}
                            <select aria-label={`Row ${seat.row} ${side} paddler`} onChange={(event) => swapSeat(boatIndex, rowIndex, side, event.target.value)} value={id ?? ""}><option value="">Unassigned</option>{selectablePaddlers.map((item) => <option key={item.id} value={item.id}>{item.name}{assignedPaddlers.includes(item.id) ? "" : " · bench"}</option>)}</select>
                            <small>{paddler ? `${paddler.sideExclusive ? "Only " : "Pref "}${paddler.sidePref} · ${paddler.weightKg ? `${paddler.weightKg} kg` : "weight ?"}` : "Drop paddler here"}</small>
                          </div>;
                        })}
                        <div className="row-number" style={{ order: 1 }}><strong>{seat.row}</strong><span>{zoneForRow(seat.row)}</span></div>
                      </div>
                    ) : <div className="empty-row" key={seat.row}><span /> <b>{seat.row}</b> <span /></div>)}
                  </div>
                  <div className="stern-label">Stern</div>
                  <div className={`boat-checks ${boat.warnings.length ? "has-warnings" : ""}`}><strong>{boat.warnings.length ? `${boat.warnings.length} check${boat.warnings.length === 1 ? "" : "s"}` : "No major flags"}</strong>{boat.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
                </article>
              );
            })}
          </div>
          <div className="planner-truth"><strong>Coach check</strong><p>The score supports a first draft only. Recheck pacers, injuries, side restrictions, interpersonal pairings, and how the hull actually sits once everyone is aboard.</p></div>
        </section>
      )}

      {rosterOpen && (
        <div className="drawer-backdrop" onMouseDown={() => setRosterOpen(false)}>
          <aside className="roster-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-heading"><div><p className="eyebrow">Stored on this device</p><h2>Manage roster</h2></div><button aria-label="Close roster" onClick={() => setRosterOpen(false)} type="button">×</button></div>
            <div className="roster-tools"><input aria-label="Search paddlers" onChange={(event) => setSearch(event.target.value)} placeholder="Search paddlers…" value={search} /><button onClick={() => setEditing(newPaddler())} type="button">+ Add</button></div>
            <div className="roster-bulk-actions"><span>Attendance</span><button onClick={() => replaceRoster(paddlers.map((item) => ({ ...item, participating: true })))} type="button">Select all</button><button onClick={() => replaceRoster(paddlers.map((item) => ({ ...item, participating: false })))} type="button">Clear all</button><button onClick={exportRoster} type="button">Export CSV</button><button onClick={downloadCsvTemplate} type="button">CSV template</button></div>
            <div className="roster-list">
              {filteredPaddlers.map((paddler) => <article key={paddler.id}><label><input checked={paddler.participating} onChange={(event) => replaceRoster(paddlers.map((item) => item.id === paddler.id ? { ...item, participating: event.target.checked } : item))} type="checkbox" /><span><strong>{paddler.name}</strong><small>{paddler.sideExclusive ? `${paddler.sidePref} only` : `${paddler.sidePref} preferred`} · {paddler.weightKg ? `${paddler.weightKg} kg` : "weight unknown"} · {ratingCoverage(paddler)}/5 ratings</small></span></label><button onClick={() => setEditing(structuredClone(paddler))} type="button">Edit</button></article>)}
            </div>
          </aside>
        </div>
      )}

      {editing && (
        <div className="drawer-backdrop" onMouseDown={() => setEditing(null)}>
          <aside className="edit-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-heading"><div><p className="eyebrow">Coach profile</p><h2>{paddlers.some((item) => item.id === editing.id) ? "Edit paddler" : "Add paddler"}</h2></div><button aria-label="Close editor" onClick={() => setEditing(null)} type="button">×</button></div>
            <div className="edit-form">
              <label className="wide"><span>Name</span><input autoFocus onChange={(event) => setEditing({ ...editing, name: event.target.value })} value={editing.name} /></label>
              <label><span>Preferred side</span><select onChange={(event) => setEditing({ ...editing, sidePref: event.target.value as Side })} value={editing.sidePref}><option>L</option><option>R</option><option>Either</option></select></label>
              <label className="check-field"><input checked={editing.sideExclusive} onChange={(event) => setEditing({ ...editing, sideExclusive: event.target.checked })} type="checkbox" /><span>Side is exclusive</span></label>
              <label><span>Weight (kg)</span><input min="35" onChange={(event) => setEditing({ ...editing, weightKg: asNumber(event.target.value) })} placeholder="Unknown" step="0.1" type="number" value={editing.weightKg ?? ""} /></label>
              <label><span>Preferred position</span><select onChange={(event) => setEditing({ ...editing, preferredPosition: event.target.value as Position })} value={editing.preferredPosition}><option>Any</option><option>Front</option><option>Middle</option><option>Back</option></select></label>
              <label><span>Gender / category</span><select onChange={(event) => setEditing({ ...editing, gender: event.target.value as Gender })} value={editing.gender}><option value="Unknown">Unknown</option><option value="F">Woman / F</option><option value="M">Man / M</option><option value="X">Another category / X</option></select></label>
              <label><span>Experience / role</span><select onChange={(event) => setEditing({ ...editing, experience: event.target.value as Experience })} value={editing.experience}><option>Unknown</option><option>Developing</option><option>Experienced</option><option>Pacer</option><option>Steer</option></select></label>
              <div className="ratings-editor wide"><div><strong>Coaching ratings</strong><span>Leave unknown until you have enough evidence.</span></div>{RATING_KEYS.map((key) => <label key={key}><span>{RATING_LABELS[key]}</span><select onChange={(event) => setEditing({ ...editing, ratings: { ...editing.ratings, [key]: event.target.value ? Number(event.target.value) : null } })} value={editing.ratings[key] ?? ""}><option value="">Unknown</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>)}</div>
              <label className="wide"><span>Coach notes</span><textarea onChange={(event) => setEditing({ ...editing, notes: event.target.value })} placeholder="Injury, pairing constraint, recent feedback…" value={editing.notes} /></label>
              <label className="check-field wide"><input checked={editing.participating} onChange={(event) => setEditing({ ...editing, participating: event.target.checked })} type="checkbox" /><span>Participating in this lineup</span></label>
            </div>
            <div className="edit-actions">{paddlers.some((item) => item.id === editing.id) && <button className="danger" onClick={() => { replaceRoster(paddlers.filter((item) => item.id !== editing.id)); setEditing(null); }} type="button">Remove</button>}<button className="primary" onClick={savePaddler} type="button">Save paddler</button></div>
          </aside>
        </div>
      )}

      {savedOpen && (
        <div className="drawer-backdrop" onMouseDown={() => setSavedOpen(false)}><aside className="library-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-heading"><div><p className="eyebrow">This device</p><h2>Saved lineups</h2></div><button aria-label="Close saved lineups" onClick={() => setSavedOpen(false)} type="button">×</button></div>{savedLineups.length ? <div className="saved-list">{savedLineups.map((saved) => <button key={saved.id} onClick={() => loadLineup(saved)} type="button"><span><strong>{saved.name}</strong><small>{saved.boats.length} boat{saved.boats.length === 1 ? "" : "s"} · {saved.savedAt}</small></span><b>Load →</b></button>)}</div> : <div className="empty-state"><span>▱</span><h3>No saved lineups yet</h3><p>Save a generated lineup and it will appear here.</p></div>}</aside></div>
      )}

      {notice && <div className="toast" role="status">✓ {notice}</div>}
      {touchDrag && <div className="touch-drag-preview" style={{ left: touchDrag.x, top: touchDrag.y }}>{paddlerMap.get(touchDrag.paddlerId)?.name ?? "Paddler"}</div>}
    </section>
  );
}
