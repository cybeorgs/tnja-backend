import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Historical district-name spellings that must map onto the current
// authoritative name from tn-districts-taluks.json, so re-running this
// script never creates a duplicate district row.
const DISTRICT_ALIASES: Record<string, string> = {
  Kancheepuram: 'Kanchipuram',
  Sivagangai: 'Sivaganga',
};

type LocationData = { district: string; taluks: string[] }[];

async function main() {
  console.log('Syncing Districts & Taluks from tn-districts-taluks.json (non-destructive)...\n');

  const data: LocationData = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'prisma', 'data', 'tn-districts-taluks.json'), 'utf8')
  );

  // Reconcile any districts stored under an old spelling before upserting.
  for (const [oldName, newName] of Object.entries(DISTRICT_ALIASES)) {
    const existing = await prisma.district.findUnique({ where: { name: oldName } });
    if (existing) {
      await prisma.district.update({ where: { id: existing.id }, data: { name: newName } });
      console.log(`  Renamed district "${oldName}" -> "${newName}"`);
    }
  }

  let districtsTouched = 0;
  let talukscreated = 0;

  for (const { district, taluks } of data) {
    const d = await prisma.district.upsert({
      where: { name: district },
      update: {},
      create: { name: district },
    });
    districtsTouched++;

    for (const talukName of taluks) {
      const result = await prisma.taluk.upsert({
        where: { districtId_name: { districtId: d.id, name: talukName } },
        update: {},
        create: { name: talukName, districtId: d.id },
      });
      if (result) talukscreated++;
    }
  }

  console.log(`\nDone. ${districtsTouched} districts / ${talukscreated} taluks synced.`);

  // Retire the old placeholder "<District> Central Taluk" rows left over from
  // earlier seeds — reassign anything pointing at one to a real taluk in the
  // same district first, so this is always safe to re-run.
  const placeholders = await prisma.taluk.findMany({ where: { name: { endsWith: 'Central Taluk' } } });
  let placeholdersRemoved = 0;
  for (const p of placeholders) {
    const replacement = await prisma.taluk.findFirst({
      where: { districtId: p.districtId, id: { not: p.id } },
      orderBy: { name: 'asc' },
    });
    if (replacement) {
      await prisma.student.updateMany({ where: { talukId: p.id }, data: { talukId: replacement.id } });
      await prisma.member.updateMany({ where: { talukId: p.id }, data: { talukId: replacement.id } });
      await prisma.club.updateMany({ where: { talukId: p.id }, data: { talukId: replacement.id } });
      await prisma.coachReferee.updateMany({ where: { talukId: p.id }, data: { talukId: replacement.id } });
      await prisma.taluk.delete({ where: { id: p.id } });
      placeholdersRemoved++;
    }
  }
  console.log(`Removed ${placeholdersRemoved} legacy placeholder taluks.`);
  console.log('Existing tournaments, students, clubs, etc. were not touched (only re-pointed off placeholder taluks where needed).');
}

main()
  .catch((e) => {
    console.error('\nLocation sync failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
