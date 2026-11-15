// Fields an admin may edit on each kind of account (User Management → Edit). The admin screen builds
// its form from this list, and updateUserProfile accepts only these keys. Credentials, IDs, status
// and payment fields are handled elsewhere and are never editable here.

export type FieldType = "text" | "email" | "tel" | "textarea" | "date" | "int" | "float" | "bool" | "gender" | "bloodGroup" | "district" | "taluk" | "club" | "coach";

export interface ProfileField {
  key: string;
  label: string;
  type: FieldType;
  section: string;
  /** Required columns can't be cleared */
  required?: boolean;
}

const f = (key: string, label: string, type: FieldType, section: string, required = false): ProfileField => ({ key, label, type, section, required });

const PERSONAL = "Personal";
const CONTACT = "Contact";
const ADDRESS = "Address";
const JUDO = "Judo & club";
const WORK = "Work";
const MEMBERSHIP = "Membership";

const STUDENT: ProfileField[] = [
  f("fullName", "Full name", "text", PERSONAL, true),
  f("gender", "Gender", "gender", PERSONAL, true),
  f("dob", "Date of birth", "date", PERSONAL, true),
  f("bloodGroup", "Blood group", "bloodGroup", PERSONAL, true),
  f("aadhaarNumber", "Aadhaar number", "text", PERSONAL, true),
  f("nationality", "Nationality", "text", PERSONAL, true),
  f("profilePhoto", "Profile photo URL", "text", PERSONAL),
  f("mobileNumber", "Mobile number", "tel", CONTACT, true),
  f("alternateMobileNumber", "Alternate mobile", "tel", CONTACT),
  f("email", "Email", "email", CONTACT, true),
  f("districtId", "District", "district", ADDRESS, true),
  f("talukId", "Taluk", "taluk", ADDRESS, true),
  f("pincode", "Pincode", "text", ADDRESS, true),
  f("address", "Address", "textarea", ADDRESS, true),
  f("city", "City", "text", ADDRESS, true),
  f("state", "State", "text", ADDRESS, true),
  f("addressPincode", "Address pincode", "text", ADDRESS, true),
  f("clubId", "Club", "club", JUDO),
  f("coachId", "Coach", "coach", JUDO),
  f("belt", "Belt", "text", JUDO),
  f("height", "Height (cm)", "text", JUDO),
  f("weight", "Weight (kg)", "text", JUDO),
  f("institutionType", "Institution type", "text", "Education"),
  f("schoolName", "School / college", "text", "Education", true),
  f("grade", "Grade / class", "text", "Education", true),
  f("degreeDepartment", "Degree / department", "text", "Education"),
  f("annualIncome", "Annual family income (₹)", "float", MEMBERSHIP, true),
  f("isBPL", "Below poverty line (BPL)", "bool", MEMBERSHIP, true),
  f("validUntil", "Membership valid until", "date", MEMBERSHIP),
];

const COACH: ProfileField[] = [
  f("fullName", "Full name", "text", PERSONAL, true),
  f("fatherName", "Father's name", "text", PERSONAL, true),
  f("gender", "Gender", "gender", PERSONAL, true),
  f("dob", "Date of birth", "date", PERSONAL, true),
  f("bloodGroup", "Blood group", "bloodGroup", PERSONAL, true),
  f("aadhaarNumber", "Aadhaar number", "text", PERSONAL, true),
  f("profilePhoto", "Profile photo URL", "text", PERSONAL),
  f("mobileNumber", "Mobile number", "tel", CONTACT, true),
  f("alternateMobileNumber", "Alternate mobile", "tel", CONTACT),
  f("email", "Email", "email", CONTACT, true),
  f("districtId", "District", "district", ADDRESS, true),
  f("talukId", "Taluk", "taluk", ADDRESS, true),
  f("pincode", "Pincode", "text", ADDRESS, true),
  f("clubId", "Club", "club", JUDO),
  f("presentGradeInJudo", "Present grade in judo", "text", JUDO, true),
  f("historyInJudo", "History in judo", "textarea", JUDO, true),
  f("historyInOtherMartial", "Other martial arts", "textarea", JUDO, true),
  f("coachName", "Coach name", "text", JUDO),
  f("refereeName", "Referee name", "text", JUDO),
  f("employmentType", "Employment type", "text", WORK),
  f("companyName", "Company", "text", WORK),
  f("designation", "Designation", "text", WORK),
  f("deptName", "Department", "text", WORK),
  f("contactPersonDept", "Department contact person", "text", WORK),
  f("addressDept", "Department address", "textarea", WORK),
  f("validUntil", "Membership valid until", "date", MEMBERSHIP),
];

