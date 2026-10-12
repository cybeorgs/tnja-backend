import { PrismaClient, EventLevel, Status, Gender, Placement } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

const autoComplete = process.argv.includes('--complete');

async function main() {
  console.log(`🚀 Seeding Small Test Tournament (~10 Matches)...`);
  if (autoComplete) {
    console.log(`⚡ Mode: AUTO-COMPLETE (all matches will be finished & tournament closed)`);
  } else {
    console.log(`📌 Mode: PENDING MATCHES (live testing on scoreboard/mats)`);
  }

  // 1. Ensure District & Taluk exist
  let district = await prisma.district.findFirst({
    where: { name: 'Chennai' },
    include: { taluks: true },
  });

  if (!district) {
    district = await prisma.district.create({
      data: {
        name: 'Chennai',
        zoneName: 'North Zone',
        taluks: {
          create: [{ name: 'Chennai Central', pincode: '600002' }],
        },
      },
      include: { taluks: true },
    });
  }

  const talukId = district.taluks[0]?.id || district.id;

  // 2. Ensure Club exists
  let club = await prisma.club.findFirst({
    where: { email: 'info@chennaijudo.org' },
  });

  if (!club) {
    club = await prisma.club.create({
      data: {
        name: 'Chennai Judo Academy',
        districtId: district.id,
        talukId: talukId,
        address1: '123 Sports Complex, Chennai',
        pincode: '600002',
        mobileNumber: '9876543210',
        email: 'info@chennaijudo.org',
        president: 'R. Sharma',
        secretary: 'V. Kumar',
        coach: 'Master Coach',
        status: Status.APPROVED,
      },
    });
  }

  // 3. Ensure Coach/Official exists
  let coach = await prisma.coachReferee.findFirst({
    where: { email: 'coach.small@test.com' },
  });

  const dummyPasswordHash = await bcrypt.hash('Seed@1234', 10);

  if (!coach) {
    coach = await prisma.coachReferee.create({
      data: {
        tempId: `COACH_${Math.floor(1000 + Math.random() * 9000)}`,
        fullName: 'Master Coach',
        fatherName: 'Senior Coach',
        gender: Gender.MALE,
        dob: new Date(1985, 5, 15),
        age: 41,
        bloodGroup: 'A+',
        mobileNumber: '9988776655',
        email: 'coach.small@test.com',
        aadhaarNumber: '299887766551',
        historyInJudo: '10 Years',
        historyInOtherMartial: 'None',
        presentGradeInJudo: 'Black Belt 1st Dan',
        pincode: '600002',
        districtId: district.id,
        talukId: talukId,
        clubId: club.id,
        status: Status.APPROVED,
        password: dummyPasswordHash,
      },
    });
  }

  // 4. Clean up any previous "Small Test Tournament (10 Matches)"
  const title = "Small Test Tournament (10 Matches)";
  const existing = await prisma.tournament.findFirst({ where: { title } });
  if (existing) {
    console.log(`🧹 Cleaning existing tournament "${title}"...`);
    const regs = await prisma.tournamentRegistration.findMany({ where: { tournamentId: existing.id } });
    const playerIds = regs.map(r => r.playerId);
    await prisma.tournamentMat.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentDraw.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournament.delete({ where: { id: existing.id } });
    if (playerIds.length > 0) {
      await prisma.student.deleteMany({ where: { id: { in: playerIds } } });
    }
  }
  await prisma.student.deleteMany({ where: { tempId: { startsWith: 'STU_SM_' } } });

  // 5. Create Tournament
  const tournament = await prisma.tournament.create({
    data: {
      title,
      category: 'Senior State Championship',
      date: new Date('2026-08-15'),
      dateTo: new Date('2026-08-16'),
      location: 'Nehru Indoor Stadium, Chennai',
      description: 'Small test tournament with 12 players across 2 categories (~10 matches total).',
      entryFee: 500,
      numberOfMats: 1,
      gender: 'MALE',
      level: EventLevel.STATE,
      status: autoComplete ? 'CLOSED' : Status.APPROVED,
      districtApproval: Status.APPROVED,
      stateApproval: Status.APPROVED,
      superAdminApproval: Status.APPROVED,
      ceoApproval: Status.APPROVED,
      clubId: club.id,
    },
  });

  // 6. Create Mat 1
  await prisma.tournamentMat.create({
    data: {
      tournamentId: tournament.id,
      matNumber: 1,
      refereeId: coach.id,
    },
  });

  console.log(`✅ Tournament Created: "${tournament.title}" (ID: ${tournament.id})`);

  // 7. Define 2 Categories (6 players each = 5 matches each = 10 matches total)
  const categories = [
    { ageGroup: 'Senior', weightCategory: '-60kg', gender: Gender.MALE },
    { ageGroup: 'Senior', weightCategory: '-66kg', gender: Gender.MALE },
  ];

  let playerCounter = 1;
  const randSuffix = Math.floor(1000 + Math.random() * 9000);

  for (const cat of categories) {
    const players: any[] = [];
    const regs: any[] = [];

    for (let i = 1; i <= 6; i++) {
      const studentId = crypto.randomUUID();
      const playerName = `Judo Player ${playerCounter}`;
      const uniqueNum = `${randSuffix}_${playerCounter}`;
      playerCounter++;

      players.push({
        id: studentId,
        tempId: `STU_SM_${uniqueNum}`,
        permanentId: `TNJA_SM_${uniqueNum}`,
        fullName: playerName,
        gender: cat.gender,
        dob: new Date(2002, 0, 1),
        age: 24,
        bloodGroup: 'O+',
        mobileNumber: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        email: `player_sm_${uniqueNum}@test.com`,
        aadhaarNumber: `2${Math.floor(10000000000 + Math.random() * 90000000000)}`,
        address: 'Sports Hostel, Chennai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600002',
        addressPincode: '600002',
        nationality: 'Indian',
        annualIncome: 120000,
        isBPL: false,
        clubId: club.id,
        schoolName: 'Chennai Sports College',
        grade: 'Graduate',
        password: dummyPasswordHash,
        status: Status.APPROVED,
        isPaid: true,
        districtId: district.id,
        talukId: talukId,
        weight: cat.weightCategory.replace('-', '').replace('kg', ''),
        height: '172',
      });

      let placement: Placement = Placement.PARTICIPATION;
      if (autoComplete) {
        if (i === 1) placement = Placement.FIRST;
        else if (i === 2) placement = Placement.SECOND;
        else if (i === 3) placement = Placement.THIRD;
      }

      regs.push({
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        playerId: studentId,
        coachId: coach.id,
        status: Status.APPROVED,
        isPaid: true,
        height: '172',
        weight: cat.weightCategory.replace('-', '').replace('kg', ''),
        placement,
        ageGroup: cat.ageGroup,
        weightCategory: cat.weightCategory,
        gender: cat.gender,
      });
    }

    await prisma.student.createMany({ data: players });
    await prisma.tournamentRegistration.createMany({ data: regs });

    const r1Status = autoComplete ? 'COMPLETED' : 'PENDING';
    const r2Status = autoComplete ? 'COMPLETED' : 'PENDING';
    const r3Status = autoComplete ? 'COMPLETED' : 'PENDING';

    const p1 = { playerId: regs[0].playerId, regId: regs[0].id, playerName: players[0].fullName, club: club.name, isBye: false, seedNumber: 1 };
    const p2 = { playerId: regs[1].playerId, regId: regs[1].id, playerName: players[1].fullName, club: club.name, isBye: false, seedNumber: 2 };
    const p3 = { playerId: regs[2].playerId, regId: regs[2].id, playerName: players[2].fullName, club: club.name, isBye: false, seedNumber: 3 };
    const p4 = { playerId: regs[3].playerId, regId: regs[3].id, playerName: players[3].fullName, club: club.name, isBye: false, seedNumber: 4 };
    const p5 = { playerId: regs[4].playerId, regId: regs[4].id, playerName: players[4].fullName, club: club.name, isBye: false };
    const p6 = { playerId: regs[5].playerId, regId: regs[5].id, playerName: players[5].fullName, club: club.name, isBye: false };

    const tbdSlot = { playerId: 'TBD', playerName: 'TBD', club: '', isBye: false };

    const match1Id = `m1_${cat.weightCategory}_1`;
    const match2Id = `m1_${cat.weightCategory}_2`;
    const match3Id = `m2_${cat.weightCategory}_1`;
    const match4Id = `m2_${cat.weightCategory}_2`;
    const match5Id = `m3_${cat.weightCategory}_1`;

    const round1 = [
      {
        matchId: match1Id,
        round: 1,
        matchNumber: 1,
        matNumber: 1,
        status: r1Status,
        winnerId: autoComplete ? p3.playerId : null,
        scoreA: autoComplete ? 10 : 0,
        scoreB: autoComplete ? 0 : 0,
        slotA: p3,
        slotB: p6,
      },
      {
        matchId: match2Id,
        round: 1,
        matchNumber: 2,
        matNumber: 1,
        status: r1Status,
        winnerId: autoComplete ? p4.playerId : null,
        scoreA: autoComplete ? 10 : 0,
        scoreB: autoComplete ? 0 : 0,
        slotA: p4,
        slotB: p5,
      },
    ];

    const round2 = [
      {
        matchId: match3Id,
        round: 2,
        matchNumber: 3,
        matNumber: 1,
        status: r2Status,
        winnerId: autoComplete ? p1.playerId : null,
        scoreA: autoComplete ? 10 : 0,
        scoreB: autoComplete ? 0 : 0,
        slotA: p1,
        slotB: autoComplete ? p3 : tbdSlot,
      },
      {
        matchId: match4Id,
        round: 2,
        matchNumber: 4,
        matNumber: 1,
        status: r2Status,
        winnerId: autoComplete ? p2.playerId : null,
        scoreA: autoComplete ? 10 : 0,
        scoreB: autoComplete ? 0 : 0,
        slotA: p2,
        slotB: autoComplete ? p4 : tbdSlot,
      },
    ];

    const round3 = [
      {
        matchId: match5Id,
        round: 3,
        matchNumber: 5,
        matNumber: 1,
        status: r3Status,
        winnerId: autoComplete ? p1.playerId : null,
        scoreA: autoComplete ? 10 : 0,
        scoreB: autoComplete ? 0 : 0,
        slotA: autoComplete ? p1 : tbdSlot,
        slotB: autoComplete ? p2 : tbdSlot,
      },
    ];

    const rounds = [round1, round2, round3];

    await prisma.tournamentDraw.create({
      data: {
        tournamentId: tournament.id,
        ageGroup: cat.ageGroup,
        exactAge: 24,
        gender: cat.gender,
        weightCategory: cat.weightCategory,
        matNumber: 1,
        rounds,
        isConcluded: autoComplete,
      },
    });

    console.log(`  └─ Created Category: ${cat.ageGroup} ${cat.gender} ${cat.weightCategory} (6 players, 5 matches)`);
  }

  console.log(`\n🎉 Success! Seeded tournament "${title}" with 10 total matches.`);
  console.log(`   - Tournament ID: ${tournament.id}`);
  console.log(`   - Report Download URL: /api/v1/tournaments/${tournament.id}/report`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding small tournament:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
