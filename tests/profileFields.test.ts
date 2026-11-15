// Admin profile edits: only listed fields are accepted, optional ones can be cleared, values are typed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfileInput, profileFieldsFor } from "../src/modules/users/profileFields.ts";

test("unknown and system fields are ignored", () => {
  const r = parseProfileInput("STUDENT", { fullName: "Arun K", password: "x", status: "APPROVED", permanentId: "X1", isPaid: true });
  assert.deepEqual(r, { data: { fullName: "Arun K" } });
});

test("optional fields can be cleared, required ones can't", () => {
  assert.deepEqual(parseProfileInput("STUDENT", { belt: "" }), { data: { belt: null } });
  assert.ok("error" in parseProfileInput("STUDENT", { email: "" }));
});

test("values are converted to their types", () => {
  const r = parseProfileInput("STUDENT", { dob: "2012-05-14", annualIncome: "120000", isBPL: "true", email: " A@B.COM " });
  assert.ok("data" in r);
  assert.equal((r.data.dob as Date).toISOString(), "2012-05-14T00:00:00.000Z");
  assert.equal(r.data.annualIncome, 120000);
  assert.equal(r.data.isBPL, true);
  assert.equal(r.data.email, "a@b.com");
});

test("bad values are refused with a readable message", () => {
  assert.match((parseProfileInput("CLUB", { noOfStudents: "4.5" }) as { error: string }).error, /whole number/);
  assert.match((parseProfileInput("STUDENT", { gender: "X" }) as { error: string }).error, /Gender/);
  assert.match((parseProfileInput("COACH", { email: "nope" }) as { error: string }).error, /email/);
});

test("every account type has a field list", () => {
  for (const role of ["STUDENT", "COACH", "CLUB", "MEMBER", "DISTRICT_SECRETARY"]) assert.ok(profileFieldsFor(role)?.length);
  assert.equal(profileFieldsFor("NOPE"), null);
});
