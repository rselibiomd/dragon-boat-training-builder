import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../app/boat-planner-core.tsx", import.meta.url), "utf8");
const wrapper = await readFile(new URL("../app/boat-planner.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/boat-coach-prep.css", import.meta.url), "utf8");

test("master roster is authoritative over stale draft paddlers", () => {
  assert.match(core, /const masterRoster = Array\.isArray\(storedRoster\)/);
  assert.match(core, /const restoredRoster = masterRoster\.length \? masterRoster : legacyDraftRoster/);
  assert.match(core, /rosterIds\.has\(seat\.leftId\)/);
  assert.match(core, /rosterIds\.has\(seat\.rightId\)/);
});

test("saved lineups retain a full paddler snapshot", () => {
  assert.match(core, /paddlers: structuredClone\(paddlers\)/);
  assert.match(core, /spares: structuredClone\(spares\)/);
  assert.match(core, /sessionTitle,/);
  assert.match(core, /sessionDate,/);
  assert.match(core, /savedAtIso/);
});

test("coach prep exposes readiness, autosave, and last-lineup workflow", () => {
  assert.match(core, /Coach prep/);
  assert.match(core, /Check before launch/);
  assert.match(core, /Ready to build/);
  assert.match(core, /Start from last lineup/);
  assert.match(core, /Saved .*toLocaleTimeString/);
  assert.match(styles, /\.coach-prep-card/);
  assert.match(styles, /\.theme-dark \.coach-prep-card/);
  assert.match(styles, /\.theme-neo \.coach-prep-card/);
});

test("Squad Mode triggers the same native build action", () => {
  assert.match(core, /data-build-boat-button/);
  assert.match(wrapper, /querySelector<HTMLButtonElement>\("\[data-build-boat-button\]"\)/);
});