const MEMBER: ProfileField[] = [
  f("fullName", "Full name", "text", PERSONAL, true),
  f("fatherName", "Father's name", "text", PERSONAL, true),
  f("gender", "Gender", "gender", PERSONAL, true),
  f("dob", "Date of birth", "date", PERSONAL, true),
  f("bloodGroup", "Blood group", "bloodGroup", PERSONAL, true),
  f("aadhaarNumber", "Aadhaar number", "text", PERSONAL, true),
  f("profilePhoto", "Profile photo URL", "text", PERSONAL),
  f("mobileNumber", "Mobile number", "tel", CONTACT, true),
  f("alternateMobileNumber", "Alternate mobile", "tel", CONTACT),
  f("email", "Email", "email", CONTACT, true),
  f("districtId", "District", "district", ADDRESS, true),
  f("talukId", "Taluk", "taluk", ADDRESS, true),
  f("pincode", "Pincode", "text", ADDRESS, true),
  f("addressLine1", "Address line 1", "text", ADDRESS, true),
  f("addressLine2", "Address line 2", "text", ADDRESS),
  f("city", "City", "text", ADDRESS, true),
  f("addressPincode", "Address pincode", "text", ADDRESS, true),
  f("employmentType", "Employment type", "text", WORK),
  f("companyName", "Company", "text", WORK),
  f("designation", "Designation", "text", WORK),
  f("workLocation", "Work location", "text", WORK),
  f("validUntil", "Membership valid until", "date", MEMBERSHIP),
];

const CLUB: ProfileField[] = [
  f("name", "Club name", "text", "Club", true),
  f("president", "President", "text", "Club", true),
  f("secretary", "Secretary", "text", "Club", true),
  f("coach", "Coach", "text", "Club", true),
  f("profilePhoto", "Logo / photo URL", "text", "Club"),
  f("mobileNumber", "Mobile number", "tel", CONTACT, true),
  f("email", "Email", "email", CONTACT, true),
  f("districtId", "District", "district", ADDRESS),
  f("talukId", "Taluk", "taluk", ADDRESS),
  f("pincode", "Pincode", "text", ADDRESS, true),
  f("address1", "Address line 1", "text", ADDRESS, true),
  f("address2", "Address line 2", "text", ADDRESS),
  f("noOfStudents", "Total students", "int", "Students", true),
  f("maleStudents", "Boys", "int", "Students", true),
  f("femaleStudents", "Girls", "int", "Students", true),
  f("age6to11Male", "Age 6–11 boys", "int", "Students", true),
  f("age6to11Female", "Age 6–11 girls", "int", "Students", true),
  f("age12to18Male", "Age 12–18 boys", "int", "Students", true),
  f("age12to18Female", "Age 12–18 girls", "int", "Students", true),
  f("age16AboveMale", "Age 16+ boys", "int", "Students", true),
  f("age16AboveFemale", "Age 16+ girls", "int", "Students", true),
  f("validUntil", "Membership valid until", "date", MEMBERSHIP),
];

export const MEMBER_ROLES = ["MEMBER", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"];

export function profileFieldsFor(role: string): ProfileField[] | null {
  if (role === "STUDENT") return STUDENT;
  if (role === "COACH") return COACH;
  if (role === "CLUB") return CLUB;
  if (MEMBER_ROLES.includes(role)) return MEMBER;
  return null;
}

/** Turns the submitted values into database values, or returns a message for the first bad one. */
export function parseProfileInput(role: string, input: Record<string, unknown>): { data: Record<string, unknown> } | { error: string } {
  const fields = profileFieldsFor(role);
  if (!fields) return { error: "Invalid role" };
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in input)) continue;
    const raw = input[field.key];
    const empty = raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
    if (empty) {
      if (field.required) return { error: `${field.label} can't be empty` };
      data[field.key] = null;
      continue;
    }
    const str = typeof raw === "string" ? raw.trim() : String(raw);
    switch (field.type) {
      case "int":
      case "float": {
        const n = Number(str);
        if (!Number.isFinite(n) || n < 0 || (field.type === "int" && !Number.isInteger(n))) return { error: `${field.label} must be a ${field.type === "int" ? "whole " : ""}number` };
        data[field.key] = n;
        break;
      }
      case "bool":
        data[field.key] = raw === true || str === "true";
        break;
      case "date": {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str);
        if (Number.isNaN(d.getTime())) return { error: `${field.label} is not a valid date` };
        data[field.key] = d;
        break;
      }
      case "gender":
        if (str !== "MALE" && str !== "FEMALE") return { error: "Gender must be Male or Female" };
        data[field.key] = str;
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return { error: "Enter a valid email address" };
        data[field.key] = str.toLowerCase();
        break;
      default:
        data[field.key] = str;
    }
  }
  return { data };
}
