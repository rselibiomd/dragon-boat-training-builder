import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const boats = await readFile(new URL("../app/boat-planner.tsx", import.meta.url), "utf8");

test("Release 1 trust controls remain present", () => {
  for (const pattern of [/blocks: session/, /kdbc-active-session-v2/, /Export data/, /Restore/, /clearPrivateData/, /renamePlan/, /duplicatePlan/, /deletePlan/]) assert.match(page, pattern);
  for (const pattern of [/kdbc-boat-draft-v1/, /rebuildNeeded/, /undoBoatEdit/, /redoBoatEdit/, /renameLineup/, /duplicateLineup/, /deleteLineup/]) assert.match(boats, pattern);
});

test("Release 2 uses the corrected progression and active drill governance", () => {
  assert.match(page, /\["Stability", "Technique", "Endurance", "Power", "Speed"\]/);
  assert.match(page, /Timing is coached in every phase/);
  assert.doesNotMatch(page, /Frankenstein/);
  assert.doesNotMatch(page, /7-Up/);
  for (const pattern of [/Pause Before the Catch/, /Diagnostic drill selector/, /intervalTotalSeconds/, /Technical stop condition/, /post-practice review/i]) assert.match(page, pattern);
});

test("ratings include anchors, evidence date, and confidence", () => {
  for (const pattern of [/RATING_ANCHORS/, /ratingAssessedAt/, /ratingConfidence/, /Assessment date/, /Evidence confidence/]) assert.match(boats, pattern);
});
