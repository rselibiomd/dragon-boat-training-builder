import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const boats = await readFile(new URL("../app/boat-planner.tsx", import.meta.url), "utf8");

test("Release 1 trust controls remain present", () => {
  assert.match(page, /blocks: session/);
  assert.match(page, /kdbc-active-session-v2/);
  assert.match(page, /Export data/);
  assert.match(page, /Restore/);
  assert.match(page, /clearPrivateData/);
  assert.match(page, /renamePlan/);
  assert.match(page, /duplicatePlan/);
  assert.match(page, /deletePlan/);
  assert.match(boats, /DRAFT_KEY = "kdbc-boat-draft-v1"/);
  assert.match(boats, /rebuildNeeded/);
  assert.match(boats, /undoBoatEdit/);
  assert.match(boats, /redoBoatEdit/);
  assert.match(boats, /renameLineup/);
  assert.match(boats, /duplicateLineup/);
  assert.match(boats, /deleteLineup/);
});

test("Release 2 uses the corrected progression and active drill governance", () => {
  assert.match(page, /\["Stability", "Technique", "Endurance", "Power", "Speed"\]/);
  assert.match(page, /Timing is coached in every phase/);
  assert.doesNotMatch(page, /Frankenstein/);
  assert.doesNotMatch(page, /7-Up/);
  assert.match(page, /Pause Before the Catch/);
  assert.match(page, /Diagnostic drill selector/);
  assert.match(page, /intervalTotalSeconds/);
  assert.match(page, /Technical stop condition/);
  assert.match(page, /post-practice review/i);
});

test("ratings include anchors, evidence date, and confidence", () => {
  assert.match(boats, /RATING_ANCHORS/);
  assert.match(boats, /ratingAssessedAt/);
  assert.match(boats, /ratingConfidence/);
  assert.match(boats, /Assessment date/);
  assert.match(boats, /Evidence confidence/);
});

test("Release 3 keeps hard constraints separate from optimization", () => {
  assert.match(boats, /sessionRole/);
  assert.match(boats, /eventEligibility/);
  assert.match(boats, /mustPairWith/);
  assert.match(boats, /avoidPairWith/);
  assert.match(boats, /rowRestriction/);
  assert.match(boats, /steerId/);
  assert.match(boats, /drummerId/);
  assert.match(boats, /Why this seat/);
  assert.match(boats, /recommendation quality/);
  assert.match(boats, /data confidence/);
  assert.match(boats, /Dockside change/);
  assert.match(boats, /current paddler profiles/i);
  assert.match(boats, /Unconfirmed eligibility does not block boat creation/);
  assert.match(boats, /allowed provisionally/);
});

test("Release 1/2 hardening uses unified sessions and validated backups", () => {
  assert.match(page, /sessionId/);
  assert.match(page, /Encrypted backup/);
  assert.match(page, /validateBackupData/);
  assert.match(page, /editReview/);
  assert.match(page, /deleteReview/);
  assert.match(page, /consecutive sessions/);
  assert.match(page, /drillEffectiveness/);
});

test("crew print is explicitly weight-free and coach details stay coach-only", () => {
  assert.match(boats, /Lineup only — no weights/);
  assert.match(boats, /Crew lineup · no weights/);
  assert.match(boats, /Assignments only — no weights or private coaching information/);
  assert.match(boats, /printVariant === "coach" && left && <small>\{left\.weightKg/);
  assert.match(boats, /printVariant === "coach" && right && <small>\{right\.weightKg/);
  assert.match(boats, /printVariant === "coach" && <div className="coach-print-summary">/);
});
