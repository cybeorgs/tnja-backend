import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../../database/prisma.js";
import { studentRegistrationSchema, coachRegistrationSchema, clubRegistrationSchema, memberRegistrationSchema } from "../../validators/registrationSchema.js";
import crypto from "crypto";
import { sendClubRegistrationEmail, sendRegistrationReceiptEmail } from "../../config/mailer.js";

// Helper to generate IDs
const generateTempId = (prefix: string) => {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

// Helper to generate random password
const generatePassword = () => {
  return crypto.randomBytes(4).toString("hex");
};

export const registerStudent = async (req: Request, res: Response) => {
  console.log("POST /register/student - Body:", req.body);
  try {
    const validatedData = studentRegistrationSchema.parse(req.body);
    
    // Check if district and taluk exist
    const district = await prisma.district.findUnique({ where: { id: validatedData.districtId } });
    if (!district) return res.status(400).json({ error: "Selected District does not exist." });

    const taluk = await prisma.taluk.findUnique({ where: { id: validatedData.talukId } });
    if (!taluk) return res.status(400).json({ error: "Selected Taluk does not exist." });

    // Check if club exists if clubId is provided
    if (validatedData.clubId) {
      const club = await prisma.club.findUnique({
        where: { id: validatedData.clubId }
      });
      if (!club) {
        return res.status(400).json({ error: "The selected Club does not exist." });
      }
    } else {
      (validatedData as any).clubId = null;
    }

    if (validatedData.coachId) {
      const coach = await prisma.coachReferee.findUnique({
        where: { id: validatedData.coachId }
      });
      if (!coach) {
        return res.status(400).json({ error: "The selected Coach does not exist." });
      }
    } else {
      (validatedData as any).coachId = null;
    }

    // Check if email or mobile or aadhaar exists
    const existing = await prisma.student.findFirst({
      where: {
        OR: [
          { email: validatedData.email },
          { mobileNumber: validatedData.mobileNumber },
          { aadhaarNumber: validatedData.aadhaarNumber }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Student with this email, mobile or Aadhaar already exists" });
    }

    const tempId = generateTempId("TEMP-STU");
    const rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const student = await prisma.student.create({
      data: {
        ...validatedData,
        tempId,
        password: hashedPassword,
        status: "PENDING"
      }
    });

    try {
      await sendRegistrationReceiptEmail({
        toEmail: student.email,
        toName: student.fullName,
        role: "Player",
        tempId: student.tempId,
        password: rawPassword
      });
    } catch (mailErr) {
      console.error("[Mailer] Failed to send registration receipt:", mailErr);
    }

    try {
      await prisma.applicationLog.create({
        data: {
          userId: student.tempId,
          role: "PLAYER",
          action: "SUBMITTED"
        }
      });
    } catch (logErr) {
      console.error("Failed to log application submission:", logErr);
    }

    return res.status(201).json({
      message: "Registration successful. Check your email for login details.",
      tempId: student.tempId
    });

  } catch (error: any) {
    console.log("Error caught in registerStudent:", error);
    if (error.name === "ZodError" || error.issues) {
      return res.status(400).json({ errors: error.issues || error.errors || [] });
    }
    console.error("Student Registration error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const registerCoach = async (req: Request, res: Response) => {
  console.log("POST /register/coach - Body:", req.body);
  try {
    const validatedData = coachRegistrationSchema.parse(req.body);
    
    const district = await prisma.district.findUnique({ where: { id: validatedData.districtId } });
    if (!district) return res.status(400).json({ error: "Selected District does not exist." });

    const taluk = await prisma.taluk.findUnique({ where: { id: validatedData.talukId } });
    if (!taluk) return res.status(400).json({ error: "Selected Taluk does not exist." });

    if (validatedData.clubId) {
      const club = await prisma.club.findUnique({
        where: { id: validatedData.clubId }
      });
      if (!club) {
        return res.status(400).json({ error: "The selected Club does not exist." });
      }
    } else {
      (validatedData as any).clubId = null;
    }

    const existing = await prisma.coachReferee.findFirst({
      where: {
        OR: [
          { email: validatedData.email },
          { mobileNumber: validatedData.mobileNumber },
          { aadhaarNumber: validatedData.aadhaarNumber }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Coach/Referee with this email, mobile or Aadhaar already exists" });
    }

    const tempId = generateTempId("TEMP-COA");
    const rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const coach = await prisma.coachReferee.create({
      data: {
        ...validatedData,
        tempId,
        password: hashedPassword,
        status: "PENDING"
      }
    });

    try {
      await sendRegistrationReceiptEmail({
        toEmail: coach.email,
        toName: coach.fullName,
        role: "Coach / Referee",
        tempId: coach.tempId,
        password: rawPassword
      });
    } catch (mailErr) {
      console.error("[Mailer] Failed to send registration receipt:", mailErr);
    }

    try {
      await prisma.applicationLog.create({
        data: {
          userId: coach.tempId,
          role: "COACH",
          action: "SUBMITTED"
        }
      });
    } catch (logErr) {
      console.error("Failed to log application submission:", logErr);
    }

    return res.status(201).json({
      message: "Registration successful. Check your email for login details.",
      tempId: coach.tempId
    });

  } catch (error: any) {
    if (error.name === "ZodError" || error.issues) {
      return res.status(400).json({ errors: error.issues || error.errors || [] });
    }
    console.error("Coach Registration error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const registerClub = async (req: Request, res: Response) => {
  console.log("POST /register/club - Body:", req.body);
  try {
    const validatedData = clubRegistrationSchema.parse(req.body);

    const district = await prisma.district.findUnique({ where: { id: validatedData.districtId } });
    if (!district) return res.status(400).json({ error: "Selected District does not exist." });

    const taluk = await prisma.taluk.findUnique({ where: { id: validatedData.talukId } });
    if (!taluk) return res.status(400).json({ error: "Selected Taluk does not exist." });

    const existing = await prisma.club.findFirst({
      where: {
        OR: [
          { email: validatedData.email },
          { mobileNumber: validatedData.mobileNumber }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Club with this email or mobile number already exists" });
    }

    const { clubName, ...rest } = validatedData;
    
    const tempId = generateTempId("TEMP-CLB");
    const rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    
    const club = await prisma.club.create({
      data: {
        ...rest,
        name: clubName,
        tempId,
        password: hashedPassword,
        status: "PENDING"
      }
    });

    // Send receipt email to club
    try {
      await sendClubRegistrationEmail({
        toEmail: club.email,
        toName: club.name,
        tempId: club.tempId || undefined,
        password: rawPassword
      });
    } catch (mailErr) {
      console.error("[Mailer] Failed to send club registration receipt:", mailErr);
    }

    try {
      await prisma.applicationLog.create({
        data: {
          userId: club.tempId!,
          role: "CLUB",
          action: "SUBMITTED"
        }
      });
    } catch (logErr) {
      console.error("Failed to log application submission:", logErr);
    }

    return res.status(201).json({
      message: "Club registration successful. Application is pending Super Admin approval.",
      clubId: club.id,
      tempId: club.tempId
    });

  } catch (error: any) {
    if (error.name === "ZodError" || error.issues) {
      return res.status(400).json({ errors: error.issues || error.errors || [] });
    }
    console.error("Club Registration error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const registerMember = async (req: Request, res: Response) => {
  console.log("POST /register/member - Body:", req.body);
  try {
    const validatedData = memberRegistrationSchema.parse(req.body);
    
    const district = await prisma.district.findUnique({ where: { id: validatedData.districtId } });
    if (!district) return res.status(400).json({ error: "Selected District does not exist." });

    const taluk = await prisma.taluk.findUnique({ where: { id: validatedData.talukId } });
    if (!taluk) return res.status(400).json({ error: "Selected Taluk does not exist." });

    const existing = await prisma.member.findFirst({
      where: {
        OR: [
          { email: validatedData.email },
          { mobileNumber: validatedData.mobileNumber },
          { aadhaarNumber: validatedData.aadhaarNumber }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Member with this email, mobile or Aadhaar already exists" });
    }

    const tempId = generateTempId("TEMP-MEM");
    const rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const member = await prisma.member.create({
      data: {
        ...validatedData,
        tempId,
        password: hashedPassword,
        status: "PENDING"
      }
    });

    try {
      await sendRegistrationReceiptEmail({
        toEmail: member.email,
        toName: member.fullName,
        role: "General Member",
        tempId: member.tempId,
        password: rawPassword
      });
    } catch (mailErr) {
      console.error("[Mailer] Failed to send registration receipt:", mailErr);
    }

    try {
      await prisma.applicationLog.create({
        data: {
          userId: member.tempId,
          role: "MEMBER",
          action: "SUBMITTED"
        }
      });
    } catch (logErr) {
      console.error("Failed to log application submission:", logErr);
    }

    return res.status(201).json({
      message: "Registration successful. Check your email for login details.",
      tempId: member.tempId
    });

  } catch (error: any) {
    if (error.name === "ZodError" || error.issues) {
      return res.status(400).json({ errors: error.issues || error.errors || [] });
    }
    console.error("Member Registration error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const resubmitApplication = async (req: any, res: Response) => {
  const { userId, role } = req.user;
  const updates = req.body;

  // Filter out system fields that users should not modify directly
  const disallowedFields = [
    "id", "password", "createdAt", "updatedAt", "status", "rejectionRemark", "role",
    "tempId", "permanentId", "approvedBy", "approvedAt", "mustChangePassword",
    "resetPasswordToken", "resetPasswordExpires", "isPaid", "validUntil"
  ];

  const intFields = [
    "age", "wins", "losses", "draws", 
    "noOfStudents", "maleStudents", "femaleStudents", 
    "age6to11Male", "age6to11Female", "age12to18Male", 
    "age12to18Female", "age16AboveMale", "age16AboveFemale"
  ];
  const floatFields = ["annualIncome"];
  const dateFields = ["dob"];
  const nullableFields = [
    "clubId", "coachId", "alternateMobileNumber", "profilePhoto", 
    "bplProof", 
    "employmentType", "companyName", "designation", "workLocation", "address2"
  ];

  const cleanUpdates: any = {};
  
  const numericFields = [
    "age", "annualIncome", "wins", "losses", "draws", 
    "noOfStudents", "maleStudents", "femaleStudents", 
    "age6to11Male", "age6to11Female", "age12to18Male", "age12to18Female", 
    "age16AboveMale", "age16AboveFemale"
  ];

  for (const [k, v] of Object.entries(updates)) {
    if (disallowedFields.includes(k)) continue;
    
    // For date fields, empty string should be null
    if (v === "" && (k.endsWith("At") || k.endsWith("Expires"))) {
      cleanUpdates[k] = null;
    } else if (intFields.includes(k)) {
      if (v === "" || v === null || v === undefined) {
        cleanUpdates[k] = 0;
      } else {
        const parsed = parseInt(v as string, 10);
        cleanUpdates[k] = isNaN(parsed) ? 0 : parsed;
      }
    } else if (floatFields.includes(k)) {
      if (v === "" || v === null || v === undefined) {
        cleanUpdates[k] = 0;
      } else {
        const parsed = parseFloat(v as string);
        cleanUpdates[k] = isNaN(parsed) ? 0 : parsed;
      }
    } else if (dateFields.includes(k)) {
      if (v && typeof v === "string") {
        cleanUpdates[k] = new Date(v);
      } else {
        cleanUpdates[k] = v;
      }
    } else if (k === "isBPL") {
      cleanUpdates[k] = v === true || v === "true";
    } else if (nullableFields.includes(k) && v === "") {
      cleanUpdates[k] = null;
    } else {
      cleanUpdates[k] = v;
    }
  }

  try {
    let updatedUser: any = null;
    let tempIdToLog = "";
    let roleToLog = "";

    const updateData: any = {
      ...cleanUpdates,
      status: "PENDING",
      rejectionRemark: null
    };

    if (role === "PLAYER") {
      const existing = await prisma.student.findUnique({ where: { id: userId } });
      if (!existing || existing.status !== "REPLAY") return res.status(403).json({ error: "Cannot resubmit" });
      updatedUser = await prisma.student.update({ where: { id: userId }, data: updateData });
      tempIdToLog = updatedUser.tempId;
      roleToLog = "PLAYER";
    } else if (role === "COACH") {
      const existing = await prisma.coachReferee.findUnique({ where: { id: userId } });
      if (!existing || existing.status !== "REPLAY") return res.status(403).json({ error: "Cannot resubmit" });
      updatedUser = await prisma.coachReferee.update({ where: { id: userId }, data: updateData });
      tempIdToLog = updatedUser.tempId;
      roleToLog = "COACH";
    } else if (["MEMBER", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"].includes(role)) {
      const existing = await prisma.member.findUnique({ where: { id: userId } });
      if (!existing || existing.status !== "REPLAY") return res.status(403).json({ error: "Cannot resubmit" });
      updatedUser = await prisma.member.update({ where: { id: userId }, data: updateData });
      tempIdToLog = updatedUser.tempId;
      roleToLog = "MEMBER";
    } else if (role === "CLUB") {
      const existing = await prisma.club.findUnique({ where: { id: userId } });
      if (!existing || existing.status !== "REPLAY") return res.status(403).json({ error: "Cannot resubmit" });
      updatedUser = await prisma.club.update({ where: { id: userId }, data: updateData });
      tempIdToLog = updatedUser.tempId || updatedUser.id;
      roleToLog = "CLUB";
    }

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found or role unhandled" });
    }

    try {
      await prisma.applicationLog.create({
        data: {
          userId: tempIdToLog,
          role: roleToLog,
          action: "RESUBMITTED"
        }
      });
    } catch (logErr) {
      console.error("Failed to log resubmission:", logErr);
    }

    const { password: _, ...safeData } = updatedUser;

    return res.json({
      message: "Application resubmitted successfully. It is now pending approval.",
      user: safeData
    });
  } catch (error) {
    console.error("Resubmit application error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
