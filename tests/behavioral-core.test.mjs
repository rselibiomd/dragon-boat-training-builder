import assert from "node:assert/strict";
import test from "node:test";
import { allocateBoatUnits, calculateTrim, evaluateEventEligibility, evidenceConfidence, replaceOneSeat, validateSeatAssignments } from "../app/boat-intelligence-core.ts";
import { DATA_SCHEMA_VERSION, mergeSession, migrateLegacySession, parseSessionStore, validateBackupData } from "../app/session-store.ts";

const paddler = (id, patch = {}) => ({
  id,
  sidePref: "Either",
  sideExclusive: false,
  weightKg: 75,
  ratings: { timing: 3, connection: 3, power: 3, stability: 3, consistency: 3 },
  ratingAssessedAt: "2026-07-01",
  ratingConfidence: "High",
  ...patch,
});

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  clear() { this.#data.clear(); }
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  removeItem(key) { this.#data.delete(key); }
  setItem(key, value) { this.#data.set(key, String(value)); }
}

test("session records merge training, boat, and review without splitting identity", () => {
  const first = mergeSession([], "session-1", { title: "Monday", date: "2026-08-10", training: { focus: "Endurance" } });
  const second = mergeSession(first, "session-1", { boatPlan: { boats: 2 }, review: { status: "completed" } });
  assert.equal(second.length, 1);
  assert.equal(second[0].id, "session-1");
  assert.deepEqual(second[0].training, { focus: "Endurance" });
  assert.deepEqual(second[0].boatPlan, { boats: 2 });
  assert.deepEqual(second[0].review, { status: "completed" });
});

test("legacy Release 1/2 drafts migrate into one version 3 session", () => {
  const storage = new MemoryStorage();
  storage.setItem("kdbc-active-session-v2", JSON.stringify({ title: "Power night", sessionDate: "2026-08-12", notes: "wind" }));
  storage.setItem("kdbc-boat-draft-v1", JSON.stringify({ boats: [{ id: "boat-1" }] }));
  const id = migrateLegacySession(storage);
  const sessions = parseSessionStore(storage.getItem("kdbc-sessions-v3"));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, id);
  assert.equal(sessions[0].title, "Power night");
  assert.equal(storage.getItem("kdbc-data-schema-version"), String(DATA_SCHEMA_VERSION));
});

test("backup validation rejects foreign keys and migrates recognized data", () => {
  assert.throws(() => validateBackupData({ "unrelated-secret": "x" }), /invalid keys/i);
  const validated = validateBackupData({ "kdbc-boat-roster-v1": "[]" });
  assert.equal(validated["kdbc-data-schema-version"], String(DATA_SCHEMA_VERSION));
});

test("trim remains uncertain below 70 percent weight coverage", () => {
  const seats = [
    { row: 1, active: true, leftId: "a", rightId: "b" },
    { row: 2, active: true, leftId: "c", rightId: "d" },
  ];
  const uncertain = calculateTrim(seats, [paddler("a"), paddler("b", { weightKg: null }), paddler("c", { weightKg: null }), paddler("d", { weightKg: null })]);
  assert.equal(uncertain.coverage, 25);
  assert.equal(uncertain.reliable, false);
  const reliable = calculateTrim(seats, [paddler("a"), paddler("b", { weightKg: 80 }), paddler("c", { weightKg: 70 }), paddler("d", { weightKg: null })]);
  assert.equal(reliable.coverage, 75);
  assert.equal(reliable.reliable, true);
});

test("unknown, old, or low-confidence ratings reduce evidence confidence", () => {
  const now = new Date("2026-08-08T12:00:00Z").getTime();
  const current = evidenceConfidence(paddler("current"), now);
  const unknown = evidenceConfidence(paddler("unknown", { ratings: { timing: null, connection: null, power: null, stability: null, consistency: null } }), now);
  const oldLow = evidenceConfidence(paddler("old", { ratingAssessedAt: "2024-01-01", ratingConfidence: "Low" }), now);
  assert.ok(current > oldLow);
  assert.equal(unknown, 0);
});

test("seat validation catches duplicate and wrong-side placements", () => {
  const seats = [
    { row: 1, active: true, leftId: "right-only", rightId: "right-only" },
  ];
  const errors = validateSeatAssignments(seats, [paddler("right-only", { sidePref: "R", sideExclusive: true })]);
  assert.ok(errors.some((error) => /wrong required side/i.test(error)));
  assert.ok(errors.some((error) => /more than one seat/i.test(error)));
});

test("dockside replacement changes exactly one seat and preserves all others", () => {
  const seats = [
    { row: 1, active: true, leftId: "a", rightId: "b" },
    { row: 2, active: true, leftId: "c", rightId: "d" },
  ];
  const next = replaceOneSeat(seats, "b", paddler("spare", { sidePref: "R", sideExclusive: true }));
  assert.equal(next[0].rightId, "spare");
  assert.equal(next[0].leftId, "a");
  assert.deepEqual(next[1], seats[1]);
  assert.deepEqual(seats[0], { row: 1, active: true, leftId: "a", rightId: "b" });
});

test("unconfirmed event eligibility remains buildable but provisional", () => {
  const mixed = evaluateEventEligibility(["Women", "Women", "Unconfirmed", "Unconfirmed", "Open", "Open"], "mixed");
  assert.equal(mixed.allowed, true);
  assert.equal(mixed.provisional, true);
  assert.equal(mixed.requiredWomen, 3);

  const women = evaluateEventEligibility(["Women", "Unconfirmed", "Unconfirmed"], "women");
  assert.equal(women.allowed, true);
  assert.equal(women.provisional, true);
});

test("training ignores event eligibility while explicit event conflicts remain blocked", () => {
  assert.equal(evaluateEventEligibility(["Ineligible", "Unconfirmed"], "count").allowed, true);
  assert.equal(evaluateEventEligibility(["Women", "Open", "Unconfirmed"], "women").allowed, false);
  assert.equal(evaluateEventEligibility(["Women", "Open", "Open", "Open"], "mixed").allowed, false);
  assert.equal(evaluateEventEligibility(["Women", "Women", "Ineligible", "Unconfirmed"], "mixed").allowed, false);
});

test("overflow paddlers become spares instead of false relationship conflicts", () => {
  const paddlers = Array.from({ length: 21 }, (_, index) => ({
    id: `p-${index + 1}`,
    name: `Paddler ${index + 1}`,
    avoidPairWith: "",
    mustPairWith: "",
    eventEligibility: "Unconfirmed",
    allocationScore: 0,
  }));
  const result = allocateBoatUnits(paddlers.map((item) => [item]), [20], "balanced", "count");
  assert.equal(result.groups[0].length, 20);
  assert.equal(result.overflow.length, 1);
  assert.equal(result.overflow[0].name, "Paddler 21");
});

test("blank relationship fields remain nonrestrictive across four full boats", () => {
  const paddlers = Array.from({ length: 81 }, (_, index) => ({
    id: `p-${index + 1}`,
    name: `Paddler ${index + 1}`,
    avoidPairWith: "   ",
    mustPairWith: "",
    eventEligibility: "Unconfirmed",
    allocationScore: 0,
  }));
  const result = allocateBoatUnits(paddlers.map((item) => [item]), [20, 20, 20, 20], "balanced", "count");
  assert.deepEqual(result.groups.map((group) => group.length), [20, 20, 20, 20]);
  assert.equal(result.overflow.length, 1);
});

test("one-to-four boat assignment sets remain duplicate-free", () => {
  for (let boatCount = 1; boatCount <= 4; boatCount += 1) {
    const allSeats = [];
    const allPaddlers = [];
    for (let boat = 0; boat < boatCount; boat += 1) {
      for (let row = 1; row <= 5; row += 1) {
        const leftId = `b${boat}-r${row}-l`;
        const rightId = `b${boat}-r${row}-r`;
        allSeats.push({ row, active: true, leftId, rightId });
        allPaddlers.push(paddler(leftId, { sidePref: "L", sideExclusive: true }), paddler(rightId, { sidePref: "R", sideExclusive: true }));
      }
    }
    assert.deepEqual(validateSeatAssignments(allSeats, allPaddlers), []);
  }
});
