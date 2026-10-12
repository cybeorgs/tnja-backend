import { PrismaClient, EventLevel, Status, Gender, Placement, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

function getWeightCategory(weightKg: number, gender: Gender, ageGroup: string): string {
  const w = weightKg;
  const isMale = gender === Gender.MALE;

  if (ageGroup.includes("Age Group 1")) {
    if (isMale) {
      if (w <= 20) return "-20kg";
      if (w <= 25) return "-25kg";
      if (w <= 30) return "-30kg";
      return "+30kg";
    } else {
      if (w <= 18) return "-18kg";
      if (w <= 22) return "-22kg";
      if (w <= 26) return "-26kg";
      return "+26kg";
    }
  }

  if (ageGroup.includes("Age Group 2")) {
    if (isMale) {
      if (w <= 25) return "-25kg";
      if (w <= 30) return "-30kg";
      if (w <= 35) return "-35kg";
      return "+35kg";
    } else {
      if (w <= 22) return "-22kg";
      if (w <= 26) return "-26kg";
      if (w <= 30) return "-30kg";
      return "+30kg";
    }
  }

  if (ageGroup.includes("Age Group 3")) {
    if (isMale) {
      if (w <= 30) return "-30kg";
      if (w <= 35) return "-35kg";
      if (w <= 40) return "-40kg";
      if (w <= 45) return "-45kg";
      return "+45kg";
    } else {
      if (w <= 28) return "-28kg";
      if (w <= 32) return "-32kg";
      if (w <= 36) return "-36kg";
      if (w <= 40) return "-40kg";
      return "+40kg";
    }
  }

  if (ageGroup.includes("Sub-Junior")) {
    if (isMale) {
      if (w <= 30) return "-30kg";
      if (w <= 35) return "-35kg";
      if (w <= 40) return "-40kg";
      if (w <= 45) return "-45kg";
      if (w <= 50) return "-50kg";
      if (w <= 55) return "-55kg";
      if (w <= 60) return "-60kg";
      if (w <= 66) return "-66kg";
      return "+66kg";
    } else {
      if (w <= 28) return "-28kg";
      if (w <= 32) return "-32kg";
      if (w <= 36) return "-36kg";
      if (w <= 40) return "-40kg";
      if (w <= 44) return "-44kg";
      if (w <= 48) return "-48kg";
      if (w <= 52) return "-52kg";
      if (w <= 57) return "-57kg";
      return "+57kg";
    }
  }

  if (ageGroup.includes("Cadet")) {
    if (isMale) {
      if (w <= 50) return "-50kg";
      if (w <= 55) return "-55kg";
      if (w <= 60) return "-60kg";
      if (w <= 66) return "-66kg";
      if (w <= 73) return "-73kg";
      if (w <= 81) return "-81kg";
      if (w <= 90) return "-90kg";
      return "+90kg";
    } else {
      if (w <= 40) return "-40kg";
      if (w <= 44) return "-44kg";
      if (w <= 48) return "-48kg";
      if (w <= 52) return "-52kg";
      if (w <= 57) return "-57kg";
      if (w <= 63) return "-63kg";
      if (w <= 70) return "-70kg";
      return "+70kg";
    }
  }

  if (ageGroup.includes("Junior")) {
    if (isMale) {
      if (w <= 55) return "-55kg";
      if (w <= 60) return "-60kg";
      if (w <= 66) return "-66kg";
      if (w <= 73) return "-73kg";
      if (w <= 81) return "-81kg";
      if (w <= 90) return "-90kg";
      if (w <= 100) return "-100kg";
      return "+100kg";
    } else {
      if (w <= 44) return "-44kg";
      if (w <= 48) return "-48kg";
      if (w <= 52) return "-52kg";
      if (w <= 57) return "-57kg";
      if (w <= 63) return "-63kg";
      if (w <= 70) return "-70kg";
      if (w <= 78) return "-78kg";
      return "+78kg";
    }
  }

  // Senior / Veteran
  if (isMale) {
    if (w <= 60) return "-60kg";
    if (w <= 66) return "-66kg";
    if (w <= 73) return "-73kg";
    if (w <= 81) return "-81kg";
    if (w <= 90) return "-90kg";
    if (w <= 100) return "-100kg";
    return "+100kg";
  } else {
    if (w <= 48) return "-48kg";
    if (w <= 52) return "-52kg";
    if (w <= 57) return "-57kg";
    if (w <= 63) return "-63kg";
    if (w <= 70) return "-70kg";
    if (w <= 78) return "-78kg";
    return "+78kg";
  }
}

async function main() {
  console.log('🚀 TNJA Dummy Tournament & Player Seeding Script');
  console.log('==================================================');

  // 1. Fetch base dependencies (District, Taluk, Club, Coach) or create if not present
  let district = await prisma.district.findFirst({ include: { taluks: true } });
  if (!district) {
    console.log('📍 No district found. Creating a default one (Chennai)...');
    district = await prisma.district.create({
      data: {
        name: 'Chennai',
        zoneName: 'Chennai Zone',
        taluks: {
          create: [{ name: 'Chennai Central Taluk', pincode: '600002' }],
        },
      },
      include: { taluks: true },
    });
  }
  
  const talukId = district.taluks[0].id;

  let club = await prisma.club.findFirst();
  if (!club) {
    console.log('🏢 No club found. Creating a default one...');
    club = await prisma.club.create({
      data: {
        name: 'Default Test Judo Club',
        email: 'defaultclub@test.com',
        mobileNumber: '9999999999',
        pincode: '600002',
        address1: 'Test Club Address',
        president: 'Club President',
        secretary: 'Club Secretary',
        coach: 'Club Coach',
        status: Status.APPROVED,
      },
    });
  }

  const dummyPasswordHash = await bcrypt.hash('dummy', 10);

  let coach = await prisma.coachReferee.findFirst();
  if (!coach) {
    console.log('🥋 No coach found. Creating a default one...');
    coach = await prisma.coachReferee.create({
      data: {
        tempId: 'COACH9999',
        fullName: 'Default Test Coach',
        fatherName: 'Coach Father',
        gender: Gender.MALE,
        dob: new Date(1985, 5, 15),
        age: 41,
        bloodGroup: 'B+',
        mobileNumber: '9888888888',
        email: 'defaultcoach@test.com',
        aadhaarNumber: '299999999999',
        historyInJudo: 'Black Belt 2nd Dan',
        historyInOtherMartial: 'None',
        presentGradeInJudo: '2nd Dan',
        password: dummyPasswordHash,
        status: Status.APPROVED,
        districtId: district.id,
        talukId: talukId,
        clubId: club.id,
        pincode: '600002',
      },
    });
  }

  // 2. Cleanup previous dummy tournaments and dummy students to keep DB clean
  console.log('🧹 Cleaning up previous dummy tournaments...');
  const existingDummyTournaments = await prisma.tournament.findMany({
    where: {
      title: {
        contains: 'Dummy Tournament',
      },
    },
    select: { id: true },
  });

  const dummyIds = existingDummyTournaments.map(t => t.id);

  if (dummyIds.length > 0) {
    await prisma.tournamentRegistrationMessage.deleteMany({
      where: {
        registration: {
          tournamentId: { in: dummyIds },
        },
      },
    });

    await prisma.tournamentRegistration.deleteMany({
      where: {
        tournamentId: { in: dummyIds },
      },
    });

    await prisma.tournamentDraw.deleteMany({
      where: { tournamentId: { in: dummyIds } },
    });

    await prisma.tournamentMat.deleteMany({
      where: { tournamentId: { in: dummyIds } },
    });

    await prisma.tournamentMessage.deleteMany({
      where: { tournamentId: { in: dummyIds } },
    });

    await prisma.tournament.deleteMany({
      where: {
        id: { in: dummyIds },
      },
    });
  }

  await prisma.student.deleteMany({
    where: {
      email: {
        endsWith: '@dummytest.com',
      },
    },
  });
  console.log('✅ Clean up complete.');

  // 3. Define the 8 official age categories configurations
  const categoriesConfig = [
    {
      name: "Mini Sub-Junior Age Group 1",
      birthYears: [2018, 2019],
      minWeight: 12,
      maxWeight: 35
    },
    {
      name: "Mini Sub-Junior Age Group 2",
      birthYears: [2016, 2017],
      minWeight: 18,
      maxWeight: 42
    },
    {
      name: "Mini Sub-Junior Age Group 3",
      birthYears: [2014, 2015],
      minWeight: 22,
      maxWeight: 50
    },
    {
      name: "Sub-Junior",
      birthYears: [2011, 2012, 2013],
      minWeight: 25,
      maxWeight: 75
    },
    {
      name: "Cadet",
      birthYears: [2008, 2009, 2010],
      minWeight: 35,
      maxWeight: 100
    },
    {
      name: "Junior",
      birthYears: [2005, 2006, 2007, 2008, 2009, 2010],
      minWeight: 40,
      maxWeight: 110
    },
    {
      name: "Senior",
      birthYears: [1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004],
      minWeight: 44,
      maxWeight: 120
    },
    {
      name: "Veteran",
      birthYears: [1970, 1971, 1972, 1973, 1974, 1975, 1976, 1977, 1978, 1979, 1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991],
      minWeight: 44,
      maxWeight: 120
    }
  ];

  let studentSequence = 500000;
  let totalTournamentsCreated = 0;
  let totalPlayersCreated = 0;
  let totalRegistrationsCreated = 0;
  let totalDrawsCreated = 0;

  for (const config of categoriesConfig) {
    console.log(`\n🏆 Creating Dummy Tournament for: "${config.name}"`);

    // Create Tournament
    const tournament = await prisma.tournament.create({
      data: {
        title: `Dummy Tournament - ${config.name}`,
        category: config.name,
        date: new Date('2026-10-01'),
        dateTo: new Date('2026-10-03'),
        location: 'Nehru Indoor Stadium, Chennai',
        description: `Dummy tournament for testing bracket generation in category: ${config.name}.`,
        entryFee: 500,
        numberOfMats: 4,
        gender: 'BOTH',
        level: EventLevel.STATE,
        status: Status.APPROVED,
        districtApproval: Status.APPROVED,
        stateApproval: Status.APPROVED,
        superAdminApproval: Status.APPROVED,
        ceoApproval: Status.APPROVED,
        clubId: club.id,
      }
    });
    totalTournamentsCreated++;

    const studentsData: any[] = [];
    const registrationsData: any[] = [];
    const drawsToCreate = new Set<string>();
    const drawsDataList: any[] = [];

    // Generate 1000 players for this tournament
    for (let i = 0; i < 1000; i++) {
      const seq = studentSequence++;
      const gender = i % 2 === 0 ? Gender.MALE : Gender.FEMALE;
      const birthYear = config.birthYears[i % config.birthYears.length];
      const age = 2026 - birthYear;
      const dob = new Date(birthYear, 0, 1);

      // Random weight within category boundaries
      const weightKg = Math.floor(Math.random() * (config.maxWeight - config.minWeight + 1)) + config.minWeight;
      const weightStr = weightKg.toString();

      // Get calculated weight class category
      const weightCat = getWeightCategory(weightKg, gender, config.name);
      const studentId = crypto.randomUUID();

      studentsData.push({
        id: studentId,
        tempId: `STU${seq}`,
        permanentId: `PERM${seq}`,
        fullName: `${gender === Gender.MALE ? 'Male' : 'Female'} Player ${seq}`,
        gender: gender,
        dob: dob,
        age: age,
        bloodGroup: 'O+',
        mobileNumber: `9${seq.toString().padStart(9, '0')}`,
        email: `player${seq}@dummytest.com`,
        aadhaarNumber: `2${seq.toString().padStart(11, '0')}`,
        address: 'Dummy Address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600002',
        addressPincode: '600002',
        nationality: 'Indian',
        annualIncome: 150000,
        isBPL: false,
        clubId: club.id,
        schoolName: 'Chennai Public School',
        grade: '10th',
        password: dummyPasswordHash,
        status: Status.APPROVED,
        isPaid: true,
        districtId: district.id,
        talukId: talukId,
        weight: weightStr,
        height: '165',
      });

      registrationsData.push({
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        playerId: studentId,
        coachId: coach.id,
        status: Status.APPROVED,
        isPaid: true,
        height: '165',
        weight: weightStr,
        placement: Placement.PARTICIPATION,
        ageGroup: config.name,
        weightCategory: weightCat,
        gender: gender,
      });

      // Prepare draws data
      const drawKey = `${tournament.id}_${config.name}_${age}_${gender}_${weightCat}`;
      if (!drawsToCreate.has(drawKey)) {
        drawsToCreate.add(drawKey);
        drawsDataList.push({
          tournamentId: tournament.id,
          ageGroup: config.name,
          exactAge: age,
          gender: gender,
          weightCategory: weightCat,
          rounds: { participants: [] }
        });
      }
    }

    // Bulk inserts
    console.log(`   - Bulk-inserting 1,000 students...`);
    const studentRes = await prisma.student.createMany({
      data: studentsData
    });
    totalPlayersCreated += studentRes.count;

    console.log(`   - Bulk-inserting 1,000 registrations...`);
    const registrationRes = await prisma.tournamentRegistration.createMany({
      data: registrationsData
    });
    totalRegistrationsCreated += registrationRes.count;

    console.log(`   - Bulk-inserting ${drawsDataList.length} tournament draw structures...`);
    const drawRes = await prisma.tournamentDraw.createMany({
      data: drawsDataList,
      skipDuplicates: true
    });
    totalDrawsCreated += drawRes.count;
  }

  // ─── 3-Player Round Robin Tournament Seeding ───
  console.log(`\n🏆 Creating Dummy Tournament for: "3 Players (Round Robin)"`);
  const tournament3P = await prisma.tournament.create({
    data: {
      title: `Dummy Tournament - 3 Players (Round Robin)`,
      category: "Senior",
      date: new Date('2026-10-01'),
      dateTo: new Date('2026-10-03'),
      location: 'Nehru Indoor Stadium, Chennai',
      description: `Dummy tournament with exactly 3 players to test Round Robin bracket rules.`,
      entryFee: 500,
      numberOfMats: 1,
      gender: 'BOTH',
      level: EventLevel.STATE,
      status: Status.APPROVED,
      districtApproval: Status.APPROVED,
      stateApproval: Status.APPROVED,
      superAdminApproval: Status.APPROVED,
      ceoApproval: Status.APPROVED,
      clubId: club.id,
    }
  });
  totalTournamentsCreated++;

  const students3P: Prisma.StudentCreateManyInput[] = [];
  const regs3P: Prisma.TournamentRegistrationCreateManyInput[] = [];
  
  for (let i = 1; i <= 3; i++) {
    const seq = studentSequence++;
    const studentId = crypto.randomUUID();
    const age = 22;
    const dob = new Date(2004, 0, 1);
    const weightStr = "58"; // maps to -60kg
    const weightCat = "-60kg";

    students3P.push({
      id: studentId,
      tempId: `STU${seq}`,
      permanentId: `PERM${seq}`,
      fullName: `RR3 Fighter ${i}`,
      gender: Gender.MALE,
      dob: dob,
      age: age,
      bloodGroup: 'A+',
      mobileNumber: `9${seq.toString().padStart(9, '0')}`,
      email: `rr3player${i}@dummytest.com`,
      aadhaarNumber: `2${seq.toString().padStart(11, '0')}`,
      address: 'Dummy Address',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600002',
      addressPincode: '600002',
      nationality: 'Indian',
      annualIncome: 150000,
      isBPL: false,
      clubId: club.id,
      schoolName: 'Chennai Public School',
      grade: 'College',
      password: dummyPasswordHash,
      status: Status.APPROVED,
      isPaid: true,
      districtId: district.id,
      talukId: talukId,
      weight: weightStr,
      height: '170',
    });

    regs3P.push({
      id: crypto.randomUUID(),
      tournamentId: tournament3P.id,
      playerId: studentId,
      coachId: coach.id,
      status: Status.APPROVED,
      isPaid: true,
      height: '170',
      weight: weightStr,
      placement: Placement.PARTICIPATION,
      ageGroup: "Senior",
      weightCategory: weightCat,
      gender: Gender.MALE,
    });
  }

  await prisma.student.createMany({ data: students3P });
  await prisma.tournamentRegistration.createMany({ data: regs3P });
  await prisma.tournamentDraw.create({
    data: {
      tournamentId: tournament3P.id,
      ageGroup: "Senior",
      exactAge: 22,
      gender: Gender.MALE,
      weightCategory: "-60kg",
      rounds: { participants: [] }
    }
  });

  totalPlayersCreated += 3;
  totalRegistrationsCreated += 3;
  totalDrawsCreated += 1;

  // ─── 2-Player Round Robin Tournament Seeding ───
  console.log(`\n🏆 Creating Dummy Tournament for: "2 Players (Round Robin)"`);
  const tournament2P = await prisma.tournament.create({
    data: {
      title: `Dummy Tournament - 2 Players (Round Robin)`,
      category: "Senior",
      date: new Date('2026-10-01'),
      dateTo: new Date('2026-10-03'),
      location: 'Nehru Indoor Stadium, Chennai',
      description: `Dummy tournament with exactly 2 players to test Round Robin bracket rules.`,
      entryFee: 500,
      numberOfMats: 1,
      gender: 'BOTH',
      level: EventLevel.STATE,
      status: Status.APPROVED,
      districtApproval: Status.APPROVED,
      stateApproval: Status.APPROVED,
      superAdminApproval: Status.APPROVED,
      ceoApproval: Status.APPROVED,
      clubId: club.id,
    }
  });
  totalTournamentsCreated++;

  const students2P: Prisma.StudentCreateManyInput[] = [];
  const regs2P: Prisma.TournamentRegistrationCreateManyInput[] = [];
  
  for (let i = 1; i <= 2; i++) {
    const seq = studentSequence++;
    const studentId = crypto.randomUUID();
    const age = 22;
    const dob = new Date(2004, 0, 1);
    const weightStr = "58"; // maps to -60kg
    const weightCat = "-60kg";

    students2P.push({
      id: studentId,
      tempId: `STU${seq}`,
      permanentId: `PERM${seq}`,
      fullName: `RR2 Fighter ${i}`,
      gender: Gender.MALE,
      dob: dob,
      age: age,
      bloodGroup: 'B+',
      mobileNumber: `9${seq.toString().padStart(9, '0')}`,
      email: `rr2player${i}@dummytest.com`,
      aadhaarNumber: `2${seq.toString().padStart(11, '0')}`,
      address: 'Dummy Address',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600002',
      addressPincode: '600002',
      nationality: 'Indian',
      annualIncome: 150000,
      isBPL: false,
      clubId: club.id,
      schoolName: 'Chennai Public School',
      grade: 'College',
      password: dummyPasswordHash,
      status: Status.APPROVED,
      isPaid: true,
      districtId: district.id,
      talukId: talukId,
      weight: weightStr,
      height: '170',
    });

    regs2P.push({
      id: crypto.randomUUID(),
      tournamentId: tournament2P.id,
      playerId: studentId,
      coachId: coach.id,
      status: Status.APPROVED,
      isPaid: true,
      height: '170',
      weight: weightStr,
      placement: Placement.PARTICIPATION,
      ageGroup: "Senior",
      weightCategory: weightCat,
      gender: Gender.MALE,
    });
  }

  await prisma.student.createMany({ data: students2P });
  await prisma.tournamentRegistration.createMany({ data: regs2P });
  await prisma.tournamentDraw.create({
    data: {
      tournamentId: tournament2P.id,
      ageGroup: "Senior",
      exactAge: 22,
      gender: Gender.MALE,
      weightCategory: "-60kg",
      rounds: { participants: [] }
    }
  });

  totalPlayersCreated += 2;
  totalRegistrationsCreated += 2;
  totalDrawsCreated += 1;

  console.log('\n==================================================');
  console.log('🎉 SEEDING COMPLETE SUMMARY');
  console.log(`   ✅ Tournaments created     : ${totalTournamentsCreated}`);
  console.log(`   ✅ Students created        : ${totalPlayersCreated}`);
  console.log(`   ✅ Registrations created   : ${totalRegistrationsCreated}`);
  console.log(`   ✅ Tournament Draws created: ${totalDrawsCreated}`);
  console.log('==================================================');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
