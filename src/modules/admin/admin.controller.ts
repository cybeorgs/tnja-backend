import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { sendApprovalEmail, sendRejectionEmail, sendPaymentRequestEmail } from "../../config/mailer.js";
import xlsx from "xlsx";
import fs from "fs";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

const generatePermanentId = (prefix: string) => {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
};

/** Generate a readable 8-char password that meets security requirements and return both raw + hashed */
const generatePassword = async () => {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const num = "0123456789";
  const special = "@$!%*?&";
  
  const allChars = upper + lower + num + special;
  
  let raw = "";
  // Ensure at least one of each required type
  raw += upper[Math.floor(Math.random() * upper.length)];
  raw += lower[Math.floor(Math.random() * lower.length)];
  raw += num[Math.floor(Math.random() * num.length)];
  raw += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest up to 8 characters
  for (let i = 4; i < 8; i++) {
    raw += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  raw = raw.split('').sort(() => 0.5 - Math.random()).join('');

  const hashed = await bcrypt.hash(raw, 10);
  return { raw, hashed };
};

// ──────────────────────────────────────────────────────────────────────────────
// GET  /api/applications/pending          – list pending applications by type
// ──────────────────────────────────────────────────────────────────────────────
export const getPendingApplications = async (req: Request, res: Response) => {
  const type = (req.query.type as string || "").toUpperCase();
  const statusParam = (req.query.status as string || "PENDING").toUpperCase();
  const { role, districtId } = (req as any).user;

  try {
    console.log(`[getPendingApplications] User: ${role}, District: ${districtId}, Type: ${type}, Status: ${statusParam}`);

    // Basic permissions: Standard MEMBER role is not allowed to view pending applications
    const allowedRoles = [
      "SUPER_ADMIN",
      "STATE_PRESIDENT",
      "STATE_SECRETARY",
      "ZONE_PRESIDENT",
      "ZONE_SECRETARY",
      "DISTRICT_PRESIDENT",
      "DISTRICT_SECRETARY",
      "CEO"
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "You do not have permission to view pending applications" });
    }

    // Common where clause for filtering
    const whereClause: any = { status: statusParam };
    
    const districtRestrictedRoles = [
      "DISTRICT_PRESIDENT", 
      "DISTRICT_SECRETARY"
    ];

    if (districtRestrictedRoles.includes(role) && districtId) {
      console.log(`[DEBUG] Role ${role} has districtId: ${districtId}. Enforcing filter...`);
      whereClause.districtId = districtId;
    } else {
      console.log(`[DEBUG] No districtId found or role is Super Admin. Showing all.`);
    }

    if (type === "STUDENT") {
      console.log(`[DEBUG] Fetching students with whereClause:`, JSON.stringify(whereClause));
      const students = await prisma.student.findMany({
        where: whereClause,
        include: { district: true, taluk: true, club: true },
        orderBy: { createdAt: "desc" },
      });
      console.log(`[DEBUG] Found ${students.length} students`);
      return res.json({ type: "STUDENT", data: students });
    }

    if (type === "COACH") {
      const coaches = await prisma.coachReferee.findMany({
        where: whereClause,
        include: { district: true, taluk: true, club: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ type: "COACH", data: coaches });
    }

    if (type === "CLUB") {
      const clubs = await prisma.club.findMany({
        where: whereClause,
        include: { district: true, taluk: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ type: "CLUB", data: clubs });
    }

    if (type === "MEMBER") {
      const members = await prisma.member.findMany({
        where: whereClause,
        include: { district: true, taluk: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ type: "MEMBER", data: members });
    }

    if (type === "EVENT") {
      const eventWhere: any = { status: statusParam };

      if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role)) {
        eventWhere.level = "DISTRICT";
        if (districtId) {
          eventWhere.districtId = districtId;
        }
      } else if (["ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) {
        eventWhere.level = "ZONE";
        if (districtId) {
          eventWhere.zoneId = districtId;
        }
      }

      console.log(`[DEBUG] Fetching events with whereClause:`, JSON.stringify(eventWhere));
      const events = await prisma.event.findMany({
        where: eventWhere,
        include: { district: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ type: "EVENT", data: events });
    }

    if (type === "EVENT_REGISTRATION") {
      const regWhere: any = { status: statusParam };

      if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role)) {
        regWhere.event = {
          level: "DISTRICT",
          districtId: districtId || undefined
        };
      } else if (["ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) {
        regWhere.event = {
          level: "ZONE",
          zoneId: districtId || undefined
        };
      }

      const registrations = await prisma.eventRegistration.findMany({
        where: regWhere,
        include: { 
          event: { include: { district: true } }
        },
        orderBy: { createdAt: "desc" },
      });

      const detailedRegistrations = await Promise.all(registrations.map(async (reg: any) => {
        let userDetails: any = null;
        if (reg.role === "STUDENT") {
          userDetails = await prisma.student.findUnique({ where: { id: reg.userId }, select: { fullName: true, email: true, tempId: true } });
        } else if (reg.role === "COACH") {
          userDetails = await prisma.coachReferee.findUnique({ where: { id: reg.userId }, select: { fullName: true, email: true, tempId: true } });
        } else if (reg.role === "MEMBER") {
          userDetails = await prisma.member.findUnique({ where: { id: reg.userId }, select: { fullName: true, email: true, tempId: true } });
        } else if (reg.role === "CLUB") {
          userDetails = await prisma.club.findUnique({ where: { id: reg.userId }, select: { name: true, email: true, tempId: true } });
        }
        return {
          ...reg,
          applicantName: userDetails ? (userDetails.fullName || userDetails.name) : "Unknown",
          applicantEmail: userDetails ? userDetails.email : "Unknown",
          applicantTempId: userDetails ? userDetails.tempId : null
        };
      }));

      return res.json({ type: "EVENT_REGISTRATION", data: detailedRegistrations });
    }

    // Return all pending counts if no type specified
    const eventCountWhere: any = { status: statusParam };
    const regWhere: any = { status: statusParam };

    if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role)) {
      eventCountWhere.level = "DISTRICT";
      if (districtId) eventCountWhere.districtId = districtId;

      regWhere.event = {
        level: "DISTRICT",
        districtId: districtId || undefined
      };
    } else if (["ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) {
      eventCountWhere.level = "ZONE";
      if (districtId) eventCountWhere.zoneId = districtId;

      regWhere.event = {
        level: "ZONE",
        zoneId: districtId || undefined
      };
    }

    const [studentCount, coachCount, memberCount, clubCount, eventCount, regCount] = await Promise.all([
      prisma.student.count({ where: whereClause }),
      prisma.coachReferee.count({ where: whereClause }),
      prisma.member.count({ where: whereClause }),
      prisma.club.count({ where: whereClause }),
      prisma.event.count({ where: eventCountWhere }),
      prisma.eventRegistration.count({ where: regWhere }),
    ]);

    return res.json({
      counts: {
        STUDENT: studentCount,
        COACH: coachCount,
        MEMBER: memberCount,
        CLUB: clubCount,
        EVENT: eventCount,
        EVENT_REGISTRATION: regCount,
      },
    });
  } catch (error) {
    console.error("[getPendingApplications]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/application/status   – approve or reject any registration type
// ──────────────────────────────────────────────────────────────────────────────
export const updateApplicationStatus = async (req: Request, res: Response) => {
  const { id, type, status, remark } = req.body;
  const { role, districtId } = (req as any).user;
  // type: 'student' | 'coach' | 'club' | 'member'
  // status: 'APPROVED' | 'REJECTED'

  try {
    const allowedRoles = [
      "SUPER_ADMIN",
      "STATE_PRESIDENT",
      "STATE_SECRETARY",
      "ZONE_PRESIDENT",
      "ZONE_SECRETARY",
      "DISTRICT_PRESIDENT",
      "DISTRICT_SECRETARY",
      "CEO"
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "You do not have permission to manage applications" });
    }

    const districtRestrictedRoles = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"];
    const auditor = (role === "SUPER_ADMIN" || role === "CEO") ? role : null;
    let auditorInfo = auditor;

    if (role !== "SUPER_ADMIN" && role !== "CEO") {
      const member = await prisma.member.findUnique({ where: { id: (req as any).user.userId } });
      auditorInfo = member ? `${member.fullName} (${role})` : role;
    }

    // ── STUDENT ──────────────────────────────────────────────────────────────
    if (type === "student") {
      const student = await prisma.student.findUnique({ where: { id } });
      if (!student) return res.status(404).json({ error: "Student not found" });

      if (districtRestrictedRoles.includes(role) && districtId && student.districtId !== districtId) {
        return res.status(403).json({ error: "You do not have permission to approve students outside your district" });
      }

      if (student.status === status) {
        return res.json({ message: `Student application is already ${status}`, data: student });
      }

      const updateData: any = { status, rejectionRemark: remark || null };

      if (status === "APPROVED") {
        updateData.approvedBy = auditorInfo;
        updateData.approvedAt = new Date();

        if (student.isBPL) {
          // BPL Students get approved immediately with permanent ID
          updateData.permanentId = generatePermanentId("STU");
          
          // Generate new password for final account (optional, keeping current is fine too but common to refresh)
          const { raw, hashed } = await generatePassword();
          updateData.password = hashed;
          updateData.mustChangePassword = true;
          updateData.isPaid = true; // BPL counts as paid/waived
          
          // Set membership validity to 1 year from approval
          const nextYear = new Date();
          nextYear.setFullYear(nextYear.getFullYear() + 1);
          updateData.validUntil = nextYear;

          const updated = await prisma.student.update({ where: { id }, data: updateData });

          try {
            await sendApprovalEmail({
              toEmail: student.email,
              toName: student.fullName,
              tempId: student.tempId,
              permanentId: updated.permanentId!,
              password: raw,
              role: "Student",
            });
          } catch (mailErr) {
            console.error("[Mailer] Failed to send BPL student approval email:", mailErr);
          }

          return res.json({ message: "BPL Student APPROVED. Credentials sent.", data: updated });
        } else {
          // Non-BPL Students: Approve but require payment
          const { raw, hashed } = await generatePassword();
          const updated = await prisma.student.update({ 
            where: { id }, 
            data: { 
              status: "APPROVED", 
              approvedBy: auditorInfo,
              approvedAt: new Date(),
              isPaid: false,
              password: hashed,
              mustChangePassword: false
            } 
          });

          // Send payment notification email with password
          try {
            await sendPaymentRequestEmail({
              toEmail: student.email,
              toName: student.fullName,
              tempId: student.tempId,
              password: raw,
              role: "Player"
            });
          } catch (mailErr) {
            console.error("[Mailer] Failed to send payment request email:", mailErr);
          }

          return res.json({ message: "Student application APPROVED. Payment required for Player ID.", data: updated });
        }
      }

      if (status === "REJECTED") {
        const updated = await prisma.student.update({ where: { id }, data: updateData });
        try {
          await sendRejectionEmail({
            toEmail: student.email,
            toName: student.fullName,
            role: "Student",
            remark: remark || "No reason provided.",
          });
        } catch (mailErr) {
          console.error("[Mailer] Failed to send student rejection email:", mailErr);
        }
        return res.json({ message: "Student REJECTED. Email sent.", data: updated });
      }
    }

    // ── COACH ─────────────────────────────────────────────────────────────────
    if (type === "coach") {
      const coach = await prisma.coachReferee.findUnique({ where: { id } });
      if (!coach) return res.status(404).json({ error: "Coach not found" });

      if (districtRestrictedRoles.includes(role) && districtId && coach.districtId !== districtId) {
        return res.status(403).json({ error: "You do not have permission to approve coaches outside your district" });
      }

      if (coach.status === status) {
        return res.json({ message: `Coach application is already ${status}`, data: coach });
      }

      const updateData: any = { status, rejectionRemark: remark || null };

      if (status === "APPROVED") {
        const { raw, hashed } = await generatePassword();
        const updated = await prisma.coachReferee.update({ 
          where: { id }, 
          data: { 
            status: "APPROVED", 
            approvedBy: auditorInfo,
            approvedAt: new Date(),
            isPaid: false,
            password: hashed,
            mustChangePassword: false
          } 
        });

        try {
          await sendPaymentRequestEmail({
            toEmail: coach.email,
            toName: coach.fullName,
            tempId: coach.tempId,
            password: raw,
            role: "Coach"
          });
        } catch (mailErr) {
          console.error("[Mailer] Failed to send coach payment request email:", mailErr);
        }

        return res.json({ message: "Coach APPROVED. Payment required for Coach ID.", data: updated });
      }

      if (status === "REJECTED") {
        const updated = await prisma.coachReferee.update({ where: { id }, data: updateData });
        try {
          await sendRejectionEmail({
            toEmail: coach.email,
            toName: coach.fullName,
            role: "Coach",
            remark: remark || "No reason provided.",
          });
        } catch (mailErr) {
          console.error("[Mailer] Failed to send coach rejection email:", mailErr);
        }
        return res.json({ message: "Coach REJECTED. Email sent.", data: updated });
      }
    }

    // ── MEMBER ────────────────────────────────────────────────────────────────
    if (type === "member") {
      const member = await prisma.member.findUnique({ where: { id } });
      if (!member) return res.status(404).json({ error: "Member not found" });

      if (districtRestrictedRoles.includes(role) && districtId && member.districtId !== districtId) {
        return res.status(403).json({ error: "You do not have permission to approve members outside your district" });
      }

      if (member.status === status) {
        return res.json({ message: `Member application is already ${status}`, data: member });
      }

      const updateData: any = { status, rejectionRemark: remark || null };

      if (status === "APPROVED") {
        const { raw, hashed } = await generatePassword();
        const updated = await prisma.member.update({ 
          where: { id }, 
          data: { 
            status: "APPROVED", 
            approvedBy: auditorInfo,
            approvedAt: new Date(),
            isPaid: false,
            password: hashed,
            mustChangePassword: false
          } 
        });

        try {
          await sendPaymentRequestEmail({
            toEmail: member.email,
            toName: member.fullName,
            tempId: member.tempId,
            password: raw,
            role: "Member"
          });
        } catch (mailErr) {
          console.error("[Mailer] Failed to send member payment request email:", mailErr);
        }

        return res.json({ message: "Member APPROVED. Payment required for Member ID.", data: updated });
      }

      if (status === "REJECTED") {
        const updated = await prisma.member.update({ where: { id }, data: updateData });
        try {
          await sendRejectionEmail({
            toEmail: member.email,
            toName: member.fullName,
            role: "Member",
            remark: remark || "No reason provided.",
          });
        } catch (mailErr) {
          console.error("[Mailer] Failed to send member rejection email:", mailErr);
        }
        return res.json({ message: "Member REJECTED. Email sent.", data: updated });
      }
    }

    // ── CLUB ──────────────────────────────────────────────────────────────────
    if (type === "club") {
      const club = await prisma.club.findUnique({ where: { id } });
      if (!club) return res.status(404).json({ error: "Club not found" });

      if (districtRestrictedRoles.includes(role) && districtId && club.districtId !== districtId) {
        return res.status(403).json({ error: "You do not have permission to approve clubs outside your district" });
      }

      if (club.status === status) {
        return res.json({ message: `Club application is already ${status}`, data: club });
      }

      const updateData: any = { status, rejectionRemark: remark || null };

      if (status === "APPROVED") {
        const { raw, hashed } = await generatePassword();
        const updated = await prisma.club.update({ 
          where: { id }, 
          data: { 
            status: "APPROVED", 
            approvedBy: auditorInfo,
            approvedAt: new Date(),
            isPaid: false,
            password: hashed,
            mustChangePassword: false
          } 
        });

        try {
          await sendPaymentRequestEmail({
            toEmail: club.email,
            toName: club.name,
            tempId: club.tempId || club.id,
            password: raw,
            role: "Club"
          });
        } catch (mailErr) {
          console.error("[Mailer] Failed to send club payment request email:", mailErr);
        }

        return res.json({ message: "Club APPROVED. Payment required for Club ID.", data: updated });
      }

      if (status === "REJECTED") {
        const updated = await prisma.club.update({ where: { id }, data: updateData });
        try {
          await sendRejectionEmail({
            toEmail: club.email,
            toName: club.name,
            role: "Club",
            remark: remark || "No reason provided.",
          });
        } catch (mailErr) {
          console.error("[Mailer] Failed to send club rejection email:", mailErr);
        }
        return res.json({ message: "Club REJECTED. Email sent.", data: updated });
      }
    }

    // ── EVENT ─────────────────────────────────────────────────────────────────
    if (type === "event") {
      const eventItem = await prisma.event.findUnique({ where: { id } });
      if (!eventItem) return res.status(404).json({ error: "Event not found" });

      if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role)) {
        if (eventItem.level !== "DISTRICT") {
          return res.status(403).json({ error: "District officers can only manage district-level events" });
        }
        if (districtId && eventItem.districtId !== districtId) {
          return res.status(403).json({ error: "You can only manage events in your own district" });
        }
      }

      if (["ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) {
        if (eventItem.level !== "ZONE") {
          return res.status(403).json({ error: "Zone officers can only manage zone-level events" });
        }
        if (districtId && eventItem.zoneId !== districtId) {
          return res.status(403).json({ error: "You can only manage events in your own zone" });
        }
      }

      if (eventItem.status === status) {
        return res.json({ message: `Event application is already ${status}`, data: eventItem });
      }

      const updateData: any = { 
        status, 
        rejectionRemark: status === "REJECTED" ? remark || "Rejected" : null,
        approvedBy: status === "APPROVED" ? auditorInfo : null,
        approvedAt: status === "APPROVED" ? new Date() : null
      };

      const updated = await prisma.event.update({
        where: { id },
        data: updateData
      });

      return res.json({ message: `Event ${status.toLowerCase()} successfully`, data: updated });
    }

    // ── EVENT REGISTRATION ───────────────────────────────────────────────────
    if (type === "event_registration") {
      const reg = await prisma.eventRegistration.findUnique({ 
        where: { id },
        include: { event: true }
      });
      if (!reg) return res.status(404).json({ error: "Event registration not found" });

      const eventItem = reg.event;

      if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role)) {
        if (eventItem.level !== "DISTRICT") {
          return res.status(403).json({ error: "District officers can only manage registrations for district-level events" });
        }
        if (districtId && eventItem.districtId !== districtId) {
          return res.status(403).json({ error: "You can only manage registrations in your own district" });
        }
      }

      if (["ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) {
        if (eventItem.level !== "ZONE") {
          return res.status(403).json({ error: "Zone officers can only manage registrations for zone-level events" });
        }
        if (districtId && eventItem.zoneId !== districtId) {
          return res.status(403).json({ error: "You can only manage registrations in your own zone" });
        }
      }

      const updated = await prisma.eventRegistration.update({
        where: { id },
        data: { status }
      });

      return res.json({ message: `Registration ${status.toLowerCase()} successfully`, data: updated });
    }

    return res.status(400).json({ error: "Invalid application type" });

  } catch (error) {
    console.error("[updateApplicationStatus]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/admin/request-changes - change status to REPLAY and log
// ──────────────────────────────────────────────────────────────────────────────
export const requestChanges = async (req: Request, res: Response) => {
  const { id, type, remark } = req.body;
  const { role, districtId } = (req as any).user;

  try {
    const allowedRoles = [
      "SUPER_ADMIN", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", 
      "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "CEO"
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "You do not have permission to manage applications" });
    }

    if (!remark) {
      return res.status(400).json({ error: "Remark/Reason is required when requesting changes." });
    }

    const updateData: any = { status: "REPLAY", rejectionRemark: remark };
    let tempIdToLog = "";
    let roleToLog = "";

    if (type === "student") {
      const student = await prisma.student.findUnique({ where: { id } });
      if (!student) return res.status(404).json({ error: "Student not found" });
      await prisma.student.update({ where: { id }, data: updateData });
      tempIdToLog = student.tempId;
      roleToLog = "PLAYER";
    } else if (type === "coach") {
      const coach = await prisma.coachReferee.findUnique({ where: { id } });
      if (!coach) return res.status(404).json({ error: "Coach not found" });
      await prisma.coachReferee.update({ where: { id }, data: updateData });
      tempIdToLog = coach.tempId;
      roleToLog = "COACH";
    } else if (type === "member") {
      const member = await prisma.member.findUnique({ where: { id } });
      if (!member) return res.status(404).json({ error: "Member not found" });
      await prisma.member.update({ where: { id }, data: updateData });
      tempIdToLog = member.tempId;
      roleToLog = "MEMBER";
    } else if (type === "club") {
      const club = await prisma.club.findUnique({ where: { id } });
      if (!club) return res.status(404).json({ error: "Club not found" });
      await prisma.club.update({ where: { id }, data: updateData });
      tempIdToLog = club.tempId || club.id;
      roleToLog = "CLUB";
    } else {
      return res.status(400).json({ error: "Invalid application type for requesting changes" });
    }

    // Log the request changes action
    try {
      await prisma.applicationLog.create({
        data: {
          userId: tempIdToLog,
          role: roleToLog,
          action: "CHANGES_REQUESTED",
          remark: remark
        }
      });
    } catch (logErr) {
      console.error("Failed to log changes requested:", logErr);
    }

    // Optionally: send an email here using a specialized mailer function
    // For now, they can log in to check their status and see the remark

    return res.json({ message: "Changes requested successfully. Status set to REPLAY." });
  } catch (error) {
    console.error("[requestChanges]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/application/:tempId  – get full details of an application
// ──────────────────────────────────────────────────────────────────────────────
export const getApplicationDetails = async (req: Request, res: Response) => {
  const tempId = req.params.tempId as string;

  try {
    const student = await prisma.student.findUnique({
      where: { tempId },
      include: { district: true, taluk: true, club: true },
    });
    if (student) return res.json({ type: "student", data: student });

    const coach = await prisma.coachReferee.findUnique({
      where: { tempId },
      include: { district: true, taluk: true, club: true },
    });
    if (coach) return res.json({ type: "coach", data: coach });

    const member = await prisma.member.findUnique({
      where: { tempId },
      include: { district: true, taluk: true },
    });
    if (member) return res.json({ type: "member", data: member });

    const eventItem = await prisma.event.findUnique({
      where: { id: tempId },
      include: { district: true },
    });
    if (eventItem) return res.json({ type: "event", data: eventItem });

    return res.status(404).json({ error: "Application not found with this Temporary ID" });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats  – get counts for the dashboard
// ──────────────────────────────────────────────────────────────────────────────
export const getDashboardStats = async (req: Request, res: Response) => {
  const { role, districtId } = (req as any).user;
  const filter: any = {};
  const districtRestrictedRoles = [
    "DISTRICT_PRESIDENT", 
    "DISTRICT_SECRETARY"
  ];

  if (districtRestrictedRoles.includes(role) && districtId) {
    filter.districtId = districtId;
  }

  try {
    const pendingFilter = { ...filter, status: "PENDING" };

    const [
      studentCount,
      coachCount,
      memberCount,
      clubCount,
      pendingStudents,
      pendingCoaches,
      pendingMembers,
      pendingClubs,
    ] = await Promise.all([
      prisma.student.count({ where: filter }),
      prisma.coachReferee.count({ where: filter }),
      prisma.member.count({ where: filter }),
      prisma.club.count({ where: filter }),
      prisma.student.count({ where: pendingFilter }),
      prisma.coachReferee.count({ where: pendingFilter }),
      prisma.member.count({ where: pendingFilter }),
      prisma.club.count({ where: pendingFilter }),
    ]);

    // Get recent 5 pending across all types
    const [s, c, m, cl] = await Promise.all([
      prisma.student.findMany({ where: pendingFilter, take: 5, orderBy: { createdAt: "desc" } }),
      prisma.coachReferee.findMany({ where: pendingFilter, take: 5, orderBy: { createdAt: "desc" } }),
      prisma.member.findMany({ where: pendingFilter, take: 5, orderBy: { createdAt: "desc" } }),
      prisma.club.findMany({ where: pendingFilter, take: 5, orderBy: { createdAt: "desc" } }),
    ]);

    const recent = [
      ...s.map((i: any) => ({ name: i.fullName, type: "Player", createdAt: i.createdAt })),
      ...c.map((i: any) => ({ name: i.fullName, type: "Coach", createdAt: i.createdAt })),
      ...m.map((i: any) => ({ name: i.fullName, type: "Member", createdAt: i.createdAt })),
      ...cl.map((i: any) => ({ name: i.name, type: "Club", createdAt: i.createdAt })),
    ]
    .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

    return res.json({
      counts: {
        STUDENT: studentCount,
        COACH: coachCount,
        MEMBER: memberCount,
        CLUB: clubCount,
      },
      pending: {
        STUDENT: pendingStudents,
        COACH: pendingCoaches,
        MEMBER: pendingMembers,
        CLUB: pendingClubs,
        total: pendingStudents + pendingCoaches + pendingMembers + pendingClubs,
      },
      recentApprovals: recent,
    });
  } catch (error) {
    console.error("[getDashboardStats]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createPaymentOrder = async (req: Request, res: Response) => {
  const { id, type, amount } = req.body;
  // type: 'student' | 'coach' | 'member' | 'club'
  
  try {
    let record: any = null;
    
    // Fetch Global Settings
    let settings = await prisma.globalSettings.findUnique({ where: { id: "GLOBAL" } });
    if (!settings) {
      // Initialize if not exists
      settings = await prisma.globalSettings.create({
        data: { id: "GLOBAL", playerFee: 500, coachFee: 1000, memberFee: 1000, clubFee: 1000 }
      });
    }

    let calculatedAmount = 0;
    if (type === "student") {
      record = await prisma.student.findUnique({ where: { id } });
      calculatedAmount = settings.playerFee;
    } else if (type === "coach") {
      record = await prisma.coachReferee.findUnique({ where: { id } });
      calculatedAmount = settings.coachFee;
    } else if (type === "member") {
      record = await prisma.member.findUnique({ where: { id } });
      calculatedAmount = settings.memberFee;
    } else if (type === "club") {
      record = await prisma.club.findUnique({ where: { id } });
      calculatedAmount = settings.clubFee;
    }

    if (!record) return res.status(404).json({ error: `${type} not found` });

    const receiptId = (record.tempId || record.id).substring(0, 30);
    const options = {
      amount: calculatedAmount * 100, // amount in the smallest currency unit (paise)
      currency: "INR",
      receipt: `rcpt_${receiptId}`,
    };

    const order = await razorpay.orders.create(options);
    return res.json(order);
  } catch (error) {
    console.error("Razorpay order error:", error);
    return res.status(500).json({ error: "Failed to create payment order" });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  const { id, type, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  // type: 'student' | 'coach' | 'member' | 'club'

  try {
    let record: any = null;
    let updateFn: any = null;
    let prefix = "";
    let roleLabel: "Student" | "Coach" | "Member" | "Club" = "Student";

    if (type === "student") {
      record = await prisma.student.findUnique({ where: { id } });
      updateFn = prisma.student.update;
      prefix = "STU";
      roleLabel = "Student";
    } else if (type === "coach") {
      record = await prisma.coachReferee.findUnique({ where: { id } });
      updateFn = prisma.coachReferee.update;
      prefix = "COA";
      roleLabel = "Coach";
    } else if (type === "member") {
      record = await prisma.member.findUnique({ where: { id } });
      updateFn = prisma.member.update;
      prefix = "MEM";
      roleLabel = "Member";
    } else if (type === "club") {
      record = await prisma.club.findUnique({ where: { id } });
      updateFn = prisma.club.update;
      prefix = "CLB";
      roleLabel = "Club";
    }

    if (!record) return res.status(404).json({ error: `${type} application not found` });

    if (record.isPaid) {
      return res.status(400).json({ error: "Payment already processed" });
    }

    // Process success
    const permanentId = generatePermanentId(prefix);

    // Set membership validity to 1 year from payment
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const updated = await updateFn({
      where: { id },
      data: {
        isPaid: true,
        permanentId,
        mustChangePassword: true,
        validUntil: nextYear
      }
    });

    try {
      await sendApprovalEmail({
        toEmail: record.email,
        toName: record.fullName || record.name,
        tempId: record.tempId || record.id,
        permanentId: updated.permanentId!,
        password: "Use your existing password",
        role: roleLabel,
      });
    } catch (mailErr) {
      console.error("Mail error after payment verification:", mailErr);
    }

    return res.json({ message: "Payment verified and ID issued", permanentId: updated.permanentId });

  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
};

export const getGlobalSettings = async (req: Request, res: Response) => {
  try {
    let settings = await prisma.globalSettings.findUnique({ where: { id: "GLOBAL" } });
    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: { id: "GLOBAL" }
      });
    }
    return res.json(settings);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
};

export const updateGlobalSettings = async (req: Request, res: Response) => {
  const { playerFee, coachFee, memberFee, clubFee } = req.body;
  try {
    const settings = await prisma.globalSettings.upsert({
      where: { id: "GLOBAL" },
      update: { playerFee, coachFee, memberFee, clubFee },
      create: { id: "GLOBAL", playerFee, coachFee, memberFee, clubFee }
    });
    return res.json({ message: "Settings updated successfully", settings });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update settings" });
  }
};
// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/member/promote      – promote a member to a specific role
// ──────────────────────────────────────────────────────────────────────────────
export const promoteMember = async (req: Request, res: Response) => {
  const { memberId, role, districtId } = req.body;
  const { role: requesterRole } = (req as any).user;

  if (requesterRole !== "SUPER_ADMIN" && requesterRole !== "CEO") {
    return res.status(403).json({ error: "Only Super Admin can promote members" });
  }

  const validRoles = [
    "MEMBER",
    "DISTRICT_PRESIDENT",
    "DISTRICT_SECRETARY",
    "ZONE_PRESIDENT",
    "ZONE_SECRETARY",
    "STATE_PRESIDENT",
    "STATE_SECRETARY",
    "CEO"
  ];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: "Invalid role specified" });
  }

  try {
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return res.status(404).json({ error: "Member not found" });

    const targetDistrictId = districtId || member.assignedDistrictId || member.districtId;

    if (role === "DISTRICT_PRESIDENT" || role === "DISTRICT_SECRETARY") {
      const existing = await prisma.member.findFirst({
        where: {
          role: role as any,
          OR: [
            { assignedDistrictId: targetDistrictId },
            { districtId: targetDistrictId, assignedDistrictId: null }
          ],
          NOT: { id: memberId }
        }
      });
      if (existing) {
        return res.status(400).json({ error: `A member already holds the role of ${role} in this district.` });
      }
    }

    if (role === "ZONE_PRESIDENT" || role === "ZONE_SECRETARY") {
      const targetDistrict = await prisma.district.findUnique({ where: { id: targetDistrictId }});
      if (targetDistrict?.zoneName) {
        const zoneDistricts = await prisma.district.findMany({
          where: { zoneName: targetDistrict.zoneName },
          select: { id: true }
        });
        const zoneDistrictIds = zoneDistricts.map((d: any) => d.id);
        
        const existing = await prisma.member.findFirst({
          where: {
            role: role as any,
            OR: [
              { assignedDistrictId: { in: zoneDistrictIds } },
              { districtId: { in: zoneDistrictIds }, assignedDistrictId: null }
            ],
            NOT: { id: memberId }
          }
        });
        if (existing) {
          return res.status(400).json({ error: `A member already holds the role of ${role} in this zone (${targetDistrict.zoneName}).` });
        }
      }
    }

    if (role === "STATE_PRESIDENT" || role === "STATE_SECRETARY") {
      const existing = await prisma.member.findFirst({
        where: {
          role: role as any,
          NOT: { id: memberId }
        }
      });
      if (existing) {
        return res.status(400).json({ error: `A member already holds the role of ${role.replace("_", " ")}.` });
      }
    }

    let updateData: any = { role: role as any };
    if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) {
      updateData.assignedDistrictId = targetDistrictId;
    } else {
      updateData.assignedDistrictId = null;
    }

    const updated = await prisma.member.update({
      where: { id: memberId },
      data: updateData
    });

    return res.json({ message: `Member promoted to ${role} successfully`, data: updated });
  } catch (error) {
    console.error("[promoteMember]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/admin/location-analytics – get detailed breakdown by taluk
// ──────────────────────────────────────────────────────────────────────────────
export const getLocationAnalytics = async (req: Request, res: Response) => {
  const { role, districtId } = (req as any).user;
  const filter: any = {};
  
  if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role) && districtId) {
    filter.districtId = districtId;
  }

  try {
    const taluks = await prisma.taluk.findMany({
      where: filter.districtId ? { districtId: filter.districtId } : {},
      include: {
        students: { select: { id: true } },
        coaches: { select: { id: true } },
        members: { select: { id: true } },
        clubs: { select: { id: true } }
      }
    });

    const analytics = taluks.map((t: any) => ({
      id: t.id,
      name: t.name,
      players: t.students.length,
      coaches: t.coaches.length,
      members: t.members.length,
      clubs: t.clubs.length,
      total: t.students.length + t.coaches.length + t.members.length + t.clubs.length
    })).sort((a: any, b: any) => b.total - a.total);

    return res.json(analytics);
  } catch (error) {
    console.error("[getLocationAnalytics]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/admin/create-student – Force create a student
// ──────────────────────────────────────────────────────────────────────────────
export const forceCreateStudent = async (req: Request, res: Response) => {
  const { role } = (req as any).user;
  if (role !== "SUPER_ADMIN" && role !== "CEO") {
    return res.status(403).json({ error: "Only Super Admin can force create players" });
  }

  const { 
    fullName, email, mobileNumber, districtId, talukId, gender, dob, aadhaarNumber,
    bloodGroup, address, city, state, addressPincode, nationality, annualIncome, 
    schoolName, grade, clubId
  } = req.body;

  try {
    const existing = await prisma.student.findFirst({
      where: {
        OR: [
          { email },
          { mobileNumber },
          { aadhaarNumber }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Player with this email, mobile or Aadhaar already exists" });
    }

    const { raw, hashed } = await generatePassword();
    const permanentId = generatePermanentId("STU");
    const tempId = `TEMP-STU-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const student = await prisma.student.create({
      data: {
        fullName,
        email,
        mobileNumber,
        districtId,
        talukId,
        gender,
        dob: new Date(dob),
        aadhaarNumber,
        tempId,
        permanentId,
        password: hashed,
        status: "APPROVED",
        isPaid: true,
        mustChangePassword: true,
        age: new Date().getFullYear() - new Date(dob).getFullYear(),
        pincode: addressPincode || "000000",
        bloodGroup,
        address,
        city,
        state,
        addressPincode,
        nationality,
        annualIncome: Number(annualIncome),
        schoolName,
        grade,
        clubId: clubId || null
      }
    });

    try {
      await sendApprovalEmail({
        toEmail: student.email,
        toName: student.fullName,
        tempId: student.tempId,
        permanentId: student.permanentId!,
        password: raw,
        role: "Student",
      });
    } catch (mailErr) {
      console.error("[Mailer] Failed to send approval email:", mailErr);
    }

    return res.status(201).json({ message: "Player created successfully", data: student });
  } catch (error) {
    console.error("[forceCreateStudent]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/admin/create-club – Force create a club
// ──────────────────────────────────────────────────────────────────────────────
export const forceCreateClub = async (req: Request, res: Response) => {
  const { role } = (req as any).user;
  if (role !== "SUPER_ADMIN" && role !== "CEO") {
    return res.status(403).json({ error: "Only Super Admin can force create clubs" });
  }

  const { 
    name, email, mobileNumber, districtId, talukId, 
    address1, address2, pincode, president, secretary, coach 
  } = req.body;

  try {
    const existing = await prisma.club.findFirst({
      where: {
        OR: [
          { email },
          { mobileNumber }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Club with this email or mobile number already exists" });
    }

    const { raw, hashed } = await generatePassword();
    const permanentId = generatePermanentId("CLB");
    const tempId = `TEMP-CLB-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const club = await prisma.club.create({
      data: {
        name,
        email,
        mobileNumber,
        districtId,
        talukId,
        tempId,
        permanentId,
        password: hashed,
        status: "APPROVED",
        isPaid: true,
        mustChangePassword: true,
        pincode,
        address1,
        address2: address2 || null,
        president,
        secretary,
        coach,
      }
    });

    try {
      await sendApprovalEmail({
        toEmail: club.email,
        toName: club.name,
        tempId: club.tempId!,
        permanentId: club.permanentId!,
        password: raw,
        role: "Club",
      });
    } catch (mailErr) {
      console.error("[Mailer] Failed to send approval email:", mailErr);
    }

    return res.status(201).json({ message: "Club created successfully", data: club });
  } catch (error) {
    console.error("[forceCreateClub]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/admin/create-member – Force create a member
// ──────────────────────────────────────────────────────────────────────────────
export const forceCreateMember = async (req: Request, res: Response) => {
  const { role } = (req as any).user;
  if (role !== "SUPER_ADMIN" && role !== "CEO") {
    return res.status(403).json({ error: "Only Super Admin can force create members" });
  }

  const { 
    fullName, email, mobileNumber, districtId, talukId, gender, dob, aadhaarNumber,
    fatherName, bloodGroup, addressLine1, addressLine2, city, addressPincode
  } = req.body;

  try {
    const existing = await prisma.member.findFirst({
      where: {
        OR: [
          { email },
          { mobileNumber },
          { aadhaarNumber }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Member with this email, mobile or Aadhaar already exists" });
    }

    const { raw, hashed } = await generatePassword();
    const permanentId = generatePermanentId("MEM");
    const tempId = `TEMP-MEM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const member = await prisma.member.create({
      data: {
        fullName,
        email,
        mobileNumber,
        districtId,
        talukId,
        gender,
        dob: new Date(dob),
        aadhaarNumber,
        tempId,
        permanentId,
        password: hashed,
        status: "APPROVED",
        isPaid: true,
        mustChangePassword: true,
        pincode: addressPincode || "000000",
        fatherName,
        bloodGroup,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        addressPincode,
      }
    });

    try {
      await sendApprovalEmail({
        toEmail: member.email,
        toName: member.fullName,
        tempId: member.tempId,
        permanentId: member.permanentId!,
        password: raw,
        role: "Member",
      });
    } catch (mailErr) {
      console.error("[Mailer] Failed to send approval email:", mailErr);
    }

    return res.status(201).json({ message: "Member created successfully", data: member });
  } catch (error) {
    console.error("[forceCreateMember]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const importStudentsExcel = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No Excel file uploaded" });
  }

  try {
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName as string];
    const rows = xlsx.utils.sheet_to_json<any>(sheet as any);

    fs.unlinkSync(file.path); // Clean up the temp uploaded file

    const dummyPasswordHash = await bcrypt.hash("Welcome@123", 10);
    let successCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    let _seq = Math.floor(100000 + Math.random() * 900000);
    const nextSeq = () => _seq++;

    for (const [index, row] of rows.entries()) {
      const rowNum = index + 2; // Excel row numbering (1-indexed + header)

      const fullName = row["Full Name"] || row["FullName"] || row["Name"];
      const email = row["Email"] || row["Email ID"] || row["EmailId"];
      const mobile = row["Mobile Number"] || row["Mobile"] || row["MobileNumber"];
      const aadhaar = row["Aadhaar Number"] || row["Aadhaar"] || row["AadhaarNumber"];
      const dobRaw = row["Date of Birth"] || row["DOB"] || row["DateOfBirth"];
      const genderRaw = row["Gender"] || row["Sex"];
      const bloodGroup = row["Blood Group"] || row["BloodGroup"] || "O+";
      const address = row["Address"] || "N/A";
      const city = row["City"] || "Chennai";
      const state = row["State"] || "Tamil Nadu";
      const pincode = String(row["Pincode"] || row["ZipCode"] || "600002");
      const districtName = row["District Name"] || row["District"];
      const talukName = row["Taluk Name"] || row["Taluk"];
      const schoolName = row["School Name"] || row["SchoolName"] || row["School"] || "Chennai Public School";
      const grade = row["Grade"] || row["Class"] || "10th";
      const annualIncome = parseFloat(row["Annual Income"] || row["AnnualIncome"] || row["Income"] || "150000");
      const height = row["Height"] ? String(row["Height"]) : "165";
      const weight = row["Weight"] ? String(row["Weight"]) : "55";
      const statusRaw = row["Status"] || "APPROVED";
      const coachName = row["Coach Name"] || row["Coach"] || row["CoachName"];
      const customTempId = row["Temporary ID"] || row["Temp ID"] || row["tempId"] || row["TemporaryID"];
      const customPermId = row["Permanent ID"] || row["Perm ID"] || row["permanentId"] || row["PermanentID"];

      if (!fullName || !email || !mobile || !aadhaar || !dobRaw || !genderRaw || !districtName || !talukName) {
        failedCount++;
        errors.push({ row: rowNum, error: "Missing required fields (Name, Email, Mobile, Aadhaar, DOB, Gender, District, or Taluk)" });
        continue;
      }

      // Gender parsing
      let gender: "MALE" | "FEMALE" | "OTHER" = "MALE";
      if (String(genderRaw).toUpperCase().trim() === "FEMALE") {
        gender = "FEMALE";
      } else if (String(genderRaw).toUpperCase().trim() === "OTHER") {
        gender = "OTHER";
      }

      // Status parsing
      let status: "APPROVED" | "PENDING" = "APPROVED";
      if (String(statusRaw).toUpperCase().trim() === "PENDING") {
        status = "PENDING";
      }

      // DOB parsing
      let dob: Date;
      try {
        if (typeof dobRaw === "number") {
          dob = new Date((dobRaw - 25569) * 86400 * 1000);
        } else {
          dob = new Date(dobRaw);
        }
        if (isNaN(dob.getTime())) {
          throw new Error("Invalid Date format");
        }
      } catch (e) {
        failedCount++;
        errors.push({ row: rowNum, error: `Invalid date of birth: "${dobRaw}". Expecting YYYY-MM-DD.` });
        continue;
      }

      const age = new Date().getFullYear() - dob.getFullYear();

      try {
        // Look up District in DB
        const districtDb = await prisma.district.findFirst({
          where: { name: { equals: String(districtName).trim(), mode: "insensitive" } },
        });

        if (!districtDb) {
          failedCount++;
          errors.push({ row: rowNum, error: `District "${districtName}" not found in database.` });
          continue;
        }

        // Look up Taluk under this district in DB
        const talukDb = await prisma.taluk.findFirst({
          where: {
            districtId: districtDb.id,
            name: { equals: String(talukName).trim(), mode: "insensitive" },
          },
        });

        if (!talukDb) {
          failedCount++;
          errors.push({ row: rowNum, error: `Taluk "${talukName}" not found in database under District "${districtName}".` });
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
          failedCount++;
          errors.push({ row: rowNum, error: "A player with this Email, Mobile, or Aadhaar already exists." });
          continue;
        }

        // Look up Coach if provided — by Mobile Number (recommended, known
        // up-front without waiting on a system-generated ID), Temp ID,
        // Permanent ID, or full Name.
        let coachId: string | null = null;
        if (coachName) {
          const coachDb = await prisma.coachReferee.findFirst({
            where: {
              OR: [
                { mobileNumber: String(coachName).trim() },
                { tempId: String(coachName).trim() },
                { permanentId: String(coachName).trim() },
                { fullName: { equals: String(coachName).trim(), mode: "insensitive" } }
              ]
            },
          });
          if (coachDb) {
            coachId = coachDb.id;
          }
        }

        // Check custom temporary ID uniqueness if provided
        if (customTempId) {
          const tempExists = await prisma.student.findFirst({
            where: {
              OR: [
                { tempId: String(customTempId).trim() },
                { permanentId: String(customTempId).trim() }
              ]
            }
          });
          if (tempExists) {
            failedCount++;
            errors.push({ row: rowNum, error: `Temporary ID "${customTempId}" is already taken.` });
            continue;
          }
        }

        // Check custom permanent ID uniqueness if provided
        if (customPermId) {
          const permExists = await prisma.student.findFirst({
            where: {
              OR: [
                { tempId: String(customPermId).trim() },
                { permanentId: String(customPermId).trim() }
              ]
            }
          });
          if (permExists) {
            failedCount++;
            errors.push({ row: rowNum, error: `Permanent ID "${customPermId}" is already taken.` });
            continue;
          }
        }

        // Generate IDs
        const seq = nextSeq();
        const tempId = customTempId ? String(customTempId).trim() : `STU${seq}`;
        const permanentId = customPermId ? String(customPermId).trim() : (status === "APPROVED" ? `PERM${seq}` : null);

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
            nationality: "Indian",
            annualIncome,
            isBPL: false,
            schoolName: String(schoolName).trim(),
            grade: String(grade).trim(),
            password: dummyPasswordHash,
            mustChangePassword: true,
            status,
            isPaid: status === "APPROVED",
            districtId: districtDb.id,
            talukId: talukDb.id,
            weight,
            height,
            coachId,
          },
        });

        successCount++;
      } catch (err: any) {
        failedCount++;
        errors.push({ row: rowNum, error: err.message || "Database insert error" });
      }
    }

    return res.json({
      message: "Excel import process complete.",
      successCount,
      failedCount,
      errors,
      defaultPassword: successCount > 0 ? "Welcome@123" : undefined
    });

  } catch (error: any) {
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    console.error("[importStudentsExcel]", error);
    return res.status(500).json({ error: error.message || "Failed to process Excel file" });
  }
};

export const importCoachesExcel = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No Excel file uploaded" });
  }

  try {
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName as string];
    const rows = xlsx.utils.sheet_to_json<any>(sheet as any);

    fs.unlinkSync(file.path); // Clean up the temp uploaded file

    const dummyPasswordHash = await bcrypt.hash("Welcome@123", 10);
    let successCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    for (const [index, row] of rows.entries()) {
      const rowNum = index + 2; // Excel row numbering (1-indexed + header)

      const fullName = row["Full Name"] || row["FullName"] || row["Name"];
      const fatherName = row["Father Name"] || row["FatherName"] || row["Father's Name"];
      const email = row["Email"] || row["Email ID"] || row["EmailId"];
      const mobile = row["Mobile Number"] || row["Mobile"] || row["MobileNumber"];
      const aadhaar = row["Aadhaar Number"] || row["Aadhaar"] || row["AadhaarNumber"];
      const dobRaw = row["Date of Birth"] || row["DOB"] || row["DateOfBirth"];
      const genderRaw = row["Gender"] || row["Sex"];
      const bloodGroup = row["Blood Group"] || row["BloodGroup"] || "O+";
      const districtName = row["District Name"] || row["District"];
      const talukName = row["Taluk Name"] || row["Taluk"];
      const pincode = String(row["Pincode"] || row["ZipCode"] || "600002");
      const historyInJudo = row["History in Judo"] || row["HistoryInJudo"] || "None";
      const historyInOtherMartial = row["History in Other Martial"] || row["HistoryInOtherMartial"] || "None";
      const presentGradeInJudo = row["Present Grade in Judo"] || row["PresentGradeInJudo"] || "None";
      const statusRaw = row["Status"] || "APPROVED";
      const customTempId = row["Temporary ID"] || row["Temp ID"] || row["tempId"] || row["TemporaryID"];
      const customPermId = row["Permanent ID"] || row["Perm ID"] || row["permanentId"] || row["PermanentID"];

      if (!fullName || !fatherName || !email || !mobile || !aadhaar || !dobRaw || !genderRaw || !districtName || !talukName) {
        failedCount++;
        errors.push({ row: rowNum, error: "Missing required fields (Name, Father Name, Email, Mobile, Aadhaar, DOB, Gender, District, or Taluk)" });
        continue;
      }

      // Gender parsing
      let gender: "MALE" | "FEMALE" | "OTHER" = "MALE";
      if (String(genderRaw).toUpperCase().trim() === "FEMALE") {
        gender = "FEMALE";
      } else if (String(genderRaw).toUpperCase().trim() === "OTHER") {
        gender = "OTHER";
      }

      // Status parsing
      let status: "APPROVED" | "PENDING" = "APPROVED";
      if (String(statusRaw).toUpperCase().trim() === "PENDING") {
        status = "PENDING";
      }

      // DOB parsing
      let dob: Date;
      try {
        if (typeof dobRaw === "number") {
          dob = new Date((dobRaw - 25569) * 86400 * 1000);
        } else {
          dob = new Date(dobRaw);
        }
        if (isNaN(dob.getTime())) {
          throw new Error("Invalid Date format");
        }
      } catch (e) {
        failedCount++;
        errors.push({ row: rowNum, error: `Invalid date of birth: "${dobRaw}". Expecting YYYY-MM-DD.` });
        continue;
      }

      const age = new Date().getFullYear() - dob.getFullYear();

      try {
        // Look up District in DB
        const districtDb = await prisma.district.findFirst({
          where: { name: { equals: String(districtName).trim(), mode: "insensitive" } },
        });

        if (!districtDb) {
          failedCount++;
          errors.push({ row: rowNum, error: `District "${districtName}" not found in database.` });
          continue;
        }

        // Look up Taluk under this district in DB
        const talukDb = await prisma.taluk.findFirst({
          where: {
            districtId: districtDb.id,
            name: { equals: String(talukName).trim(), mode: "insensitive" },
          },
        });

        if (!talukDb) {
          failedCount++;
          errors.push({ row: rowNum, error: `Taluk "${talukName}" not found in database under District "${districtName}".` });
          continue;
        }

        // Check duplicate records
        const existingCoach = await prisma.coachReferee.findFirst({
          where: {
            OR: [
              { email: String(email).trim() },
              { mobileNumber: String(mobile).trim() },
              { aadhaarNumber: String(aadhaar).trim() }
            ]
          }
        });

        if (existingCoach) {
          failedCount++;
          errors.push({ row: rowNum, error: "A coach with this Email, Mobile, or Aadhaar already exists." });
          continue;
        }

        // Check custom temporary ID uniqueness if provided
        if (customTempId) {
          const tempExists = await prisma.coachReferee.findFirst({
            where: {
              OR: [
                { tempId: String(customTempId).trim() },
                { permanentId: String(customTempId).trim() }
              ]
            }
          });
          if (tempExists) {
            failedCount++;
            errors.push({ row: rowNum, error: `Temporary ID "${customTempId}" is already taken.` });
            continue;
          }
        }

        // Check custom permanent ID uniqueness if provided
        if (customPermId) {
          const permExists = await prisma.coachReferee.findFirst({
            where: {
              OR: [
                { tempId: String(customPermId).trim() },
                { permanentId: String(customPermId).trim() }
              ]
            }
          });
          if (permExists) {
            failedCount++;
            errors.push({ row: rowNum, error: `Permanent ID "${customPermId}" is already taken.` });
            continue;
          }
        }

        // Generate IDs
        const tempId = customTempId ? String(customTempId).trim() : `TEMP-COA-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        const permanentId = customPermId ? String(customPermId).trim() : (status === "APPROVED" ? generatePermanentId("COA") : null);

        // Insert CoachReferee
        await prisma.coachReferee.create({
          data: {
            tempId,
            permanentId,
            fullName: String(fullName).trim(),
            fatherName: String(fatherName).trim(),
            gender,
            dob,
            age,
            bloodGroup: String(bloodGroup).trim(),
            mobileNumber: String(mobile).trim(),
            email: String(email).trim(),
            aadhaarNumber: String(aadhaar).trim(),
            pincode,
            historyInJudo: String(historyInJudo).trim(),
            historyInOtherMartial: String(historyInOtherMartial).trim(),
            presentGradeInJudo: String(presentGradeInJudo).trim(),
            password: dummyPasswordHash,
            mustChangePassword: true,
            status,
            isPaid: status === "APPROVED",
            districtId: districtDb.id,
            talukId: talukDb.id,
          },
        });

        successCount++;
      } catch (err: any) {
        failedCount++;
        errors.push({ row: rowNum, error: err.message || "Database insert error" });
      }
    }

    return res.json({
      message: "Excel import process complete.",
      successCount,
      failedCount,
      errors,
      defaultPassword: successCount > 0 ? "Welcome@123" : undefined
    });

  } catch (error: any) {
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    console.error("[importCoachesExcel]", error);
    return res.status(500).json({ error: error.message || "Failed to process Excel file" });
  }
};


