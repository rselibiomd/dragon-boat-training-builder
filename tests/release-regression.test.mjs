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
  assert.match(boats, /Minimal lineup, no weights/);
  assert.match(boats, /Crew lineup, no weights/);
  assert.match(boats, /printVariant === "coach" && left && <small>\{left\.weightKg/);
  assert.match(boats, /printVariant === "coach" && right && <small>\{right\.weightKg/);
  assert.match(boats, /printVariant === "coach" && <div className="coach-print-summary">/);
});

test("minimal crew lineup enlarges the boat and omits coach-only footer content", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(boats, /printVariant === "coach" && <div className="boat-print-footer-grid">/);
  assert.doesNotMatch(boats, /Crew reminder/);
  assert.match(styles, /\.boat-print-crew \.print-boat-sheet[\s\S]*height: auto;[\s\S]*overflow: visible;/);
  assert.match(styles, /\.boat-print-crew \.dragon-boat-diagram[\s\S]*height: 5\.25in;[\s\S]*width: 7\.3in;/);
  assert.match(styles, /\.boat-print-crew \.print-seat strong[\s\S]*font-size: 10pt;/);
  assert.match(styles, /\.boat-print-crew \.print-boat-sheet > \.print-page-footer[\s\S]*position: static;/);
});

test("print and direct export formats share explicit page boundaries", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const exportSource = await readFile(new URL("../app/print-export.ts", import.meta.url), "utf8");
  assert.match(page, /Save PDF/);
  assert.match(page, /Save PNG/);
  assert.match(page, /pageSelector: "\.training-print-page"/);
  assert.match(boats, /pageSelector: "\.print-boat-sheet"/);
  assert.match(exportSource, /new jsPDF/);
  assert.match(exportSource, /html2canvas/);
  assert.match(exportSource, /page\.closest<HTMLElement>\("\.print-document"\)/);
  assert.match(styles, /\.training-print-page:not\(:last-child\),\s*\.print-boat-sheet:not\(:last-child\)/);
  assert.match(styles, /page-break-after: always/);
  assert.match(styles, /\.print-boat-sheet:last-child[\s\S]*page-break-after: auto/);
  assert.doesNotMatch(styles, /\.print-boat-sheet\s*\{\s*break-after: page/);
});

test("desktop seating keeps the available paddlers at left and supports one-click removal", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(boats, /className="lineup-workspace"/);
  assert.match(boats, /aria-label="Paddlers ready to be seated"/);
  assert.match(boats, /className="seat-remove"/);
  assert.match(boats, /onClick=\{\(\) => movePaddlerToBench\(paddler\.id\)\}/);
  assert.match(styles, /grid-template-columns: minmax\(220px, 270px\) minmax\(0, 1fr\)/);
  assert.match(styles, /\.lineup-workspace \.roster-bench[\s\S]*position: sticky/);
});

test("every generated boat keeps ten consecutive usable rows for smaller crews", () => {
  assert.match(boats, /const seatedPaddlers = Math\.min\(totalPaddlers, boatCount \* 20\)/);
  assert.match(boats, /const seats: Seat\[\] = Array\.from\(\{ length: 10 \}/);
  assert.match(boats, /row: index \+ 1,\s*active: true/);
  assert.match(boats, /seats\.forEach\(\(seat\) =>/);
  assert.match(boats, /Every boat keeps rows 1–10\. Smaller crews leave seats vacant/);
  assert.doesNotMatch(boats, /function activeRows\(/);
  assert.doesNotMatch(boats, /You need at least \$\{boatCount \* 10\} participating paddlers/);
});
