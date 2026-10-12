import { PrismaClient, Status, Gender, MemberRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

let _seq = 1000;
function nextSeq(): number {
  return _seq++;
}

function uniqueMobile(): string {
  const n = nextSeq();
  return `9${n.toString().padStart(9, '0')}`;
}

function uniqueAadhaar(): string {
  const n = nextSeq();
  return `2${n.toString().padStart(11, '0')}`;
}

function uid(): string {
  return nextSeq().toString().padStart(7, '0');
}

async function main() {
  console.log('🚀 Tamil Nadu Judo Association — Database Seed');
  console.log('\n═══════════════════════════════════════════════════════\n');

  console.log('🗑️  Cleaning existing data...');
  await prisma.tournamentRegistrationMessage.deleteMany().catch(() => {});
  await prisma.tournamentMat.deleteMany().catch(() => {});
  await prisma.tournamentDraw.deleteMany().catch(() => {});
  await prisma.tournamentRegistration.deleteMany().catch(() => {});
  await prisma.tournamentMessage.deleteMany().catch(() => {});
  await prisma.tournament.deleteMany().catch(() => {});
  await prisma.eventRegistration.deleteMany().catch(() => {});
  await prisma.event.deleteMany().catch(() => {});
  await prisma.student.deleteMany().catch(() => {});
  await prisma.coachReferee.deleteMany().catch(() => {});
  await prisma.member.deleteMany().catch(() => {});
  await prisma.club.deleteMany().catch(() => {});
  await prisma.taluk.deleteMany().catch(() => {});
  await prisma.district.deleteMany().catch(() => {});
  console.log('✅ Database cleaned');

  console.log('\n📍 Creating Districts & Taluks from tn-districts-taluks.json...');
  const districtRecs: { id: string; name: string; talukId: string }[] = [];

  const locationsData: { district: string; taluks: string[] }[] = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'prisma', 'data', 'tn-districts-taluks.json'), 'utf8')
  );

  for (const dist of locationsData) {
    const d = await prisma.district.create({
      data: {
        name: dist.district,
        taluks: {
          create: dist.taluks.map((name: string) => ({ name, pincode: "600001" })),
        },
      },
      include: { taluks: true },
    });
    districtRecs.push({ id: d.id, name: d.name, talukId: d.taluks[0].id });
  }
  console.log(`✅ ${districtRecs.length} Districts created`);

  // Choose one target district for all demo entities (Chennai)
  const targetDistrict = districtRecs.find(dist => dist.name.toLowerCase() === 'chennai') || districtRecs[0];
  const targetTalukId = targetDistrict.talukId;
  console.log(`\n🎯 Selected Single District for Demo Accounts: ${targetDistrict.name}`);

  const defaultPassword = 'Password@123';
  const hashedDemoPassword = await bcrypt.hash(defaultPassword, 10);
  const oneYearLater = new Date();
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  // ── 1. Super Admin ──────────────────────────────────────────────────────────
  console.log('\n👑 Creating Super Admin...');
  const adminHashedPassword = await bcrypt.hash('Seed@1234', 10);
  await prisma.member.create({
    data: {
      tempId: 'ADMIN-TEMP01',
      permanentId: 'ADMIN-001',
      fullName: 'Super Admin',
      fatherName: 'System Admin',
      gender: Gender.MALE,
      dob: new Date(1980, 0, 1),
      bloodGroup: 'O+',
      mobileNumber: '9900000001',
      email: 'admin@tnja.in',
      aadhaarNumber: '290000000001',
      addressLine1: 'TNJA State Headquarters, Nehru Stadium',
      city: 'Chennai',
      addressPincode: '600003',
      pincode: '600003',
      districtId: targetDistrict.id,
      assignedDistrictId: targetDistrict.id,
      talukId: targetTalukId,
      role: MemberRole.CEO,
      status: Status.APPROVED,
      isPaid: true,
      validUntil: oneYearLater,
      mustChangePassword: false,
      password: adminHashedPassword,
    },
  });
  console.log('✅ Super Admin created (Email: admin@tnja.in | Password: Seed@1234)');

  // ── 2. Demo Club ───────────────────────────────────────────────────────────
  console.log('\n🏢 Creating Demo Club (Chennai District)...');
  const demoClub = await prisma.club.create({
    data: {
      tempId: 'CLUB-TEMP01',
      permanentId: 'CLUB-CHN-001',
      name: 'Chennai Warriors Judo Club',
      email: 'club@demo.tnja.in',
      mobileNumber: '9840011111',
      pincode: '600002',
      address1: '14, Anna Salai, Mount Road',
      president: 'R. Ramanathan',
      secretary: 'S. Suresh',
      coach: 'K. Vijay',
      noOfStudents: 35,
      maleStudents: 20,
      femaleStudents: 15,
      districtId: targetDistrict.id,
      talukId: targetTalukId,
      status: Status.APPROVED,
      isPaid: true,
      validUntil: oneYearLater,
      mustChangePassword: false,
      password: hashedDemoPassword,
    },
  });
  console.log('✅ Demo Club created (Email: club@demo.tnja.in | Permanent ID: CLUB-CHN-001)');

  // ── 3. Demo Coaches (2 Coaches) ─────────────────────────────────────────────
  console.log('\n🥋 Creating Demo Coaches (Chennai District & Demo Club)...');
  const demoCoach1 = await prisma.coachReferee.create({
    data: {
      tempId: 'COACH-TEMP01',
      permanentId: 'COACH-CHN-001',
      fullName: 'K. Vijay (Head Coach)',
      fatherName: 'K. Kumar',
      gender: Gender.MALE,
      dob: new Date(1986, 4, 12),
      age: 40,
      bloodGroup: 'B+',
      mobileNumber: '9840022221',
      email: 'coach1@demo.tnja.in',
      aadhaarNumber: '211111111111',
      historyInJudo: 'Black Belt 3rd Dan, 10 Years Coaching Experience, State Gold Medalist',
      historyInOtherMartial: 'Karate Brown Belt',
      presentGradeInJudo: '3rd Dan',
      coachName: 'K. Vijay',
      refereeName: 'K. Vijay',
      employmentType: 'Full-time Coach',
      companyName: 'Chennai Warriors Judo Club',
      designation: 'Chief Coach',
      pincode: '600002',
      districtId: targetDistrict.id,
      talukId: targetTalukId,
      clubId: demoClub.id,
      status: Status.APPROVED,
      isPaid: true,
      validUntil: oneYearLater,
      mustChangePassword: false,
      password: hashedDemoPassword,
    },
  });

  const demoCoach2 = await prisma.coachReferee.create({
    data: {
      tempId: 'COACH-TEMP02',
      permanentId: 'COACH-CHN-002',
      fullName: 'Ananya Sharma (Assistant Coach & Referee)',
      fatherName: 'R. Sharma',
      gender: Gender.FEMALE,
      dob: new Date(1992, 7, 24),
      age: 34,
      bloodGroup: 'A+',
      mobileNumber: '9840022222',
      email: 'coach2@demo.tnja.in',
      aadhaarNumber: '211111111112',
      historyInJudo: 'Black Belt 1st Dan, National Referee Grade B certified',
      historyInOtherMartial: 'None',
      presentGradeInJudo: '1st Dan',
      coachName: 'Ananya Sharma',
      refereeName: 'Ananya Sharma',
      employmentType: 'Assistant Coach',
      companyName: 'Chennai Warriors Judo Club',
      designation: 'Referee & Coach',
      pincode: '600002',
      districtId: targetDistrict.id,
      talukId: targetTalukId,
      clubId: demoClub.id,
      status: Status.APPROVED,
      isPaid: true,
      validUntil: oneYearLater,
      mustChangePassword: false,
      password: hashedDemoPassword,
    },
  });
  console.log('✅ Demo Coach 1 created (Email: coach1@demo.tnja.in | Permanent ID: COACH-CHN-001)');
  console.log('✅ Demo Coach 2 created (Email: coach2@demo.tnja.in | Permanent ID: COACH-CHN-002)');

  // ── 4. Demo Player (Student) ───────────────────────────────────────────────
  console.log('\n🤼 Creating Demo Player (Chennai District & Demo Club)...');
  const demoPlayer = await prisma.student.create({
    data: {
      tempId: 'STUD-TEMP01',
      permanentId: 'PLAYER-CHN-001',
      fullName: 'Arun Kumar (Demo Player)',
      gender: Gender.MALE,
      dob: new Date(2008, 2, 15),
      age: 18,
      bloodGroup: 'O+',
      mobileNumber: '9840033331',
      email: 'player@demo.tnja.in',
      aadhaarNumber: '222222222221',
      address: '45, Gandhi Street, T. Nagar',
      city: 'Chennai',
      state: 'Tamil Nadu',
      addressPincode: '600017',
      pincode: '600017',
      nationality: 'Indian',
      annualIncome: 120000,
      isBPL: false,
      institutionType: 'SCHOOL',
      schoolName: 'Chennai Higher Secondary School',
      grade: '12th Standard',
      height: '172',
      weight: '66',
      belt: 'Brown Belt',
      wins: 8,
      losses: 2,
      draws: 1,
      districtId: targetDistrict.id,
      talukId: targetTalukId,
      clubId: demoClub.id,
      coachId: demoCoach1.id,
      status: Status.APPROVED,
      isPaid: true,
      validUntil: oneYearLater,
      mustChangePassword: false,
      password: hashedDemoPassword,
    },
  });
  console.log('✅ Demo Player created (Email: player@demo.tnja.in | Permanent ID: PLAYER-CHN-001)');

  // ── 5. 4 Demo Members (under Chennai District) ──────────────────────────────
  console.log('\n👥 Creating 4 Demo Members (All under Chennai District)...');

  const demoMembersData = [
    {
      tempId: 'MEM-TEMP01',
      permanentId: 'MEM-CHN-PRES',
      fullName: 'Dr. K. Rajasekaran (District President)',
      fatherName: 'M. Karuppan',
      gender: Gender.MALE,
      dob: new Date(1972, 5, 20),
      bloodGroup: 'A+',
      mobileNumber: '9840044441',
      email: 'president.chennai@demo.tnja.in',
      aadhaarNumber: '233333333331',
      addressLine1: '10, Taylors Road, Kilpauk',
      city: 'Chennai',
      addressPincode: '600010',
      pincode: '600010',
      role: MemberRole.DISTRICT_PRESIDENT,
      designation: 'President - Chennai District Judo Association',
      companyName: 'TNJA Chennai District Unit',
    },
    {
      tempId: 'MEM-TEMP02',
      permanentId: 'MEM-CHN-SEC',
      fullName: 'M. Balasubramanian (District Secretary)',
      fatherName: 'T. Muthusamy',
      gender: Gender.MALE,
      dob: new Date(1976, 8, 14),
      bloodGroup: 'B+',
      mobileNumber: '9840044442',
      email: 'secretary.chennai@demo.tnja.in',
      aadhaarNumber: '233333333332',
      addressLine1: '25, North Usman Road, T. Nagar',
      city: 'Chennai',
      addressPincode: '600017',
      pincode: '600017',
      role: MemberRole.DISTRICT_SECRETARY,
      designation: 'Secretary - Chennai District Judo Association',
      companyName: 'TNJA Chennai District Unit',
    },
    {
      tempId: 'MEM-TEMP03',
      permanentId: 'MEM-CHN-003',
      fullName: 'S. Meenakshi (District Member)',
      fatherName: 'N. Sundaram',
      gender: Gender.FEMALE,
      dob: new Date(1985, 2, 10),
      bloodGroup: 'O+',
      mobileNumber: '9840044443',
      email: 'member.chennai@demo.tnja.in',
      aadhaarNumber: '233333333333',
      addressLine1: '8, First Avenue, Shastri Nagar, Adyar',
      city: 'Chennai',
      addressPincode: '600020',
      pincode: '600020',
      role: MemberRole.MEMBER,
      designation: 'Executive Committee Member',
      companyName: 'TNJA Chennai District Unit',
    },
    {
      tempId: 'MEM-TEMP04',
      permanentId: 'MEM-CHN-ZONE',
      fullName: 'R. Venkatesh (Zone President)',
      fatherName: 'V. Ramachandran',
      gender: Gender.MALE,
      dob: new Date(1974, 11, 5),
      bloodGroup: 'AB+',
      mobileNumber: '9840044444',
      email: 'zone.president@demo.tnja.in',
      aadhaarNumber: '233333333334',
      addressLine1: '32, GST Road, Guindy',
      city: 'Chennai',
      addressPincode: '600032',
      pincode: '600032',
      role: MemberRole.ZONE_PRESIDENT,
      designation: 'Zone In-charge & President',
      companyName: 'TNJA Northern Zone',
    },
  ];

  for (const m of demoMembersData) {
    await prisma.member.create({
      data: {
        tempId: m.tempId,
        permanentId: m.permanentId,
        fullName: m.fullName,
        fatherName: m.fatherName,
        gender: m.gender,
        dob: m.dob,
        bloodGroup: m.bloodGroup,
        mobileNumber: m.mobileNumber,
        email: m.email,
        aadhaarNumber: m.aadhaarNumber,
        addressLine1: m.addressLine1,
        city: m.city,
        addressPincode: m.addressPincode,
        pincode: m.pincode,
        districtId: targetDistrict.id,
        assignedDistrictId: targetDistrict.id,
        talukId: targetTalukId,
        role: m.role,
        designation: m.designation,
        companyName: m.companyName,
        status: Status.APPROVED,
        isPaid: true,
        validUntil: oneYearLater,
        mustChangePassword: false,
        password: hashedDemoPassword,
      },
    });
    console.log(`✅ Member created: ${m.fullName} (${m.role}) -> ${m.email}`);
  }

  console.log('\n' + '═'.repeat(65));
  console.log('              SEED COMPLETE — CREDENTIALS SUMMARY              ');
  console.log('═'.repeat(65));
  console.log(`  District              : ${targetDistrict.name}`);
  console.log(`  Default Demo Password : ${defaultPassword}`);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('  👑 Super Admin        : admin@tnja.in              | Seed@1234');
  console.log('  🏢 Demo Club          : club@demo.tnja.in          | Password@123  (ID: CLUB-CHN-001)');
  console.log('  🥋 Demo Coach 1       : coach1@demo.tnja.in        | Password@123  (ID: COACH-CHN-001)');
  console.log('  🥋 Demo Coach 2       : coach2@demo.tnja.in        | Password@123  (ID: COACH-CHN-002)');
  console.log('  🤼 Demo Player        : player@demo.tnja.in        | Password@123  (ID: PLAYER-CHN-001)');
  console.log('  👥 Member (President) : president.chennai@demo.tnja.in | Password@123  (ID: MEM-CHN-PRES)');
  console.log('  👥 Member (Secretary) : secretary.chennai@demo.tnja.in | Password@123  (ID: MEM-CHN-SEC)');
  console.log('  👥 Member (Committee) : member.chennai@demo.tnja.in    | Password@123  (ID: MEM-CHN-003)');
  console.log('  👥 Member (Zone Pres) : zone.president@demo.tnja.in    | Password@123  (ID: MEM-CHN-ZONE)');
  console.log('═'.repeat(65) + '\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });