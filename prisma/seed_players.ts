import { PrismaClient, Status, Gender } from '@prisma/client';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const prisma = new PrismaClient();

// Helper to generate a random sequence number for unique identifiers
let _seq = Math.floor(100000 + Math.random() * 900000);
function nextSeq(): number {
  return _seq++;
}

async function main() {
  const excelFilePath = path.join(process.cwd(), 'players.xlsx');

  if (!fs.existsSync(excelFilePath)) {
    console.error(`\n❌ Error: Excel file not found at: ${excelFilePath}`);
    console.error('Please create a "players.xlsx" file in the root of the "tnja-backend" directory first.\n');
    console.log('Ensure it contains the following headers (column names):');
    console.log(' - Full Name');
    console.log(' - Email');
    console.log(' - Mobile Number');
    console.log(' - Aadhaar Number');
    console.log(' - Date of Birth (YYYY-MM-DD)');
    console.log(' - Gender (MALE or FEMALE)');
    console.log(' - Blood Group (e.g. O+, A+)');
    console.log(' - Address');
    console.log(' - City');
    console.log(' - State');
    console.log(' - Pincode');
    console.log(' - District Name (e.g. Chennai)');
    console.log(' - Taluk Name (e.g. Chennai Central Taluk)');
    console.log(' - School Name (optional)');
    console.log(' - Grade (optional)');
    console.log(' - Annual Income (optional, e.g. 150000)');
    console.log(' - Height (optional, e.g. 165)');
    console.log(' - Weight (optional, e.g. 55)');
    console.log(' - Status (optional, APPROVED or PENDING, defaults to APPROVED)');
    process.exit(1);
  }

  console.log(`🚀 TNJA Player Excel Seeder started...`);
  console.log(`📖 Loading file: ${excelFilePath}`);

  const workbook = xlsx.readFile(excelFilePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName as string];
  const rows = xlsx.utils.sheet_to_json<any>(sheet as any);

  console.log(`🔍 Found ${rows.length} rows in the Excel sheet.`);

  const dummyPasswordHash = await bcrypt.hash('Welcome@123', 10);
  let successCount = 0;
  let errorCount = 0;

  for (const [index, row] of rows.entries()) {
    const rowNum = index + 2; // Row number in Excel file (1-indexed + header)

    // Map headers case-insensitively / with various spaces
    const fullName = row['Full Name'] || row['FullName'] || row['Name'];
    const email = row['Email'] || row['Email ID'] || row['EmailId'];
    const mobile = row['Mobile Number'] || row['Mobile'] || row['MobileNumber'];
    const aadhaar = row['Aadhaar Number'] || row['Aadhaar'] || row['AadhaarNumber'];
    const dobRaw = row['Date of Birth'] || row['DOB'] || row['DateOfBirth'];
    const genderRaw = row['Gender'] || row['Sex'];
    const bloodGroup = row['Blood Group'] || row['BloodGroup'] || 'O+';
    const address = row['Address'] || 'N/A';
    const city = row['City'] || 'Chennai';
    const state = row['State'] || 'Tamil Nadu';
    const pincode = String(row['Pincode'] || row['ZipCode'] || '600002');
    const districtName = row['District Name'] || row['District'];
    const talukName = row['Taluk Name'] || row['Taluk'];
    const schoolName = row['School Name'] || row['SchoolName'] || row['School'] || 'Chennai Public School';
    const grade = row['Grade'] || row['Class'] || '10th';
    const annualIncome = parseFloat(row['Annual Income'] || row['AnnualIncome'] || row['Income'] || '150000');
    const height = row['Height'] ? String(row['Height']) : '165';
    const weight = row['Weight'] ? String(row['Weight']) : '55';
    const statusRaw = row['Status'] || 'APPROVED';

    // Validations
    if (!fullName || !email || !mobile || !aadhaar || !dobRaw || !genderRaw || !districtName || !talukName) {
      console.warn(`⚠️ [Row ${rowNum}] Skipping: Missing required fields (Name, Email, Mobile, Aadhaar, DOB, Gender, District, or Taluk).`);
      errorCount++;
      continue;
    }

    // Gender parsing
    let gender = Gender.MALE;
    if (String(genderRaw).toUpperCase().trim() === 'FEMALE') {
      gender = Gender.FEMALE;
    } else if (String(genderRaw).toUpperCase().trim() === 'OTHER') {
      gender = Gender.OTHER;
    }

    // Status parsing
    let status = Status.APPROVED;
    if (String(statusRaw).toUpperCase().trim() === 'PENDING') {
      status = Status.PENDING;
    }

    // DOB parsing
    let dob: Date;
    try {
      // Excel serial date check or direct string/date parse
      if (typeof dobRaw === 'number') {
        // Convert Excel serial date
        dob = new Date((dobRaw - 25569) * 86400 * 1000);
      } else {
        dob = new Date(dobRaw);
      }
      if (isNaN(dob.getTime())) {
        throw new Error('Invalid Date format');
      }
    } catch (e) {
      console.error(`❌ [Row ${rowNum}] Invalid date of birth: "${dobRaw}". Expecting YYYY-MM-DD.`);
      errorCount++;
      continue;
    }

    // Age calculation based on current year
    const age = new Date().getFullYear() - dob.getFullYear();

    try {
      // Look up District in DB
      const districtDb = await prisma.district.findFirst({
        where: { name: { equals: String(districtName).trim(), mode: 'insensitive' } },
      });

      if (!districtDb) {
        console.error(`❌ [Row ${rowNum}] District not found in DB: "${districtName}". Please seed locations first.`);
        errorCount++;
        continue;
      }

      // Look up Taluk under this district in DB
      const talukDb = await prisma.taluk.findFirst({
        where: {
          districtId: districtDb.id,
          name: { equals: String(talukName).trim(), mode: 'insensitive' },
        },
      });

      if (!talukDb) {
        console.error(`❌ [Row ${rowNum}] Taluk not found in DB under "${districtName}": "${talukName}".`);
        errorCount++;
        continue;
      }

      // Check duplicate records
      const existingPlayer = await prisma.student.findFirst({
        where: {
          OR: [
            { email: String(email).trim() },
            { mobileNumber: String(mobile).trim() },
            { aadhaarNumber: String(aadhaar).trim() }
          ]
        }
      });

      if (existingPlayer) {
        console.warn(`⚠️ [Row ${rowNum}] Duplicate check: Player with Email, Mobile, or Aadhaar already exists. Skipping.`);
        errorCount++;
        continue;
      }

      // Generate IDs
      const seq = nextSeq();
      const tempId = `STU${seq}`;
      const permanentId = status === Status.APPROVED ? `PERM${seq}` : null;

      // Insert Student
      await prisma.student.create({
        data: {
          tempId,
          permanentId,
          fullName: String(fullName).trim(),
          gender,
          dob,
          age,
          bloodGroup: String(bloodGroup).trim(),
          mobileNumber: String(mobile).trim(),
          email: String(email).trim(),
          aadhaarNumber: String(aadhaar).trim(),
          address: String(address).trim(),
          city: String(city).trim(),
          state: String(state).trim(),
          pincode,
          addressPincode: pincode,
          nationality: 'Indian',
          annualIncome,
          isBPL: false,
          schoolName: String(schoolName).trim(),
          grade: String(grade).trim(),
          password: dummyPasswordHash,
          status,
          isPaid: status === Status.APPROVED,
          districtId: districtDb.id,
          talukId: talukDb.id,
          weight,
          height,
        },
      });

      console.log(`✅ [Row ${rowNum}] Imported player: ${fullName} (ID: ${tempId} / ${permanentId || 'PENDING'})`);
      successCount++;
    } catch (err: any) {
      console.error(`❌ [Row ${rowNum}] Database error inserting player:`, err.message || err);
      errorCount++;
    }
  }

  console.log(`\n=========================================`);
  console.log(`🏁 Import Summary:`);
  console.log(` - Successfully Seeded : ${successCount}`);
  console.log(` - Skipped / Errors    : ${errorCount}`);
  console.log(`=========================================\n`);
}

main()
  .catch((e) => {
    console.error('❌ Excel seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
