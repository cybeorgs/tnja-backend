// Permanent ID format: {district code}-{STU|MEM|CLB|COH}-{series letter}{001-999}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { districtCodeOf, formatPermanentId } from "../src/modules/payments/permanentId.service.ts";

test("numbers run A001 … A999, then roll over to B001", () => {
  assert.equal(formatPermanentId("CBE-STU", 1), "CBE-STU-A001");
  assert.equal(formatPermanentId("CBE-MEM", 42), "CBE-MEM-A042");
  assert.equal(formatPermanentId("CBE-CLB", 999), "CBE-CLB-A999");
  assert.equal(formatPermanentId("CBE-COH", 1000), "CBE-COH-B001");
  assert.equal(formatPermanentId("CBE-STU", 26 * 999), "CBE-STU-Z999");
});

test("the range ends after series Z", () => {
  assert.throws(() => formatPermanentId("CBE-STU", 26 * 999 + 1), /exhausted/);
});

test("district code falls back to the name, then to the state code", () => {
  assert.equal(districtCodeOf({ code: "CBE", name: "Coimbatore" }), "CBE");
  assert.equal(districtCodeOf({ code: null, name: "The Nilgiris" }), "THE");
  assert.equal(districtCodeOf(null), "TNJA");
});
