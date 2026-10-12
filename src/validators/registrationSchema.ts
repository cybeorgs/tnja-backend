import { z } from "zod";

const GenderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);

const stringToNumber = z.string().transform((val) => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? 0 : parsed;
}).or(z.number());

export const studentRegistrationSchema = z.object({
  districtId: z.string().uuid("Invalid District selection"),
  talukId: z.string().uuid("Invalid Taluk selection"),
  pincode: z.string().length(6, "Pincode must be 6 digits"),
  fullName: z.string().min(3, "Full name is required"),
  gender: GenderEnum,
  dob: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).transform((val) => new Date(val)),
  age: z.number().min(3, "Player must be at least 3 years old"),
  bloodGroup: z.string().min(1),
  mobileNumber: z.string().regex(/^[0-9]{10}$/, "Invalid mobile number"),
  alternateMobileNumber: z.string().optional(),
  email: z.string().email("Invalid email address"),
  aadhaarNumber: z.string().length(12, "Aadhaar must be 12 digits"),
  address: z.string().min(5),
  city: z.string().min(1),
  state: z.string().min(1),
  addressPincode: z.string().length(6),
  nationality: z.string().min(1),
  annualIncome: z.number(),
  isBPL: z.boolean(),
  clubId: z.string().optional().or(z.literal("")),
  coachId: z.string().optional().or(z.literal("")),
  institutionType: z.enum(["SCHOOL", "COLLEGE", "DIPLOMA"]).optional().default("SCHOOL"),
  schoolName: z.string().min(1),
  grade: z.string().min(1),
  degreeDepartment: z.string().optional().or(z.literal("")),
  profilePhoto: z.string().optional().or(z.literal("")),
  bplProof: z.string().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.isBPL && (!data.bplProof || data.bplProof === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "BPL proof image is required when BPL is selected",
      path: ["bplProof"],
    });
  }
});

export const coachRegistrationSchema = z.object({
  districtId: z.string().uuid("Invalid District selection"),
  talukId: z.string().uuid("Invalid Taluk selection"),
  pincode: z.string().length(6),
  fullName: z.string().min(3),
  fatherName: z.string().min(3),
  gender: GenderEnum,
  dob: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).transform((val) => new Date(val)),
  age: z.number().min(18),
  bloodGroup: z.string().min(1),
  mobileNumber: z.string().regex(/^[0-9]{10}$/),
  alternateMobileNumber: z.string().optional(),
  email: z.string().email(),
  aadhaarNumber: z.string().length(12),
  historyInJudo: z.string().min(1),
  historyInOtherMartial: z.string().min(1),
  presentGradeInJudo: z.string().min(1),
  coachName: z.string().optional(),
  refereeName: z.string().optional(),
  deptName: z.string().optional().or(z.literal("")),
  contactPersonDept: z.string().optional().or(z.literal("")),
  addressDept: z.string().optional().or(z.literal("")),
  employmentType: z.string().optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  designation: z.string().optional().or(z.literal("")),
  clubId: z.string().optional().or(z.literal("")),
  profilePhoto: z.string().optional().or(z.literal("")),
});

export const clubRegistrationSchema = z.object({
  districtId: z.string().uuid("Invalid District selection"),
  talukId: z.string().uuid("Invalid Taluk selection"),
  clubName: z.string().min(1),
  mobileNumber: z.string().regex(/^[0-9]{10}$/),
  email: z.string().email(),
  pincode: z.string().length(6),
  address1: z.string().min(1),
  address2: z.string().optional(),
  president: z.string().min(1),
  secretary: z.string().min(1),
  coach: z.string().min(1),
  noOfStudents: stringToNumber,
  maleStudents: stringToNumber,
  femaleStudents: stringToNumber,
  age6to11Male: stringToNumber,
  age6to11Female: stringToNumber,
  age12to18Male: stringToNumber,
  age12to18Female: stringToNumber,
  age16AboveMale: stringToNumber,
  age16AboveFemale: stringToNumber,
  profilePhoto: z.string().optional().or(z.literal("")),
});

export const memberRegistrationSchema = z.object({
  districtId: z.string().uuid("Invalid District selection"),
  talukId: z.string().uuid("Invalid Taluk selection"),
  pincode: z.string().length(6, "Pincode must be 6 digits"),
  fullName: z.string().min(3, "Full name is required"),
  fatherName: z.string().min(3, "Father's name is required"),
  gender: GenderEnum,
  dob: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).transform((val) => new Date(val)),
  bloodGroup: z.string().min(1),
  mobileNumber: z.string().regex(/^[0-9]{10}$/, "Invalid mobile number"),
  alternateMobileNumber: z.string().optional(),
  email: z.string().email("Invalid email address"),
  aadhaarNumber: z.string().length(12, "Aadhaar must be 12 digits"),
  addressLine1: z.string().min(5),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  addressPincode: z.string().length(6),
  profilePhoto: z.string().optional().or(z.literal("")),
  employmentType: z.string().optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  designation: z.string().optional().or(z.literal("")),
  workLocation: z.string().optional().or(z.literal("")),
});
