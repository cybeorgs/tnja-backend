// One-off admin utility: diagnose a login-not-found issue and, optionally, issue a fresh password.
// Run from the backend project root on the SERVER where the real (production) DATABASE_URL is set.
//
// Usage:
//   node scripts/fix-member-login.mjs <ID-or-email>                 -> look up and print the account (no changes)
//   node scripts/fix-member-login.mjs <ID-or-email> --reset         -> also generate + set a new password
//
// Example:
//   node scripts/fix-member-login.mjs MEM-570125-E7EB
//   node scripts/fix-member-login.mjs MEM-570125-E7EB --reset

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";

const prisma = new PrismaClient();

const identifier = process.argv[2];
const doReset = process.argv.includes("--reset");

if (!identifier) {
  console.error("Usage: node scripts/fix-member-login.mjs <ID-or-email> [--reset]");
  process.exit(1);
}

const generatePassword = () => {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const num = "0123456789";
  const special = "@$!%*?&";
  const allChars = upper + lower + num + special;

  let raw = "";
  raw += upper[Math.floor(Math.random() * upper.length)];
  raw += lower[Math.floor(Math.random() * lower.length)];
  raw += num[Math.floor(Math.random() * num.length)];
  raw += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 8; i++) raw += allChars[Math.floor(Math.random() * allChars.length)];

  // shuffle
  raw = raw.split("").sort(() => Math.random() - 0.5).join("");
  return raw;
};

const models = [
  { name: "member", label: "MEMBER (role varies)" },
  { name: "student", label: "PLAYER" },
  { name: "coachReferee", label: "COACH/REFEREE" },
  { name: "club", label: "CLUB" },
];

async function main() {
  console.log(`\nSearching for "${identifier}" ...\n`);

  let exactHit = null;
  let exactModel = null;

  for (const m of models) {
    const hit = await prisma[m.name].findFirst({
      where: {
        OR: [{ tempId: identifier }, { permanentId: identifier }, { email: identifier }],
      },
    });
    if (hit) {
      exactHit = hit;
      exactModel = m;
      break;
    }
  }

  if (exactHit) {
    console.log(`✅ EXACT MATCH found in ${exactModel.label}`);
    console.log({
      id: exactHit.id,
      fullName: exactHit.fullName || exactHit.name,
      email: exactHit.email,
      tempId: exactHit.tempId,
      permanentId: exactHit.permanentId,
      status: exactHit.status,
      hasPassword: !!exactHit.password,
      mustChangePassword: exactHit.mustChangePassword,
    });
  } else {
    console.log("❌ No exact match on tempId / permanentId / email in any table.");
    console.log("Searching for near matches (case-insensitive, partial) ...\n");

    const fragment = identifier.replace(/^MEM-|^TEMP-MEM-?/i, "").slice(0, 8);
    for (const m of models) {
      const near = await prisma[m.name].findMany({
        where: {
          OR: [
            { tempId: { contains: fragment, mode: "insensitive" } },
            { permanentId: { contains: fragment, mode: "insensitive" } },
          ],
        },
        select: { id: true, fullName: true, name: true, email: true, tempId: true, permanentId: true, status: true },
      });
      if (near.length) {
        console.log(`Possible matches in ${m.label}:`);
        console.log(near);
      }
    }
    console.log("\nIf nothing above looks right, the record may have been deleted, or the ID was mistyped/mis-copied.");
  }

  if (doReset) {
    if (!exactHit) {
      console.log("\n⚠️  Cannot reset — no exact match was found. Fix the identifier first, then re-run with --reset.");
      await prisma.$disconnect();
      return;
    }

    const newPassword = generatePassword();
    const hashed = await bcrypt.hash(newPassword, 10);

    const updated = await prisma[exactModel.name].update({
      where: { id: exactHit.id },
      data: {
        password: hashed,
        mustChangePassword: false,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    console.log("\n🔑 Password reset successful. Give the member these credentials:");
    console.log({
      loginId: updated.permanentId || updated.tempId,
      password: newPassword,
    });
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
