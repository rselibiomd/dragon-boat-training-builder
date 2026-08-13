import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => channel(Number.parseInt(value, 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("theme integrity overrides come after screen components and before print", () => {
  const integrity = css.indexOf("/* Theme integrity overrides");
  assert.ok(integrity > css.indexOf(".review-history article"));
  assert.ok(integrity < css.indexOf("@media print", integrity));
});

test("late theme coverage includes every major interactive section", () => {
  const integrity = css.slice(css.indexOf("/* Theme integrity overrides"));
  for (const selector of [
    ".detail-card",
    ".interval-builder",
    ".diagnostic-panel",
    ".practice-review",
    ".substitution-panel",
    ".constraint-editor",
    ".print-dialog",
    ".data-actions",
    ".boat-checks",
  ]) {
    assert.match(integrity, new RegExp(selector.replace(".", "\\.")));
  }
});

test("newer panels use defined theme-compatible color aliases", () => {
  for (const alias of ["--text", "--input", "--accent", "--surface-soft"]) {
    assert.match(css, new RegExp(`${alias}:`));
  }
});

test("dark and neo repair palettes meet WCAG AA body-text contrast", () => {
  const pairs = [
    ["#eef5f9", "#0b2234"],
    ["#a8bdca", "#0b2234"],
    ["#b5c7d2", "#102c42"],
    ["#33373c", "#ffffff"],
    ["#59626a", "#ffffff"],
    ["#c5c9d0", "#17181a"],
    ["#aebfff", "#17181a"],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${foreground} on ${background} must meet 4.5:1`,
    );
  }
});
