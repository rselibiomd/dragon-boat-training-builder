"use client";

import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ConsoleTheme } from "./page";
import { allocateBoatUnits, calculateTrim, evaluateEventEligibility, evidenceConfidence, validateSeatAssignments } from "./boat-intelligence-core";
import { updateSession } from "./session-store";

type Side = "L" | "R" | "Either";
type Position = "Front" | "Middle" | "Back" | "Any";
type Gender = "F" | "M" | "X" | "Unknown";
type Experience = "Developing" | "Experienced" | "Pacer" | "Steer" | "Unknown";
type RatingKey = "timing" | "connection" | "power" | "stability" | "consistency";
type Strategy = "balanced" | "strongest";
type CompositionRule = "count" | "mixed" | "women";
type BoatPrintVariant = "crew" | "coach";
type BoatDisplay = "planner" | "seating" | "analysis" | "compact";
type RatingConfidence = "Low" | "Medium" | "High";
type SessionRole = "Paddler" | "Steer" | "Drummer" | "Unavailable";
type EventEligibility = "Unconfirmed" | "Open" | "Mixed" | "Women" | "Ineligible";
type RowRestriction = "Any" | "Front" | "Middle" | "Back";

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
  ratingAssessedAt: string;
  ratingConfidence: RatingConfidence;
  sessionRole: SessionRole;
  eligibleRoles: SessionRole[];
  eventEligibility: EventEligibility;
  mustPairWith: string;
  avoidPairWith: string;
  rowRestriction: RowRestriction;
  accommodation: string;
  constraintExpiresAt: string;
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
  steerId: string | null;
  drummerId: string | null;
  warnings: string[];
};

type SavedLineup = {
  id: string;
  name: string;
  savedAt: string;
  strategy: Strategy;
  compositionRule: CompositionRule;
  snapshot?: LineupSnapshot;
  boats: Boat[];
  paddlers?: Paddler[];
  sessionId?: string;
};

type LineupSnapshot = {
  boatCount: number;
  strategy: Strategy;
  compositionRule: CompositionRule;
  generatedAt: string;
};

type BoatDraft = {
  version: 1;
  paddlers: Paddler[];
  boatCount: number;
  strategy: Strategy;
  compositionRule: CompositionRule;
  boats: Boat[];
  spares: Paddler[];
  lineupName: string;
  lineupSnapshot: LineupSnapshot | null;
  rebuildNeeded: boolean;
  savedAt: string;
};

type SeatSide = "left" | "right";

type TouchDrag = {
  paddlerId: string;
  pointerId: number;
  x: number;
  y: number;
};

type BoatPlannerProps = {
  theme: ConsoleTheme;
  onThemeChange: (theme: ConsoleTheme) => void;
  sessionTitle: string;
  sessionDate: string;
  sessionId: string;
};

const RATING_KEYS: RatingKey[] = ["timing", "connection", "power", "stability", "consistency"];
const RATING_LABELS: Record<RatingKey, string> = {
  timing: "Timing",
  connection: "Connection / technique",
  power: "Power",
  stability: "Stability / boat control",
  consistency: "Consistency under load",
};
const RATING_ANCHORS: Record<RatingKey, string[]> = {
  timing: [
    "1 — Regularly misses the crew rhythm and needs direct cueing",
    "2 — Finds timing briefly but loses it during changes in rate or load",
    "3 — Matches the front reliably at controlled training load",
    "4 — Holds timing through higher rate, fatigue, and transitions",
    "5 — Sets or reinforces crew rhythm under race pressure",
  ],
  connection: [
    "1 — Blade slips or arm-pulls before a stable catch is established",
    "2 — Connects intermittently with frequent reminders to bury first",
    "3 — Establishes a repeatable catch and transfers pressure cleanly",
    "4 — Maintains connection as force, duration, or rate increases",
    "5 — Crew-leading technical model with consistently heavy water",
  ],
  power: [
    "1 — Limited effective pressure or power comes mainly from the arms",
    "2 — Produces useful pressure in short bursts with cueing",
    "3 — Applies sustainable whole-body pressure at training pace",
    "4 — Produces strong force per stroke without losing length or timing",
    "5 — Race-level power that remains connected and repeatable",
  ],
  stability: [
    "1 — Movement regularly disrupts balance or boat control",
    "2 — Stable at easy pace but control varies during changes",
    "3 — Maintains posture and hull control at normal training load",
    "4 — Remains composed through rough water, starts, and rate changes",
    "5 — Crew-leading boat feel that improves stability around them",
  ],
  consistency: [
    "1 — Technique changes markedly within short sets",
    "2 — Quality is intermittent and falls away early under load",
    "3 — Maintains the expected standard through a normal training set",
    "4 — Holds quality through fatigue and repeated higher-load efforts",
    "5 — Dependable across full race demands and changing conditions",
  ],
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
  ratingAssessedAt: "",
  ratingConfidence: "Low",
  sessionRole: "Paddler",
  eligibleRoles: ["Paddler"],
  eventEligibility: "Unconfirmed",
  mustPairWith: "",
  avoidPairWith: "",
  rowRestriction: "Any",
  accommodation: "",
  constraintExpiresAt: "",
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

function normalizeSessionRole(value: unknown): SessionRole {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("steer")) return "Steer";
  if (text.includes("drum")) return "Drummer";
  if (text.includes("unavailable") || text.includes("absent")) return "Unavailable";
  return "Paddler";
}

function normalizeEventEligibility(value: unknown): EventEligibility {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("ineligible") || text === "no") return "Ineligible";
  if (text.includes("women") || text.includes("woman")) return "Women";
  if (text.includes("mixed")) return "Mixed";
  if (text.includes("open")) return "Open";
  return "Unconfirmed";
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
  const sessionRole = normalizeSessionRole(pick("session_role", "sessionRole", "current_role"));
  const eligibleRoleValue = pick("eligible_roles", "eligibleRoles", "roles");
  const eligibleRoles = Array.isArray(eligibleRoleValue)
    ? eligibleRoleValue.map(normalizeSessionRole)
    : String(eligibleRoleValue ?? "Paddler").split(/[;,|]/).map(normalizeSessionRole);
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
    ratingAssessedAt: String(pick("rating_assessed_at", "assessment_date", "rating date") ?? ""),
    ratingConfidence: (["Low", "Medium", "High"].includes(String(pick("rating_confidence", "confidence") ?? "")) ? String(pick("rating_confidence", "confidence")) : "Low") as RatingConfidence,
    sessionRole,
    eligibleRoles: [...new Set(["Paddler" as SessionRole, ...eligibleRoles, sessionRole])],
    eventEligibility: normalizeEventEligibility(pick("event_eligibility", "eventEligibility", "event_category")),
    mustPairWith: String(pick("must_pair_with", "mustPairWith") ?? ""),
    avoidPairWith: String(pick("avoid_pair_with", "avoidPairWith") ?? ""),
    rowRestriction: normalizePosition(pick("row_restriction", "rowRestriction")) as RowRestriction,
    accommodation: String(pick("accommodation", "injury", "restriction_reason") ?? ""),
    constraintExpiresAt: String(pick("constraint_expires_at", "constraintExpiresAt", "restriction_expiry") ?? ""),
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
  const known = RATING_KEYS.filter((key) => paddler.ratings[key] !== null);
  const weightTotal = known.reduce((total, key) => total + weights[key], 0);
  if (!weightTotal) return 0;
  return known.reduce((total, key) => total + Number(paddler.ratings[key]) * weights[key], 0) / weightTotal;
}

function ratingEvidenceFactor(paddler: Paddler) {
  const coverage = ratingCoverage(paddler) / RATING_KEYS.length;
  if (!coverage) return 0;
  return (evidenceConfidence(paddler) / 100) / coverage;
}

