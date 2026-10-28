// Ranking point formulas: volunteer shifts, monthly attendance and month arithmetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attendancePointsFor, previousMonth, volunteerPointsFor, type PointSettingsValues } from "../src/modules/points/points.service.ts";

const settings: PointSettingsValues = {
  sportsmanshipPoints: 5, volunteerPoints: 10, volunteerFullHours: 4,
  attendanceMaxPoints: 10, disciplineMaxPoints: 5, disciplineMinPoints: 1,
};
const at = (h: number) => new Date(2026, 9, 28, h);

test("volunteer shifts earn full points from the full-shift length, pro rata below it", () => {
  assert.equal(volunteerPointsFor(settings, at(8), at(12)), 10);
  assert.equal(volunteerPointsFor(settings, at(8), at(18)), 10, "capped at the full points");
  assert.equal(volunteerPointsFor(settings, at(8), at(10)), 5);
  assert.equal(volunteerPointsFor(settings, at(8), at(8)), 0);
});

test("attendance points scale with sessions attended out of held", () => {
  assert.equal(attendancePointsFor(settings, 20, 20), 10);
  assert.equal(attendancePointsFor(settings, 20, 15), 8);
  assert.equal(attendancePointsFor(settings, 20, 0), 0);
  assert.equal(attendancePointsFor(settings, 0, 0), 0, "no sessions held means no attendance points");
});

test("previous month wraps across the year", () => {
  assert.equal(previousMonth("2026-10"), "2026-09");
  assert.equal(previousMonth("2026-01"), "2025-12");
});
