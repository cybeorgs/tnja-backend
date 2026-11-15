// Age groups and weight classes (ported from the standalone tournament app): age = tournament year − birth year.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  competitionAge, eligibleAgeGroups, normalizeCategoryInput, resolveAgeGroup, tournamentAgeGroups, weightCategoryFor, weightClasses,
} from "../src/modules/tournaments/categories.ts";

const dob = (y: number, m = 6, d = 15) => new Date(Date.UTC(y, m - 1, d));
const T2026 = new Date("2026-12-05T03:30:00Z");

test("age is tournament year minus birth year, whatever the month", () => {
  assert.equal(competitionAge(dob(2012, 1, 1), T2026), 14);
  assert.equal(competitionAge(dob(2012, 12, 31), T2026), 14);
  // 31 Dec 20:00 UTC is already 1 Jan in India: that tournament is next year's.
  assert.equal(competitionAge(dob(2012), new Date("2026-12-31T20:00:00Z")), 15);
});

test("2026 birth years match the TNJA circular", () => {
  const groups = (y: number) => eligibleAgeGroups(dob(y), T2026);
  assert.deepEqual(groups(2020), ["Mini Sub-Junior Age Group 1"]);
  assert.deepEqual(groups(2017), ["Mini Sub-Junior Age Group 2"]);
  assert.deepEqual(groups(2015), ["Mini Sub-Junior Age Group 3"]);
  assert.deepEqual(groups(2013), ["Sub-Junior"]);
  assert.deepEqual(groups(2012), ["Sub-Junior", "Cadet", "Junior"]); // 14: Cadet may play up to Junior
  assert.deepEqual(groups(2011), ["Cadet", "Junior", "Senior"]); // 15: Senior too
  assert.deepEqual(groups(2008), ["Junior", "Senior"]);
  assert.deepEqual(groups(2000), ["Senior"]);
  assert.deepEqual(groups(2021), []); // 5: too young
});

test("the same rules roll over to the next season", () => {
  assert.deepEqual(eligibleAgeGroups(dob(2020), new Date("2027-03-01T04:00:00Z")), ["Mini Sub-Junior Age Group 1"]);
  assert.deepEqual(eligibleAgeGroups(dob(2019), new Date("2027-03-01T04:00:00Z")), ["Mini Sub-Junior Age Group 2"]);
});

test("a tournament's own age groups limit who may enter", () => {
  assert.deepEqual(eligibleAgeGroups(dob(2011), T2026, "Cadet, Senior"), ["Cadet", "Senior"]);
  assert.deepEqual(eligibleAgeGroups(dob(2013), T2026, "Cadet"), []);
});

test("old create-form labels still map to age groups", () => {
  assert.deepEqual(tournamentAgeGroups("Mini Sub Junior, Sub Junior"), [
    "Mini Sub-Junior Age Group 1", "Mini Sub-Junior Age Group 2", "Mini Sub-Junior Age Group 3", "Sub-Junior",
  ]);
  assert.deepEqual(normalizeCategoryInput(["Senior", "Cadet"]), { value: "Cadet, Senior" });
  assert.ok("error" in normalizeCategoryInput("Masters"));
});

test("resolveAgeGroup picks the player's own group unless they asked to play up", () => {
  const t = { date: T2026, category: null };
  assert.deepEqual(resolveAgeGroup(dob(2011), t), { ageGroup: "Cadet" });
  assert.deepEqual(resolveAgeGroup(dob(2011), t, "Senior"), { ageGroup: "Senior" });
  assert.ok("error" in resolveAgeGroup(dob(2013), t, "Senior"));
  assert.ok("error" in resolveAgeGroup(null, t));
  // Own group not contested: falls to the one they may play up into.
  assert.deepEqual(resolveAgeGroup(dob(2011), { date: T2026, category: "Junior, Senior" }), { ageGroup: "Junior" });
});

test("weight classes differ for men and women", () => {
  assert.deepEqual(weightClasses("Cadet", "MALE"), ["-50kg", "-55kg", "-60kg", "-66kg", "-73kg", "-81kg", "-90kg", "+90kg"]);
  assert.deepEqual(weightClasses("Cadet", "FEMALE"), ["-40kg", "-44kg", "-48kg", "-52kg", "-57kg", "-63kg", "-70kg", "+70kg"]);
  assert.equal(weightCategoryFor(55, "MALE", "Senior"), "-60kg");
  assert.equal(weightCategoryFor(55, "FEMALE", "Senior"), "-57kg");
  assert.equal(weightCategoryFor(66, "MALE", "Sub-Junior"), "-66kg");
  assert.equal(weightCategoryFor(66.1, "MALE", "Sub-Junior"), "+66kg");
  assert.equal(weightCategoryFor(27, "FEMALE", "Mini Sub-Junior Age Group 1"), "+26kg");
  assert.equal(weightCategoryFor(85, "MALE", "Veteran"), "-90kg"); // old entries use the Senior table
});