function paddlerDataConfidence(paddler: Paddler) {
  const ratingCoverageScore = ratingCoverage(paddler) / RATING_KEYS.length;
  const profileCoverage = [paddler.weightKg !== null, paddler.sidePref !== "Either", paddler.eventEligibility !== "Unconfirmed"].filter(Boolean).length / 3;
  return Math.round((ratingCoverageScore * ratingEvidenceFactor(paddler) * 0.8 + profileCoverage * 0.2) * 100);
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

function knownValue(value: number | null) {
  return value ?? 0;
}

function candidateScore(paddler: Paddler, side: "L" | "R", row: number, pairMate: Paddler | undefined, averageWeight: number) {
  if (paddler.sideExclusive && paddler.sidePref !== "Either" && paddler.sidePref !== side) return -1000;
  const zone = zoneForRow(row);
  if (paddler.rowRestriction !== "Any" && paddler.rowRestriction !== zone) return -1000;
  let score = paddler.sidePref === side ? 2.2 : paddler.sidePref === "Either" ? 0.7 : -0.35;
  // Place constrained paddlers before flexible paddlers can consume their only viable side.
  if (paddler.sideExclusive && paddler.sidePref === side) score += 40;
  if (paddler.preferredPosition === zone) score += 2.3;
  else if (paddler.preferredPosition !== "Any") score -= 0.25;
  if (zone === "Front") {
    score += knownValue(paddler.ratings.timing) * 0.65;
    score += knownValue(paddler.ratings.connection) * 0.55;
    score += knownValue(paddler.ratings.consistency) * 0.5;
  } else if (zone === "Middle") {
    score += knownValue(paddler.ratings.power) * 0.7;
    score += knownValue(paddler.ratings.connection) * 0.45;
    score += knownValue(paddler.ratings.consistency) * 0.35;
  } else {
    score += knownValue(paddler.ratings.stability) * 0.55;
    score += knownValue(paddler.ratings.timing) * 0.45;
    score += knownValue(paddler.ratings.power) * 0.4;
    score += knownValue(paddler.ratings.consistency) * 0.35;
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
        .filter((paddler) => candidateScore(paddler, side, seat.row, mate, averageWeight) > -1000)
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
  validateSeatAssignments(boat.seats, [...paddlerMap.values()]).forEach((error) => warnings.push(error));
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
  const frontQuality = averageKnown(front, ["timing", "connection"]);
  if (frontQuality !== null && frontQuality < 3) warnings.push("Lead section may need stronger timing or connection support.");
  const eligibility = evaluateEventEligibility(assigned.map((paddler) => paddler.eventEligibility), compositionRule);
  const ineligible = assigned.filter((paddler) => paddler.eventEligibility === "Ineligible");
  const incompatibleWomen = assigned.filter((paddler) => !["Women", "Unconfirmed"].includes(paddler.eventEligibility));
  if (compositionRule === "mixed" && eligibility.provisional) warnings.push(`Mixed event eligibility is provisional: ${eligibility.confirmedWomen}/${eligibility.requiredWomen} required women-eligible places are confirmed; ${eligibility.unconfirmed} paddler${eligibility.unconfirmed === 1 ? " is" : "s are"} still unconfirmed.`);
  if (compositionRule === "mixed" && !eligibility.allowed && !ineligible.length) warnings.push(`Mixed event rule cannot be met: ${eligibility.confirmedWomen} confirmed plus ${eligibility.unconfirmed} unconfirmed cannot fill ${eligibility.requiredWomen} required women-eligible places.`);
  if (compositionRule === "women" && eligibility.provisional) warnings.push(`Women’s event eligibility is provisional: ${eligibility.unconfirmed} paddler${eligibility.unconfirmed === 1 ? " is" : "s are"} still unconfirmed.`);
  if (compositionRule === "women" && incompatibleWomen.length) warnings.push(`${incompatibleWomen.map((paddler) => paddler.name).join(", ")} ${incompatibleWomen.length === 1 ? "does" : "do"} not have women’s-event eligibility recorded.`);
  if (compositionRule !== "count" && ineligible.length) warnings.push(`${ineligible.map((paddler) => paddler.name).join(", ")} ${ineligible.length === 1 ? "is" : "are"} marked ineligible for this event.`);
  assigned.forEach((paddler) => {
    const mustPair = paddler.mustPairWith && assigned.some((item) => item.id === paddler.mustPairWith || item.name === paddler.mustPairWith);
    if (paddler.mustPairWith && !mustPair) warnings.push(`${paddler.name}'s must-pair constraint is not satisfied.`);
    const avoidPair = paddler.avoidPairWith && assigned.some((item) => item.id === paddler.avoidPairWith || item.name === paddler.avoidPairWith);
    if (avoidPair) warnings.push(`${paddler.name}'s avoid-pair constraint is not satisfied.`);
  });
  if (!boat.steerId) warnings.push("No steer is assigned outside the 20 paddling seats.");
  if (!boat.drummerId) warnings.push("No drummer is assigned outside the 20 paddling seats.");
  const ratingCoverage = assigned.reduce((sum, paddler) => sum + RATING_KEYS.filter((key) => paddler.ratings[key] !== null).length, 0);
  const totalRatings = assigned.length * RATING_KEYS.length;
  if (totalRatings && ratingCoverage / totalRatings < 0.45) warnings.push("Limited coaching ratings: recommendation relies more on side and position preference.");
  return warnings;
}

function createBoats(paddlers: Paddler[], boatCount: number, strategy: Strategy, compositionRule: CompositionRule, existing: Boat[] = []) {
  const attending = paddlers.filter((paddler) => paddler.participating && paddler.sessionRole === "Paddler");
  const steers = paddlers.filter((paddler) => paddler.participating && paddler.sessionRole === "Steer");
  const drummers = paddlers.filter((paddler) => paddler.participating && paddler.sessionRole === "Drummer");
  const sizes = targetBoatSizes(attending.length, boatCount);
  if (sizes.some((size) => size < 10)) throw new Error(`You need at least ${boatCount * 10} participating paddlers for ${boatCount} boats.`);
  const eventEligibility = evaluateEventEligibility(attending.map((paddler) => paddler.eventEligibility), compositionRule);
  if (!eventEligibility.allowed && compositionRule === "women") {
    const incompatible = attending.filter((paddler) => !["Women", "Unconfirmed"].includes(paddler.eventEligibility));
    throw new Error(`No feasible women’s-event lineup: update or deselect ${incompatible.slice(0, 4).map((paddler) => paddler.name).join(", ")}${incompatible.length > 4 ? " and others" : ""}. Unconfirmed eligibility is allowed provisionally.`);
  }
  if (!eventEligibility.allowed && compositionRule === "mixed") {
    if (eventEligibility.ineligible) throw new Error("No feasible mixed-event lineup: one or more participating paddlers are explicitly marked ineligible. Update or deselect them; unconfirmed eligibility is allowed provisionally.");
    throw new Error(`No feasible mixed-event lineup: ${eventEligibility.confirmedWomen} confirmed plus ${eventEligibility.unconfirmed} unconfirmed cannot fill ${eventEligibility.requiredWomen} required women-eligible places.`);
  }
  const sideCapacity = sizes.reduce((sum, size) => sum + size / 2, 0);
  const requiredLeft = attending.filter((paddler) => paddler.sideExclusive && paddler.sidePref === "L").length;
  const requiredRight = attending.filter((paddler) => paddler.sideExclusive && paddler.sidePref === "R").length;
  if (requiredLeft > sideCapacity || requiredRight > sideCapacity) throw new Error(`No feasible lineup: required-side demand exceeds the ${sideCapacity} seats available on each side.`);
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
  const pending = new Set(remaining.map((paddler) => paddler.id));
  const resolvePartner = (reference: string) => remaining.find((item) => item.id === reference || item.name.toLowerCase() === reference.toLowerCase());
  const units: Paddler[][] = [];
  remaining.forEach((paddler) => {
    if (!pending.has(paddler.id)) return;
    const partner = paddler.mustPairWith ? resolvePartner(paddler.mustPairWith) : undefined;
    const unit = partner && pending.has(partner.id) && partner.id !== paddler.id ? [paddler, partner] : [paddler];
    unit.forEach((item) => pending.delete(item.id));
    units.push(unit);
  });
  units.sort((a, b) => compositionRule === "mixed"
    ? b.filter((paddler) => paddler.eventEligibility === "Women").length - a.filter((paddler) => paddler.eventEligibility === "Women").length
      || b.filter((paddler) => paddler.eventEligibility === "Unconfirmed").length - a.filter((paddler) => paddler.eventEligibility === "Unconfirmed").length
    : 0);
  const allocation = allocateBoatUnits(
    units.map((unit) => unit.map((paddler) => ({ ...paddler, allocationScore: composite(paddler) }))),
    sizes,
    strategy,
    compositionRule,
    groups.map((group) => group.map((paddler) => ({ ...paddler, allocationScore: composite(paddler) }))),
  );
  allocation.groups.forEach((group, index) => {
    groups[index] = group;
  });
  if (compositionRule === "mixed" && groups.some((group) => !evaluateEventEligibility(group.map((paddler) => paddler.eventEligibility), "mixed").allowed)) {
    throw new Error("The recorded pair constraints and known event eligibility cannot produce a confirmed or provisional mixed crew for every boat. Adjust a constraint or build fewer boats.");
  }
  const paddlerMap = new Map(paddlers.map((paddler) => [paddler.id, paddler]));
  const boats = groups.map((group, index) => {
    const old = existing[index];
    const boat: Boat = {
      id: old?.id ?? `boat-${Date.now()}-${index}`,
      name: `Boat ${index + 1}`,
      seats: buildSeats(group, Math.floor(sizes[index] / 2), old?.seats),
      steerId: old?.steerId && steers.some((paddler) => paddler.id === old.steerId) ? old.steerId : steers[index]?.id ?? null,
      drummerId: old?.drummerId && drummers.some((paddler) => paddler.id === old.drummerId) ? old.drummerId : drummers[index]?.id ?? null,
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

function trimForBoat(boat: Boat, paddlerMap: Map<string, Paddler>) {
  return calculateTrim(boat.seats, [...paddlerMap.values()]);
}

function boatDataConfidence(boat: Boat, paddlerMap: Map<string, Paddler>) {
  const ids = boat.seats.flatMap((seat) => [seat.leftId, seat.rightId]).filter(Boolean) as string[];
  const members = ids.map((id) => paddlerMap.get(id)).filter(Boolean) as Paddler[];
  if (!members.length) return 0;
  return Math.round(members.reduce((sum, paddler) => sum + paddlerDataConfidence(paddler), 0) / members.length);
}

function constraintStatus(boat: Boat) {
  const hard = boat.warnings.filter((warning) => /exclusive|must-pair|avoid-pair|ineligible|event rule|does not have women’s-event eligibility|row|No steer|No drummer/i.test(warning));
  return hard.length ? "Conflict" : boat.warnings.length ? "Review" : "Ready";
}

function recommendationQuality(boat: Boat, paddlerMap: Map<string, Paddler>) {
  const confidence = boatDataConfidence(boat, paddlerMap);
  const status = constraintStatus(boat);
  const warningPenalty = Math.min(25, boat.warnings.length * 5);
  return Math.max(0, Math.min(100, Math.round(70 + confidence * 0.3 - warningPenalty - (status === "Conflict" ? 25 : 0))));
}

function seatReason(paddler: Paddler, seat: Seat, side: "L" | "R") {
  const reasons: string[] = [];
  if (paddler.sideExclusive) reasons.push(`required ${side === "L" ? "left" : "right"} side`);
  else if (paddler.sidePref === side) reasons.push(`${side === "L" ? "left" : "right"} preference`);
  const zone = zoneForRow(seat.row);
  if (paddler.rowRestriction !== "Any") reasons.push(`${paddler.rowRestriction.toLowerCase()} restriction`);
  else if (paddler.preferredPosition === zone) reasons.push(`${zone.toLowerCase()} preference`);
  const strengths = RATING_KEYS.filter((key) => (paddler.ratings[key] ?? 0) >= 4).map((key) => RATING_LABELS[key].toLowerCase());
  if (strengths.length) reasons.push(strengths.slice(0, 2).join(" + "));
  reasons.push(`${paddlerDataConfidence(paddler)}% evidence confidence`);
  return reasons.join("; ");
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

const CSV_HEADERS = ["name", "participating", "session_role", "eligible_roles", "side_pref", "side_exclusive", "weight_kg", "preferred_position", "event_eligibility", "gender", "experience", "timing", "connection", "power", "stability", "consistency", "rating_assessed_at", "rating_confidence", "must_pair_with", "avoid_pair_with", "row_restriction", "accommodation", "constraint_expires_at", "notes"];
const ROSTER_KEY = "kdbc-boat-roster-v1";
const LINEUPS_KEY = "kdbc-saved-lineups-v1";
const DRAFT_KEY = "kdbc-boat-draft-v1";

function normalizeBoats(raw: Boat[]) {
  return (Array.isArray(raw) ? raw : []).map((boat) => ({
    ...boat,
    steerId: boat.steerId ?? null,
    drummerId: boat.drummerId ?? null,
    warnings: Array.isArray(boat.warnings) ? boat.warnings : [],
  }));
}

export default function BoatPlanner({ theme, onThemeChange, sessionTitle, sessionDate, sessionId }: BoatPlannerProps) {
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
  const [lineupName, setLineupName] = useState(`${sessionTitle} lineup`);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState("");
  const [touchDrag, setTouchDrag] = useState<TouchDrag | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printVariant, setPrintVariant] = useState<BoatPrintVariant | null>(null);
  const [printDate, setPrintDate] = useState(new Date().toISOString().slice(0, 10));
  const [printNotes, setPrintNotes] = useState("");
  const [boatDisplay, setBoatDisplay] = useState<BoatDisplay>("planner");
  const [lineupSnapshot, setLineupSnapshot] = useState<LineupSnapshot | null>(null);
  const [rebuildNeeded, setRebuildNeeded] = useState(false);
  const [undoStack, setUndoStack] = useState<Boat[][]>([]);
  const [redoStack, setRedoStack] = useState<Boat[][]>([]);
  const [substitutionBaseline, setSubstitutionBaseline] = useState<{ boats: Boat[]; paddlers: Paddler[] } | null>(null);
  const [substitutionOutId, setSubstitutionOutId] = useState("");
  const [substitutionInId, setSubstitutionInId] = useState("");
  const [changedPaddlerIds, setChangedPaddlerIds] = useState<string[]>([]);
  const touchDragRef = useRef<TouchDrag | null>(null);
  const lastDialogTrigger = useRef<HTMLElement | null>(null);
  const dialogWasOpen = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedRoster = JSON.parse(window.localStorage.getItem(ROSTER_KEY) ?? "[]");
        const storedLineups = JSON.parse(window.localStorage.getItem(LINEUPS_KEY) ?? "[]");
        const storedDraft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as BoatDraft | null;
        setSavedLineups(Array.isArray(storedLineups) ? storedLineups.map((saved: SavedLineup) => ({ ...saved, boats: normalizeBoats(saved.boats), paddlers: saved.paddlers ? normalizeRoster(saved.paddlers as unknown as Record<string, unknown>[]) : undefined })) : []);
        if (storedDraft?.version === 1 && Array.isArray(storedDraft.paddlers)) {
          const restoredRoster = normalizeRoster(storedDraft.paddlers);
          setPaddlers(restoredRoster);
          setBoatCount(storedDraft.boatCount || 1);
          setStrategy(storedDraft.strategy || "balanced");
          setCompositionRule(storedDraft.compositionRule || "count");
          setBoats(normalizeBoats(storedDraft.boats));
          setSpares(Array.isArray(storedDraft.spares) ? storedDraft.spares : []);
          setLineupName(storedDraft.lineupName || "Practice lineup");
          setLineupSnapshot(storedDraft.lineupSnapshot ?? null);
          setRebuildNeeded(Boolean(storedDraft.rebuildNeeded));
        } else {
          setPaddlers(Array.isArray(storedRoster) ? normalizeRoster(storedRoster) : []);
        }
      } catch {
        setPaddlers([]);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const closeOverlays = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRosterOpen(false);
        setSavedOpen(false);
        setEditing(null);
        setPrintOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1) as HTMLElement;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", closeOverlays);
    return () => window.removeEventListener("keydown", closeOverlays);
  }, []);

  useEffect(() => {
    const open = rosterOpen || savedOpen || Boolean(editing) || printOpen;
    if (open && !dialogWasOpen.current) lastDialogTrigger.current = document.activeElement as HTMLElement;
    if (!open && dialogWasOpen.current) window.requestAnimationFrame(() => lastDialogTrigger.current?.focus());
    dialogWasOpen.current = open;
  }, [editing, printOpen, rosterOpen, savedOpen]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(ROSTER_KEY, JSON.stringify(paddlers));
  }, [paddlers, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const draft: BoatDraft = {
      version: 1,
      paddlers,
      boatCount,
      strategy,
      compositionRule,
      boats,
      spares,
      lineupName,
      lineupSnapshot,
      rebuildNeeded,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    if (sessionId) updateSession(window.localStorage, sessionId, {
      title: sessionTitle,
      date: sessionDate,
      attendance: paddlers.filter((paddler) => paddler.participating).map((paddler) => paddler.id),
      boatPlan: { boatCount, strategy, compositionRule, boats, spares: spares.map((paddler) => paddler.id), lineupName, lineupSnapshot, rebuildNeeded },
    });
  }, [boatCount, boats, compositionRule, hydrated, lineupName, lineupSnapshot, paddlers, rebuildNeeded, sessionDate, sessionId, sessionTitle, spares, strategy]);

  const participating = useMemo(() => paddlers.filter((paddler) => paddler.participating && paddler.sessionRole === "Paddler"), [paddlers]);
  const paddlerMap = useMemo(() => new Map(paddlers.map((paddler) => [paddler.id, paddler])), [paddlers]);
  const filteredPaddlers = useMemo(() => paddlers.filter((paddler) => paddler.name.toLowerCase().includes(search.toLowerCase())), [paddlers, search]);

  function derivedLineup(nextBoats: Boat[], roster: Paddler[], rule: CompositionRule) {
    const map = new Map(roster.map((paddler) => [paddler.id, paddler]));
    const attending = roster.filter((paddler) => paddler.participating);
    const refreshed = nextBoats.map((boat) => ({
      ...boat,
      seats: boat.seats.map((seat) => ({
        ...seat,
        leftId: seat.leftId && map.get(seat.leftId)?.participating ? seat.leftId : null,
        rightId: seat.rightId && map.get(seat.rightId)?.participating ? seat.rightId : null,
        leftLocked: Boolean(seat.leftId && map.get(seat.leftId)?.participating && seat.leftLocked),
        rightLocked: Boolean(seat.rightId && map.get(seat.rightId)?.participating && seat.rightLocked),
      })),
    }));
    refreshed.forEach((boat) => { boat.warnings = boatWarnings(boat, map, rule); });
    const assigned = new Set(refreshed.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
    return { boats: refreshed, spares: attending.filter((paddler) => !assigned.has(paddler.id)) };
  }

  function replaceRoster(next: Paddler[], options: { clearLineup?: boolean } = {}) {
    setPaddlers(next);
    if (options.clearLineup) {
      setBoats([]);
      setSpares([]);
      setLineupSnapshot(null);
      setRebuildNeeded(false);
      setUndoStack([]);
      setRedoStack([]);
      return;
    }
    if (boats.length) {
      const derived = derivedLineup(boats, next, compositionRule);
      setBoats(derived.boats);
      setSpares(derived.spares);
      setRebuildNeeded(true);
    }
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
      replaceRoster(next, { clearLineup: true });
      setRosterOpen(true);
      setError("");
      const attending = next.filter((paddler) => paddler.participating).length;
      showNotice(`${next.length} paddlers imported · ${attending} participating`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That roster could not be imported.");
    }
  }

  function downloadCsvTemplate() {
    const example = ["Example Paddler", true, "Paddler", "Paddler", "Either", false, "", "Any", "Unconfirmed", "Unknown", "Unknown", "", "", "", "", "", "", "Low", "", "", "Any", "", "", "Leave ratings blank when unknown"];
    downloadText("kdbc-roster-template.csv", `${CSV_HEADERS.join(",")}\n${example.map(csvCell).join(",")}\n`);
    showNotice("CSV template downloaded");
  }

  function exportRoster() {
    const rows = paddlers.map((paddler) => [
      paddler.name,
      paddler.participating,
      paddler.sessionRole,
      paddler.eligibleRoles.join(";"),
      paddler.sidePref,
      paddler.sideExclusive,
      paddler.weightKg,
      paddler.preferredPosition,
      paddler.eventEligibility,
      paddler.gender,
      paddler.experience,
      ...RATING_KEYS.map((key) => paddler.ratings[key]),
      paddler.ratingAssessedAt,
      paddler.ratingConfidence,
      paddler.mustPairWith,
      paddler.avoidPairWith,
      paddler.rowRestriction,
      paddler.accommodation,
      paddler.constraintExpiresAt,
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
      setLineupSnapshot({ boatCount, strategy, compositionRule, generatedAt: new Date().toISOString() });
      setRebuildNeeded(false);
      setUndoStack([]);
      setRedoStack([]);
      if (result.spares.length) showNotice(`${result.boats.length} boat${result.boats.length === 1 ? "" : "s"} built · ${result.spares.length} paddler${result.spares.length === 1 ? "" : "s"} kept as spares`);
      window.setTimeout(() => document.getElementById("boat-lineups")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The boats could not be generated.");
    }
  }

  function changeCompositionRule(nextRule: CompositionRule) {
    setCompositionRule(nextRule);
    setBoats((current) => current.map((boat) => ({ ...boat, warnings: boatWarnings(boat, paddlerMap, nextRule) })));
    if (boats.length && lineupSnapshot?.compositionRule !== nextRule) setRebuildNeeded(true);
  }

  function changeBoatCount(nextCount: number) {
    setBoatCount(nextCount);
    if (boats.length && lineupSnapshot?.boatCount !== nextCount) setRebuildNeeded(true);
  }

  function changeStrategy(nextStrategy: Strategy) {
    setStrategy(nextStrategy);
    if (boats.length && lineupSnapshot?.strategy !== nextStrategy) setRebuildNeeded(true);
  }

  function setBoatRole(boatIndex: number, role: "steerId" | "drummerId", paddlerId: string) {
    const next = structuredClone(boats) as Boat[];
    next.forEach((boat, index) => {
      if (index !== boatIndex && boat[role] === paddlerId) boat[role] = null;
    });
    next[boatIndex][role] = paddlerId || null;
    finishBoatEdit(next);
  }

  function applySubstitution() {
    if (!substitutionOutId || !substitutionInId || substitutionOutId === substitutionInId) {
      setError("Choose the unavailable paddler and a different replacement.");
      return;
    }
    const nextBoats = structuredClone(boats) as Boat[];
    let changed = false;
    let constraintError = "";
    nextBoats.forEach((boat) => boat.seats.forEach((seat) => {
      if (seat.leftId === substitutionOutId) {
        const replacement = paddlerMap.get(substitutionInId);
        if (replacement?.sideExclusive && replacement.sidePref === "R") { constraintError = `${replacement.name} is right-side only and cannot fill the left seat.`; return; }
        seat.leftId = substitutionInId;
        changed = true;
      }
      if (seat.rightId === substitutionOutId) {
        const replacement = paddlerMap.get(substitutionInId);
        if (replacement?.sideExclusive && replacement.sidePref === "L") { constraintError = `${replacement.name} is left-side only and cannot fill the right seat.`; return; }
        seat.rightId = substitutionInId;
        changed = true;
      }
    }));
    if (constraintError) {
      setError(constraintError);
      return;
    }
    if (!changed) {
      setError("The unavailable paddler is not currently seated.");
      return;
    }
    try {
      if (!substitutionBaseline) setSubstitutionBaseline({ boats: structuredClone(boats) as Boat[], paddlers: structuredClone(paddlers) as Paddler[] });
      const nextRoster = paddlers.map((paddler) => paddler.id === substitutionOutId ? { ...paddler, participating: false, sessionRole: "Unavailable" as SessionRole } : paddler.id === substitutionInId ? { ...paddler, participating: true, sessionRole: "Paddler" as SessionRole } : paddler);
      const derived = derivedLineup(nextBoats, nextRoster, compositionRule);
      setPaddlers(nextRoster);
      setBoats(derived.boats);
      setSpares(derived.spares);
      setChangedPaddlerIds([substitutionOutId, substitutionInId]);
      setSubstitutionOutId("");
      setSubstitutionInId("");
      setError("");
      showNotice("Substitution applied with all other seats preserved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The substitution could not be applied.");
    }
  }

  function undoSubstitution() {
    if (!substitutionBaseline) return;
    setPaddlers(substitutionBaseline.paddlers);
    const derived = derivedLineup(substitutionBaseline.boats, substitutionBaseline.paddlers, compositionRule);
    setBoats(derived.boats);
    setSpares(derived.spares);
    setSubstitutionBaseline(null);
    setChangedPaddlerIds([]);
    showNotice("Entire substitution undone");
  }

  function toggleLock(boatIndex: number, rowIndex: number, side: SeatSide) {
    setBoats((current) => current.map((boat, bIndex) => bIndex !== boatIndex ? boat : {
      ...boat,
      seats: boat.seats.map((seat, sIndex) => sIndex !== rowIndex ? seat : { ...seat, [side === "left" ? "leftLocked" : "rightLocked"]: !seat[side === "left" ? "leftLocked" : "rightLocked"] }),
    }));
  }

  function finishBoatEdit(next: Boat[], options: { recordHistory?: boolean } = {}) {
    const derived = derivedLineup(next, paddlers, compositionRule);
    if (options.recordHistory !== false && boats.length) {
      setUndoStack((current) => [...current.slice(-9), structuredClone(boats) as Boat[][][number]]);
      setRedoStack([]);
    }
    setBoats(derived.boats);
    setSpares(derived.spares);
  }

  function movePaddlerToSeat(paddlerId: string, boatIndex: number, rowIndex: number, side: SeatSide) {
    const paddler = paddlerMap.get(paddlerId);
    if (!paddler) return;
    const requiredSide = side === "left" ? "L" : "R";
    if (paddler.sideExclusive && paddler.sidePref !== "Either" && paddler.sidePref !== requiredSide) {
      setError(`${paddler.name} is marked ${paddler.sidePref === "L" ? "left" : "right"}-side only.`);
      return;
    }
    const targetRow = boats[boatIndex]?.seats[rowIndex]?.row;
    if (targetRow && paddler.rowRestriction !== "Any" && paddler.rowRestriction !== zoneForRow(targetRow)) {
      setError(`${paddler.name} is restricted to the ${paddler.rowRestriction.toLowerCase()} section.`);
      return;
    }

    const currentKey = side === "left" ? "leftId" : "rightId";
    const next = structuredClone(boats) as Boat[];
    const targetSeat = next[boatIndex]?.seats[rowIndex];
    if (!targetSeat) return;
    const displacedId = targetSeat[currentKey];
    if (displacedId === paddlerId) return;

    let sourceBoatIndex = -1;
    let sourceRowIndex = -1;
    let sourceKey: "leftId" | "rightId" | null = null;
    for (let bIndex = 0; bIndex < next.length; bIndex += 1) {
      for (let sIndex = 0; sIndex < next[bIndex].seats.length; sIndex += 1) {
        const sourceSeat = next[bIndex].seats[sIndex];
        if (sourceSeat.leftId === paddlerId) {
          sourceBoatIndex = bIndex;
          sourceRowIndex = sIndex;
          sourceKey = "leftId";
        } else if (sourceSeat.rightId === paddlerId) {
          sourceBoatIndex = bIndex;
          sourceRowIndex = sIndex;
          sourceKey = "rightId";
        }
      }
    }

    const sourceFound = sourceKey !== null && sourceBoatIndex >= 0 && sourceRowIndex >= 0;
    if (sourceFound && sourceKey) next[sourceBoatIndex].seats[sourceRowIndex][sourceKey] = displacedId;
    targetSeat[currentKey] = paddlerId;
    finishBoatEdit(next);
    setError("");
    if (!sourceFound && displacedId) showNotice(`${paddler.name} moved into the boat; ${paddlerMap.get(displacedId)?.name ?? "previous paddler"} moved to the bench`);
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

  function undoBoatEdit() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-9), structuredClone(boats) as Boat[]]);
    finishBoatEdit(structuredClone(previous) as Boat[], { recordHistory: false });
    showNotice("Seating change undone");
  }

  function redoBoatEdit() {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-9), structuredClone(boats) as Boat[]]);
    finishBoatEdit(structuredClone(next) as Boat[], { recordHistory: false });
    showNotice("Seating change redone");
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
      strategy: lineupSnapshot?.strategy ?? strategy,
      compositionRule: lineupSnapshot?.compositionRule ?? compositionRule,
      snapshot: lineupSnapshot ?? { boatCount, strategy, compositionRule, generatedAt: new Date().toISOString() },
      boats: structuredClone(boats),
      sessionId,
    };
    const next = [saved, ...savedLineups].slice(0, 20);
    setSavedLineups(next);
    window.localStorage.setItem(LINEUPS_KEY, JSON.stringify(next));
    showNotice("Lineup saved on this device");
  }

  function loadLineup(saved: SavedLineup) {
    const restored = derivedLineup(normalizeBoats(saved.boats), paddlers, saved.compositionRule);
    setBoats(restored.boats);
    setBoatCount(saved.snapshot?.boatCount ?? saved.boats.length);
    setStrategy(saved.strategy);
    setCompositionRule(saved.compositionRule);
    setLineupName(saved.name);
    setLineupSnapshot(saved.snapshot ?? { boatCount: saved.boats.length, strategy: saved.strategy, compositionRule: saved.compositionRule, generatedAt: new Date().toISOString() });
    setRebuildNeeded(false);
    setUndoStack([]);
    setRedoStack([]);
    const assigned = new Set(saved.boats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean));
    setSpares(paddlers.filter((paddler) => paddler.participating && paddler.sessionRole === "Paddler" && !assigned.has(paddler.id)));
    setSavedOpen(false);
    showNotice("Saved lineup loaded using current paddler profiles");
  }

  function duplicateLineup(saved: SavedLineup) {
    const copy = { ...structuredClone(saved), id: String(Date.now()), name: `${saved.name} copy`, savedAt: new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) };
    const next = [copy, ...savedLineups].slice(0, 20);
    setSavedLineups(next);
    window.localStorage.setItem(LINEUPS_KEY, JSON.stringify(next));
    showNotice("Lineup duplicated");
  }

  function renameLineup(saved: SavedLineup) {
    const name = window.prompt("Rename saved lineup", saved.name)?.trim();
    if (!name) return;
    const next = savedLineups.map((item) => item.id === saved.id ? { ...item, name } : item);
    setSavedLineups(next);
    window.localStorage.setItem(LINEUPS_KEY, JSON.stringify(next));
    showNotice("Lineup renamed");
  }

  function deleteLineup(id: string) {
    const next = savedLineups.filter((saved) => saved.id !== id);
    setSavedLineups(next);
    window.localStorage.setItem(LINEUPS_KEY, JSON.stringify(next));
    showNotice("Lineup deleted");
  }

  async function copyLineup() {
    const output = [
      lineupName.toUpperCase(),
      `${strategyText}${rebuildNeeded ? " · rebuild recommended" : ""} · ${boats.length} boat${boats.length === 1 ? "" : "s"}`,
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

  function openPrintOptions() {
    setPrintDate(sessionDate || new Date().toISOString().slice(0, 10));
    setPrintOpen(true);
  }

  function printBoatPlan(variant: BoatPrintVariant) {
    setPrintVariant(variant);
    setPrintOpen(false);
    window.setTimeout(() => window.print(), 80);
  }

  const assignedPaddlers = [...new Set(boats.flatMap((boat) => boat.seats.flatMap((seat) => [seat.leftId, seat.rightId])).filter(Boolean) as string[])];
  const selectablePaddlers = [...participating].sort((a, b) => a.name.localeCompare(b.name));
  const plannedSeats = Math.min(Math.floor(participating.length / 2) * 2, boatCount * 20);
  const potentialSpares = Math.max(0, participating.length - plannedSeats);
  const printedStrategy = lineupSnapshot?.strategy ?? strategy;
  const strategyText = printedStrategy === "balanced" ? "Balanced boats" : "Strongest-first";
  const steerCandidates = paddlers.filter((paddler) => paddler.participating && paddler.sessionRole === "Steer");
  const drummerCandidates = paddlers.filter((paddler) => paddler.participating && paddler.sessionRole === "Drummer");
  const seatedForSubstitution = assignedPaddlers.map((id) => paddlerMap.get(id)).filter(Boolean) as Paddler[];

  return (
    <section className={`boat-planner-shell boat-display-${boatDisplay}`}>
      <div className="boat-hero">
        <div>
          <p className="eyebrow">Boat planning console</p>
          <h1>Build the boats, then coach the crew.</h1>
          <p>Import attendance, apply your coaching ratings, and generate 1–4 complete-pair lineups without surrendering coaching judgment.</p>
          <div className="active-session-chip"><span>Active session</span><strong>{sessionTitle}</strong><small>{sessionDate || "Date not set"}</small></div>
        </div>
        <div className="privacy-card"><span aria-hidden="true">⌂</span><div><strong>Device-only roster</strong><p>Names, weights, ratings, and saved lineups stay in this browser. Nothing is uploaded to the public site.</p></div></div>
      </div>

      <section className="display-switcher-wrap boat-display-switcher" aria-label="Boat planner display">
        <div className="display-switcher-copy"><span>Display</span><strong>Boat planner</strong></div>
        <div className="display-switcher" role="group" aria-label="Boat planner display options">
          {([
            ["planner", "Full planner", "Setup + seating"],
            ["seating", "Seating board", "Drag-and-drop focus"],
            ["analysis", "Coach analysis", "Profiles + checks"],
            ["compact", "Compact", "Multi-boat view"],
          ] as [BoatDisplay, string, string][]).map(([value, label, description]) => (
            <button aria-pressed={boatDisplay === value} className={boatDisplay === value ? "active" : ""} key={value} onClick={() => setBoatDisplay(value)} type="button"><strong>{label}</strong><small>{description}</small></button>
          ))}
        </div>
        <div className="theme-picker" role="group" aria-label="Console colour theme">
          {([
            ["dark", "Dark", "Performance navy"],
            ["light", "Light", "Club white"],
            ["neo", "Neo", "Modern minimal"],
          ] as [ConsoleTheme, string, string][]).map(([value, label, description]) => (
            <button aria-pressed={theme === value} className={theme === value ? "active" : ""} key={value} onClick={() => onThemeChange(value)} title={description} type="button">
              <i className={`theme-swatch theme-swatch-${value}`} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="planner-setup-grid">
        <section className="setup-card roster-setup-card">
          <div className="setup-heading"><div><span>1</span><h2>Roster & attendance</h2></div><b>{participating.length} paddling</b></div>
          {paddlers.length ? (
            <>
              <div className="roster-stat-row"><div><strong>{paddlers.length}</strong><small>Total roster</small></div><div><strong>{paddlers.filter((p) => p.sideExclusive).length}</strong><small>Side-required</small></div><div><strong>{paddlers.filter((p) => p.weightKg).length}</strong><small>Known weights</small></div><div><strong>{paddlers.filter((p) => p.sessionRole === "Steer" || p.sessionRole === "Drummer").length}</strong><small>Boat officials</small></div></div>
              <div className="setup-actions"><button onClick={() => setRosterOpen(true)} type="button">Manage roster</button><label className="file-button">Replace roster<input accept=".json,.csv,text/csv,application/json" onChange={importRoster} type="file" /></label><button onClick={() => setEditing(newPaddler())} type="button">+ Add paddler</button><button onClick={exportRoster} type="button">Export CSV</button></div>
            </>
          ) : (
            <div className="import-empty"><span aria-hidden="true">⇧</span><h3>Load your working roster</h3><p>Import the KDBC JSON file or a CSV. Missing weights, preferences, and ratings are allowed.</p><div><label className="file-button primary">Import JSON or CSV<input accept=".json,.csv,text/csv,application/json" onChange={importRoster} type="file" /></label><button onClick={() => setEditing(newPaddler())} type="button">Start manually</button><button onClick={downloadCsvTemplate} type="button">CSV template</button></div></div>
          )}
        </section>

        <section className="setup-card">
          <div className="setup-heading"><div><span>2</span><h2>Boat setup</h2></div></div>
          <div className="boat-count-row" role="group" aria-label="Number of boats">
            {[1, 2, 3, 4].map((count) => <button className={boatCount === count ? "active" : ""} key={count} onClick={() => changeBoatCount(count)} type="button"><strong>{count}</strong><small>{count === 1 ? "boat" : "boats"}</small></button>)}
          </div>
          <label className="planner-field"><span>Lineup name</span><input onChange={(event) => setLineupName(event.target.value)} value={lineupName} /></label>
          <p className="capacity-note">Requires at least {boatCount * 10} paddlers; maximum {boatCount * 20}. Odd or excess paddlers become spares.</p>
        </section>

        <section className="setup-card">
          <div className="setup-heading"><div><span>3</span><h2>Recommendation</h2></div></div>
          <div className="strategy-toggle" role="group" aria-label="Boat strategy">
            <button className={strategy === "balanced" ? "active" : ""} onClick={() => changeStrategy("balanced")} type="button"><strong>Balanced boats</strong><small>Distribute overall crew strength</small></button>
            <button className={strategy === "strongest" ? "active" : ""} onClick={() => changeStrategy("strongest")} type="button"><strong>Strongest-first</strong><small>Rank Boat 1 before the next</small></button>
          </div>
          <label className="planner-field"><span>Event rule preset</span><select onChange={(event) => changeCompositionRule(event.target.value as CompositionRule)} value={compositionRule}><option value="count">KDBC training — counts only</option><option value="mixed">Mixed event — at least 50% women-eligible</option><option value="women">Women’s event — confirmed eligibility</option></select></label>
          <p className="capacity-note">Unconfirmed eligibility does not block boat creation. Event boats remain provisional until the required eligibility is confirmed; explicit conflicts still stop a non-compliant lineup.</p>
        </section>
      </div>

      {error && <div className="planner-error" role="alert"><span>!</span>{error}<button aria-label="Dismiss error" onClick={() => setError("")} type="button">×</button></div>}

      <div className="planner-build-row">
        <div><strong>{participating.length} ready to place</strong><span>{plannedSeats} seats · {potentialSpares} potential spare{potentialSpares === 1 ? "" : "s"}</span></div>
        <button disabled={!paddlers.length} onClick={generate} type="button">Build {boatCount === 1 ? "boat" : `${boatCount} boats`} →</button>
      </div>

      {boats.length > 0 && (
        <section className="lineup-section" id="boat-lineups">
          {rebuildNeeded && (
            <div className="rebuild-banner" role="status">
              <strong>Settings or attendance changed.</strong>
              <span>The current seats are preserved, but rebuild unlocked seats before treating this as a fresh recommendation.</span>
              <button onClick={generate} type="button">Rebuild now</button>
            </div>
          )}
          <div className="lineup-heading">
            <div><p className="eyebrow">Coach review required</p><h2>{lineupName}</h2><p>Drag paddlers between seats and boats, or drag them back to the roster bench. Lock seats only when you want to protect them from a rebuild.</p></div>
            <div className="lineup-actions"><button onClick={generate} type="button">↻ Rebuild unlocked</button><button onClick={clearSeatsForManualPlanning} type="button">Start manual</button><button disabled={!undoStack.length} onClick={undoBoatEdit} type="button">↶ Undo</button><button disabled={!redoStack.length} onClick={redoBoatEdit} type="button">↷ Redo</button><button onClick={saveLineup} type="button">♡ Save</button><button onClick={copyLineup} type="button">▣ Copy</button><button onClick={openPrintOptions} type="button">▤ Print</button><button onClick={() => setSavedOpen(true)} type="button">Saved lineups</button></div>
          </div>

          <section className="substitution-panel" aria-label="Dockside substitution">
            <div><p className="eyebrow">Dockside change</p><h3>Replace one paddler without rebuilding the boat</h3><p>The selected replacement takes the same seat. Every other paddler stays in place, and all changes are highlighted.</p></div>
            <label><span>Unavailable / late</span><select onChange={(event) => setSubstitutionOutId(event.target.value)} value={substitutionOutId}><option value="">Choose seated paddler…</option>{seatedForSubstitution.sort((a, b) => a.name.localeCompare(b.name)).map((paddler) => <option key={paddler.id} value={paddler.id}>{paddler.name}</option>)}</select></label>
            <label><span>Replacement</span><select onChange={(event) => setSubstitutionInId(event.target.value)} value={substitutionInId}><option value="">Choose roster bench…</option>{[...spares].sort((a, b) => a.name.localeCompare(b.name)).map((paddler) => <option key={paddler.id} value={paddler.id}>{paddler.name} · {paddler.sideExclusive ? `${paddler.sidePref} only` : `Pref ${paddler.sidePref}`}</option>)}</select></label>
            <div className="substitution-actions"><button onClick={applySubstitution} type="button">Apply one-seat change</button><button disabled={!substitutionBaseline} onClick={undoSubstitution} type="button">Undo whole substitution</button></div>
            {changedPaddlerIds.length > 0 && <p className="substitution-summary">Revised lineup: {changedPaddlerIds.map((id) => paddlerMap.get(id)?.name).filter(Boolean).join(" → ")}. All other seats are unchanged.</p>}
          </section>

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
              const womenEligible = members.filter((paddler) => paddler.eventEligibility === "Women").length;
              const profile = profileForBoat(boat, paddlerMap);
              const trim = trimForBoat(boat, paddlerMap);
              const dataConfidence = boatDataConfidence(boat, paddlerMap);
              const quality = recommendationQuality(boat, paddlerMap);
              const status = constraintStatus(boat);
              return (
                <article className="boat-card" key={boat.id}>
                  <header><div><span>Constraint-aware recommendation</span><h3>{boat.name}</h3></div><div className="boat-score"><strong>{quality}%</strong><small>recommendation quality</small></div></header>
                  <div className="boat-metrics"><span><b>{members.length}</b> paddlers</span><span><b>{womenEligible}</b> women-eligible</span><span><b>{dataConfidence}%</b> data confidence</span><span className={`constraint-status status-${status.toLowerCase()}`}><b>{status}</b> constraints</span></div>
                  <div className="boat-role-assignments"><label><span>Steer</span><select onChange={(event) => setBoatRole(boatIndex, "steerId", event.target.value)} value={boat.steerId ?? ""}><option value="">Unassigned</option>{steerCandidates.map((paddler) => <option key={paddler.id} value={paddler.id}>{paddler.name}</option>)}</select></label><label><span>Drummer</span><select onChange={(event) => setBoatRole(boatIndex, "drummerId", event.target.value)} value={boat.drummerId ?? ""}><option value="">Unassigned</option>{drummerCandidates.map((paddler) => <option key={paddler.id} value={paddler.id}>{paddler.name}</option>)}</select></label></div>
                  <div className="boat-profile" aria-label={`${boat.name} section profile`}>
                    <div><span>Front</span><strong>{formatProfile(profile.front)}</strong><small>Timing · connection · consistency</small></div>
                    <div><span>Middle</span><strong>{formatProfile(profile.middle)}</strong><small>Power · connection · consistency</small></div>
                    <div><span>Back</span><strong>{formatProfile(profile.back)}</strong><small>Stability · timing · consistency</small></div>
                  </div>
                  <div className={`trim-analysis ${trim.reliable ? "trim-reliable" : "trim-uncertain"}`}>
                    <div><span>Weight coverage</span><strong>{trim.coverage}%</strong><small>{trim.reliable ? "Trim estimate available" : "At least 70% needed"}</small></div>
                    <div><span>Left ↔ right</span><strong>{trim.reliable ? `${Math.abs(trim.left - trim.right).toFixed(1)} kg` : "Uncertain"}</strong><small>{trim.reliable ? (trim.left > trim.right ? "Left heavier" : trim.right > trim.left ? "Right heavier" : "Even") : "Collect more weights"}</small></div>
                    <div><span>Bow ↔ stern</span><strong>{trim.reliable ? `${Math.abs(trim.bow - trim.stern).toFixed(1)} kg` : "Uncertain"}</strong><small>{trim.reliable ? (trim.bow > trim.stern ? "Bow heavier" : trim.stern > trim.bow ? "Stern heavier" : "Even") : "No false precision"}</small></div>
                    <div><span>Centre row</span><strong>{trim.reliable && trim.centreRow ? trim.centreRow.toFixed(1) : "—"}</strong><small>{trim.reliable ? "Known-weight estimate" : "Not calculated"}</small></div>
                  </div>
                  <div className="interactive-boat-shell">
                    <div className="interactive-bow" aria-hidden="true"><span /><b>Bow</b></div>
                    <div className="interactive-hull">
                  <div className="seat-head"><span>Left</span><b>Seat pair</b><span>Right</span></div>
                  <div className="seat-plan">
                    {boat.seats.map((seat, rowIndex) => seat.active ? (
                      <div className="seat-row" key={seat.row}>
                        {(["left", "right"] as const).map((side, sideIndex) => {
                          const id = side === "left" ? seat.leftId : seat.rightId;
                          const locked = side === "left" ? seat.leftLocked : seat.rightLocked;
                          const paddler = id ? paddlerMap.get(id) : undefined;
                          const targetKey = `${boatIndex}-${rowIndex}-${side}`;
                          return <div
                            className={`seat-cell ${locked ? "locked" : ""} ${paddler ? "has-paddler" : ""} ${id && changedPaddlerIds.includes(id) ? "substitution-changed" : ""} ${draggingId === id ? "is-dragging" : ""} ${dropTarget === targetKey ? "drop-target" : ""}`}
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
                            {paddler && <details className="seat-reason"><summary>Why this seat?</summary><p>{seatReason(paddler, seat, side === "left" ? "L" : "R")}</p></details>}
                          </div>;
                        })}
                        <div className="row-number" style={{ order: 1 }}><strong>{seat.row}</strong><span>{zoneForRow(seat.row)}</span></div>
                      </div>
                    ) : <div className="empty-row" key={seat.row}><span /> <b>{seat.row}</b> <span /></div>)}
                  </div>
                  <div className="stern-label"><span />Stern</div>
                    </div>
                  </div>
                  <div className={`boat-checks ${boat.warnings.length ? "has-warnings" : ""}`}><strong>{boat.warnings.length ? `${boat.warnings.length} check${boat.warnings.length === 1 ? "" : "s"}` : "No major flags"}</strong>{boat.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
                </article>
              );
            })}
          </div>
          <div className="planner-truth"><strong>Coach check</strong><p>The optimizer enforces recorded constraints first, then improves section strength and trim. It cannot replace an on-water hull check or information that has not been entered; unresolved conflicts remain visible for coach judgment.</p></div>
        </section>
      )}

      {rosterOpen && (
        <div className="drawer-backdrop" onMouseDown={() => setRosterOpen(false)}>
          <aside aria-label="Manage roster" aria-modal="true" className="roster-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <div className="drawer-heading"><div><p className="eyebrow">Stored on this device</p><h2>Manage roster</h2></div><button aria-label="Close roster" autoFocus onClick={() => setRosterOpen(false)} type="button">×</button></div>
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
          <aside aria-label="Edit paddler" aria-modal="true" className="edit-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <div className="drawer-heading"><div><p className="eyebrow">Coach profile</p><h2>{paddlers.some((item) => item.id === editing.id) ? "Edit paddler" : "Add paddler"}</h2></div><button aria-label="Close editor" onClick={() => setEditing(null)} type="button">×</button></div>
            <div className="edit-form">
              <label className="wide"><span>Name</span><input autoFocus onChange={(event) => setEditing({ ...editing, name: event.target.value })} value={editing.name} /></label>
              <label><span>Preferred side</span><select onChange={(event) => setEditing({ ...editing, sidePref: event.target.value as Side })} value={editing.sidePref}><option>L</option><option>R</option><option>Either</option></select></label>
              <label className="check-field"><input checked={editing.sideExclusive} onChange={(event) => setEditing({ ...editing, sideExclusive: event.target.checked })} type="checkbox" /><span>Side is exclusive</span></label>
              <label><span>Weight (kg)</span><input min="35" onChange={(event) => setEditing({ ...editing, weightKg: asNumber(event.target.value) })} placeholder="Unknown" step="0.1" type="number" value={editing.weightKg ?? ""} /></label>
              <label><span>Preferred position</span><select onChange={(event) => setEditing({ ...editing, preferredPosition: event.target.value as Position })} value={editing.preferredPosition}><option>Any</option><option>Front</option><option>Middle</option><option>Back</option></select></label>
              <label><span>Current session role</span><select onChange={(event) => setEditing({ ...editing, sessionRole: event.target.value as SessionRole })} value={editing.sessionRole}><option>Paddler</option><option>Steer</option><option>Drummer</option><option>Unavailable</option></select></label>
              <label><span>Event eligibility</span><select onChange={(event) => setEditing({ ...editing, eventEligibility: event.target.value as EventEligibility })} value={editing.eventEligibility}><option value="Unconfirmed">Not checked yet</option><option value="Open">Open</option><option value="Mixed">Mixed</option><option value="Women">Women-eligible</option><option value="Ineligible">Ineligible for this event</option></select></label>
              <label><span>Gender (optional; not used for eligibility)</span><select onChange={(event) => setEditing({ ...editing, gender: event.target.value as Gender })} value={editing.gender}><option value="Unknown">Unknown</option><option value="F">Woman / F</option><option value="M">Man / M</option><option value="X">Another category / X</option></select></label>
              <label><span>Experience</span><select onChange={(event) => setEditing({ ...editing, experience: event.target.value as Experience })} value={editing.experience}><option>Unknown</option><option>Developing</option><option>Experienced</option><option>Pacer</option><option>Steer</option></select></label>
              <fieldset className="role-eligibility wide"><legend>Eligible roles</legend>{(["Paddler", "Steer", "Drummer"] as SessionRole[]).map((role) => <label key={role}><input checked={editing.eligibleRoles.includes(role)} onChange={(event) => setEditing({ ...editing, eligibleRoles: event.target.checked ? [...new Set([...editing.eligibleRoles, role])] : editing.eligibleRoles.filter((item) => item !== role) })} type="checkbox" /><span>{role}</span></label>)}</fieldset>
              <div className="constraint-editor wide"><div><strong>Structured constraints</strong><span>Hard constraints are enforced before performance optimization. Add an expiry date for temporary restrictions.</span></div><label><span>Must share boat with</span><select onChange={(event) => setEditing({ ...editing, mustPairWith: event.target.value })} value={editing.mustPairWith}><option value="">None</option>{paddlers.filter((item) => item.id !== editing.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Avoid same boat as</span><select onChange={(event) => setEditing({ ...editing, avoidPairWith: event.target.value })} value={editing.avoidPairWith}><option value="">None</option>{paddlers.filter((item) => item.id !== editing.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Row restriction</span><select onChange={(event) => setEditing({ ...editing, rowRestriction: event.target.value as RowRestriction })} value={editing.rowRestriction}><option>Any</option><option>Front</option><option>Middle</option><option>Back</option></select></label><label><span>Restriction expires</span><input onChange={(event) => setEditing({ ...editing, constraintExpiresAt: event.target.value })} type="date" value={editing.constraintExpiresAt} /></label><label className="wide"><span>Accommodation / safety note</span><input onChange={(event) => setEditing({ ...editing, accommodation: event.target.value })} placeholder="Only information the coach needs for safe placement" value={editing.accommodation} /></label></div>
              <div className="ratings-editor wide"><div><strong>Coaching ratings</strong><span>Each criterion uses observable anchors. Leave unknown until you have enough evidence.</span></div>{RATING_KEYS.map((key) => <label key={key}><span>{RATING_LABELS[key]}</span><select onChange={(event) => setEditing({ ...editing, ratings: { ...editing.ratings, [key]: event.target.value ? Number(event.target.value) : null } })} value={editing.ratings[key] ?? ""}><option value="">Unknown</option>{RATING_ANCHORS[key].map((anchor, index) => <option key={anchor} value={index + 1}>{anchor}</option>)}</select></label>)}<div className="rating-evidence"><label><span>Assessment date</span><input onChange={(event) => setEditing({ ...editing, ratingAssessedAt: event.target.value })} type="date" value={editing.ratingAssessedAt} /></label><label><span>Evidence confidence</span><select onChange={(event) => setEditing({ ...editing, ratingConfidence: event.target.value as RatingConfidence })} value={editing.ratingConfidence}><option>Low</option><option>Medium</option><option>High</option></select></label></div><details className="rating-rubric"><summary>View criterion-specific anchors</summary>{RATING_KEYS.map((key) => <section key={key}><strong>{RATING_LABELS[key]}</strong>{RATING_ANCHORS[key].map((anchor) => <p key={anchor}>{anchor}</p>)}</section>)}</details></div>
              <label className="wide"><span>Coach notes</span><textarea onChange={(event) => setEditing({ ...editing, notes: event.target.value })} placeholder="Recent feedback or context not covered by structured fields…" value={editing.notes} /></label>
              <label className="check-field wide"><input checked={editing.participating} onChange={(event) => setEditing({ ...editing, participating: event.target.checked })} type="checkbox" /><span>Participating in this lineup</span></label>
            </div>
            <div className="edit-actions">{paddlers.some((item) => item.id === editing.id) && <button className="danger" onClick={() => { replaceRoster(paddlers.filter((item) => item.id !== editing.id)); setEditing(null); }} type="button">Remove</button>}<button className="primary" onClick={savePaddler} type="button">Save paddler</button></div>
          </aside>
        </div>
      )}

      {savedOpen && (
        <div className="drawer-backdrop" onMouseDown={() => setSavedOpen(false)}>
          <aside aria-label="Saved lineups" aria-modal="true" className="library-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <div className="drawer-heading"><div><p className="eyebrow">This device</p><h2>Saved lineups</h2></div><button aria-label="Close saved lineups" autoFocus onClick={() => setSavedOpen(false)} type="button">×</button></div>
            {savedLineups.length ? (
              <div className="saved-list saved-list-manage">{savedLineups.map((saved) => (
                <article key={saved.id}>
                  <button onClick={() => loadLineup(saved)} type="button"><span><strong>{saved.name}</strong><small>{saved.boats.length} boat{saved.boats.length === 1 ? "" : "s"} · {saved.savedAt}</small></span><b>Load →</b></button>
                  <div><button onClick={() => renameLineup(saved)} type="button">Rename</button><button onClick={() => duplicateLineup(saved)} type="button">Duplicate</button><button onClick={() => deleteLineup(saved.id)} type="button">Delete</button></div>
                </article>
              ))}</div>
            ) : <div className="empty-state"><span>▱</span><h3>No saved lineups yet</h3><p>Save a generated lineup and it will appear here.</p></div>}
          </aside>
        </div>
      )}

      {printOpen && (
        <div className="print-dialog-backdrop" onMouseDown={() => setPrintOpen(false)}>
          <section className="print-dialog boat-print-dialog" aria-modal="true" aria-labelledby="boat-print-title" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="print-dialog-heading"><div><p className="eyebrow">Print boat plan</p><h2 id="boat-print-title">Choose who will use this lineup</h2></div><button aria-label="Close print options" onClick={() => setPrintOpen(false)} type="button">×</button></div>
            <div className="print-meta-fields">
              <label><span>Lineup date</span><input autoFocus onChange={(event) => setPrintDate(event.target.value)} type="date" value={printDate} /></label>
              <label className="print-notes-field"><span>Print notes (optional)</span><input onChange={(event) => setPrintNotes(event.target.value)} placeholder="Race, crew call, lane, conditions…" value={printNotes} /></label>
            </div>
            <div className="print-choice-grid">
              <button onClick={() => printBoatPlan("crew")} type="button"><span className="print-choice-icon">♙</span><strong>Lineup only — no weights</strong><small>Names, rows, left/right positions, steer, drummer, spares, date, and your print note. No weights or private coaching data.</small><b>Print no-weight lineup →</b></button>
              <button onClick={() => printBoatPlan("coach")} type="button"><span className="print-choice-icon">◎</span><strong>Coach-detail boat card</strong><small>Adds weight, side preference, rating summary, section profile, and lineup warnings.</small><b>Print coach version →</b></button>
            </div>
            <p className="print-dialog-note">Each boat prints on its own landscape Letter page using a top-down dragon boat layout.</p>
          </section>
        </div>
      )}

      {printVariant && (
        <section className={`print-document boat-print-document boat-print-${printVariant}`}>
          {boats.map((boat, boatIndex) => {
            const ids = boat.seats.flatMap((seat) => [seat.leftId, seat.rightId]).filter(Boolean) as string[];
            const members = ids.map((id) => paddlerMap.get(id)).filter(Boolean) as Paddler[];
            const profile = profileForBoat(boat, paddlerMap);
            const trim = trimForBoat(boat, paddlerMap);
            const quality = recommendationQuality(boat, paddlerMap);
            const confidence = boatDataConfidence(boat, paddlerMap);
            return <article className="print-boat-sheet" key={boat.id}>
              <header className="print-brand-header">
                <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/kdbc-logo.jpeg`} alt="Kingston Dragon Boat Club" />
                <div><span>{printVariant === "coach" ? "Coach-detail lineup" : "Crew lineup · no weights"}</span><strong>Boat {boatIndex + 1} of {boats.length}</strong></div>
              </header>
              <div className="boat-print-title"><div><p>{strategyText}{rebuildNeeded ? " · rebuild recommended" : ""} · {members.length} paddlers</p><h1>{lineupName} · {boat.name}</h1></div><div><span>Lineup date</span><strong>{printDate || "Not set"}</strong></div></div>
              {printVariant === "crew" && <div className="crew-print-privacy"><b>Crew-facing copy</b><span>Assignments only — no weights or private coaching information</span></div>}
              {printNotes && <div className="boat-print-note"><b>Coach note</b><span>{printNotes}</span></div>}
              <div className="boat-officials"><span><b>Steer</b>{boat.steerId ? paddlerMap.get(boat.steerId)?.name : "Unassigned"}</span><span><b>Drummer</b>{boat.drummerId ? paddlerMap.get(boat.drummerId)?.name : "Unassigned"}</span></div>

              <div className="dragon-boat-diagram" aria-label={`${boat.name} top-down seating plan`}>
                <div className="dragon-prow" aria-hidden="true"><span>◆</span><b>Bow</b></div>
                <div className="dragon-hull">
                  <span className="hull-side-label hull-left-label">Left side</span>
                  <span className="hull-side-label hull-right-label">Right side</span>
                  {boat.seats.map((seat) => {
                    const left = seat.leftId ? paddlerMap.get(seat.leftId) : undefined;
                    const right = seat.rightId ? paddlerMap.get(seat.rightId) : undefined;
                    return <div className={`print-boat-row ${seat.active ? "active" : "inactive"}`} key={seat.row}>
                      <div className="print-seat print-seat-left"><strong>{left?.name || "Vacant"}</strong>{printVariant === "coach" && left && <small>{left.weightKg ? `${left.weightKg} kg` : "Wt ?"} · {left.sideExclusive ? `${left.sidePref} only` : `Pref ${left.sidePref}`} · {ratingCoverage(left) ? composite(left).toFixed(1) : "Rating ?"}</small>}</div>
                      <span className="print-row-number"><b>{seat.row}</b><small>{zoneForRow(seat.row)}</small></span>
                      <div className="print-seat print-seat-right"><strong>{right?.name || "Vacant"}</strong>{printVariant === "coach" && right && <small>{right.weightKg ? `${right.weightKg} kg` : "Wt ?"} · {right.sideExclusive ? `${right.sidePref} only` : `Pref ${right.sidePref}`} · {ratingCoverage(right) ? composite(right).toFixed(1) : "Rating ?"}</small>}</div>
                    </div>;
                  })}
                </div>
                <div className="dragon-stern" aria-hidden="true"><b>Stern</b><span /></div>
              </div>

              {printVariant === "coach" && <div className="coach-print-summary"><div><span>Recommendation</span><strong>{quality}%</strong></div><div><span>Data confidence</span><strong>{confidence}%</strong></div><div><span>Constraint status</span><strong>{constraintStatus(boat)}</strong></div><div><span>Side trim</span><strong>{trim.reliable ? `${Math.abs(trim.left - trim.right).toFixed(1)} kg` : "Uncertain"}</strong></div><div><span>Weight coverage</span><strong>{trim.coverage}%</strong></div><div><span>Front</span><strong>{formatProfile(profile.front)}</strong></div><div><span>Middle</span><strong>{formatProfile(profile.middle)}</strong></div><div><span>Back</span><strong>{formatProfile(profile.back)}</strong></div></div>}

              <div className="boat-print-footer-grid">
                <section><b>Spares / roster bench</b><p>{spares.length ? spares.map((paddler) => paddler.name).join(" · ") : "No spares listed"}</p></section>
                {printVariant === "coach" ? <section className={boat.warnings.length ? "warning" : ""}><b>{boat.warnings.length ? "Coach checks" : "Lineup checks"}</b><p>{boat.warnings.length ? boat.warnings.join(" ") : "No major flags. Confirm trim once the crew is aboard."}</p></section> : <section><b>Crew reminder</b><p>Confirm your side and row before loading. Follow the coach or steer&apos;s final direction at the dock.</p></section>}
              </div>
              <footer className="print-page-footer"><span>KDBC Coach Tools</span><span>{lineupName} · {boat.name}</span></footer>
            </article>;
          })}
        </section>
      )}

      {notice && <div className="toast" role="status">✓ {notice}</div>}
      {touchDrag && <div className="touch-drag-preview" style={{ left: touchDrag.x, top: touchDrag.y }}>{paddlerMap.get(touchDrag.paddlerId)?.name ?? "Paddler"}</div>}
    </section>
  );
}
