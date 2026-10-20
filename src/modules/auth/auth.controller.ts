import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../../database/prisma.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getJwtSecret } from "../../config/env.js";
import { sendResetPasswordEmail, sendEmailVerificationOtp } from "../../config/mailer.js";
import { type OtpChannel, isValidEmailFormat, isValidMobileFormat, findEmailConflict, createOtp, checkOtp, createVerifiedToken } from "../../helpers/otpVerification.helper.js";
import { isWhatsappConfigured, sendWhatsappOtp } from "../../config/whatsapp.js";
import { isSandboxConfigured, initDigilockerSession, getDigilockerSessionStatus, fetchDigilockerAadhaar, SandboxError, sendAadhaarNotConfigured } from "../../config/sandbox.js";
import { isValidAadhaarFormat, findAadhaarConflict, createDigilockerSessionToken, readDigilockerSessionToken, createAadhaarVerifiedToken } from "../../helpers/aadhaar.helper.js";

// Constant-time comparison to avoid leaking the admin password via response timing.
const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const login = async (req: Request, res: Response) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Identifier and password are required" });
  }

  try {
    // ── Super Admin ──────────────────────────────────────────────────────────
    // Only enabled when both env vars are set; there are no default credentials.
    const adminEmail = process.env.SUPER_ADMIN_EMAIL;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

    if (adminEmail && adminPassword && identifier === adminEmail) {
      const isPasswordValid = safeEqual(String(password), adminPassword);
      if (!isPasswordValid) return res.status(401).json({ error: "Invalid password" });
      const token = jwt.sign(
        { userId: "ADMIN", role: "SUPER_ADMIN" },
        getJwtSecret(),
        { expiresIn: "24h" }
      );

      return res.json({
        message: "Login successful",
        user: { fullName: "Super Admin", email: adminEmail },
        role: "SUPER_ADMIN",
        token: token,
      });
    }

    // ── Student ───────────────────────────────────────────────────────────────
    let user: any = await prisma.student.findFirst({
      where: { OR: [{ email: identifier }, { tempId: identifier }, { permanentId: identifier }] },
    });
    let role = "PLAYER";

    // ── Coach / Referee ───────────────────────────────────────────────────────
    if (!user) {
      user = await prisma.coachReferee.findFirst({
        where: { OR: [{ email: identifier }, { tempId: identifier }, { permanentId: identifier }] },
      });
      if (user) role = "COACH";
    }

    // ── Member ────────────────────────────────────────────────────────────────
    if (!user) {
      user = await prisma.member.findFirst({
        where: { OR: [{ email: identifier }, { tempId: identifier }, { permanentId: identifier }] },
      });
      if (user) role = user.role; // Use the role from the DB (MEMBER, DISTRICT_PRESIDENT, etc.)
    }

    // ── Club ──────────────────────────────────────────────────────────────────
    if (!user) {
      user = await prisma.club.findFirst({
        where: { OR: [{ email: identifier }, { permanentId: identifier }, { tempId: identifier }] },
      });
      if (user) role = "CLUB";
    }

    if (!user) {
      return res.status(404).json({ error: "No account found with that ID or email" });
    }

    // ── Status check: PENDING / REJECTED users have no password yet ───────────
    if (user.status === "PENDING") {
      return res.status(403).json({
        error: "Your application is still pending approval. You will receive login credentials by email once approved.",
        status: "PENDING",
        tempId: user.tempId,
      });
    }
    if (user.status === "REJECTED") {
      return res.status(403).json({
        error: "Your application was rejected. Please contact the TNJA office.",
        status: "REJECTED",
        remark: user.rejectionRemark || "",
      });
    }

    // ── Password validation ───────────────────────────────────────────────────
    if (!user.password) {
      return res.status(401).json({ error: "Account has no password set. Please contact admin." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const tokenPayload: any = { userId: user.id, role: role };
    const isMemberRole = ["MEMBER", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"].includes(role);
    if (isMemberRole && user.districtId) {
      tokenPayload.districtId = (user.assignedDistrictId && ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) ? user.assignedDistrictId : user.districtId;
    }

    const token = jwt.sign(
      tokenPayload,
      getJwtSecret(),
      { expiresIn: "24h" }
    );

    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        fullName: user.fullName || user.name,
        email: user.email,
        status: user.status,
        tempId: user.tempId,
        permanentId: user.permanentId,
        districtId: user.districtId,
        mustChangePassword: user.permanentId ? user.mustChangePassword : false
      },
      role,
      token,
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getProfile = async (req: any, res: Response) => {
  const { userId, role } = req.user;

  try {
    let userData: any = null;

    if (role === "SUPER_ADMIN") {
      return res.json({
        role: "SUPER_ADMIN",
        user: { fullName: "Super Admin", email: process.env.SUPER_ADMIN_EMAIL || "" }
      });
    }

    if (role === "PLAYER") {
      userData = await prisma.student.findUnique({
        where: { id: userId },
        include: { district: true, taluk: true, club: true, coach: true }
      });
    } else if (role === "COACH") {
      userData = await prisma.coachReferee.findUnique({
        where: { id: userId },
        include: { district: true, taluk: true, club: true }
      });
    } else if (["MEMBER", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"].includes(role)) {
      userData = await prisma.member.findUnique({
        where: { id: userId },
        include: { district: true, taluk: true, assignedDistrict: true }
      });
    } else if (role === "CLUB") {
      userData = await prisma.club.findUnique({
        where: { id: userId },
        include: { district: true, taluk: true }
      });
    }

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove password before sendingss
    const { password: _, ...safeData } = userData;

    return res.json({
      role,
      user: safeData
    });

  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateProfile = async (req: any, res: Response) => {
  const { userId, role } = req.user;
  const updates = req.body;

  try {
    let updatedUser: any = null;

    if (role === "SUPER_ADMIN") {
      return res.status(403).json({ error: "Cannot update Super Admin profile from this endpoint" });
    }

    if (role === "PLAYER") {
      updatedUser = await prisma.student.update({
        where: { id: userId },
        data: {
          fullName: updates.fullName !== undefined ? updates.fullName : undefined,
          fatherName: updates.fatherName !== undefined ? updates.fatherName : undefined,
          bloodGroup: updates.bloodGroup !== undefined ? updates.bloodGroup : undefined,
          gender: updates.gender !== undefined ? updates.gender : undefined,
          height: updates.height !== undefined ? updates.height : undefined,
          weight: updates.weight !== undefined ? updates.weight : undefined,
          mobileNumber: updates.mobileNumber !== undefined ? updates.mobileNumber : undefined,
          // Add other common editable fields if necessary
          address: updates.address !== undefined ? updates.address : undefined,
          city: updates.city !== undefined ? updates.city : undefined,
          state: updates.state !== undefined ? updates.state : undefined,
          addressPincode: updates.addressPincode !== undefined ? updates.addressPincode : undefined,
        }
      });
    } else if (role === "COACH") {
      updatedUser = await prisma.coachReferee.update({
        where: { id: userId },
        data: {
          fullName: updates.fullName !== undefined ? updates.fullName : undefined,
          fatherName: updates.fatherName !== undefined ? updates.fatherName : undefined,
          bloodGroup: updates.bloodGroup !== undefined ? updates.bloodGroup : undefined,
          gender: updates.gender !== undefined ? updates.gender : undefined,
          mobileNumber: updates.mobileNumber !== undefined ? updates.mobileNumber : undefined,
        }
      });
    } else if (["MEMBER", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"].includes(role)) {
      updatedUser = await prisma.member.update({
        where: { id: userId },
        data: {
          fullName: updates.fullName !== undefined ? updates.fullName : undefined,
          fatherName: updates.fatherName !== undefined ? updates.fatherName : undefined,
          bloodGroup: updates.bloodGroup !== undefined ? updates.bloodGroup : undefined,
          mobileNumber: updates.mobileNumber !== undefined ? updates.mobileNumber : undefined,
        }
      });
    } else if (role === "CLUB") {
      updatedUser = await prisma.club.update({
        where: { id: userId },
        data: {
          name: updates.fullName !== undefined ? updates.fullName : undefined, // Assuming club uses name
          mobileNumber: updates.mobileNumber !== undefined ? updates.mobileNumber : undefined,
          president: updates.president !== undefined ? updates.president : undefined,
          secretary: updates.secretary !== undefined ? updates.secretary : undefined,
          coach: updates.coach !== undefined ? updates.coach : undefined,
        }
      });
    }

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found or role unhandled" });
    }

    const { password: _, ...safeData } = updatedUser;

    return res.json({
      message: "Profile updated successfully",
      user: safeData
    });

  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const changePassword = async (req: any, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const { userId, role } = req.user;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required" });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ error: "Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character." });
  }

  try {
    let user: any = null;
    let model: any = null;

    if (role === "PLAYER") model = prisma.student;
    else if (role === "COACH") model = prisma.coachReferee;
    else if (["MEMBER", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"].includes(role)) model = prisma.member;
    else if (role === "CLUB") model = prisma.club;
    else return res.status(403).json({ error: "Super Admin password cannot be changed via this endpoint" });

    user = await model.findUnique({ where: { id: userId } });

    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: "Incorrect current password" });

    const hashedNew = await bcrypt.hash(newPassword, 10);

    await model.update({
      where: { id: userId },
      data: {
        password: hashedNew,
        mustChangePassword: false
      }
    });

    return res.json({ message: "Password changed successfully. You can now access your dashboard." });

  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Check all models for the email
    let user: any = await prisma.student.findUnique({ where: { email } });
    let modelName: string = "student";

    if (!user) {
      user = await prisma.coachReferee.findUnique({ where: { email } });
      modelName = "coachReferee";
    }
    if (!user) {
      user = await prisma.member.findUnique({ where: { email } });
      modelName = "member";
    }
    if (!user) {
      user = await prisma.club.findUnique({ where: { email } });
      modelName = "club";
    }

    if (!user) {
      // For security, don't reveal if user exists. Just say email sent.
      return res.json({ message: "If an account with that email exists, we have sent a reset link." });
    }

    // Generate Token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    // Update user with token
    await (prisma as any)[modelName].update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires,
      },
    });

    // Send Email
    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;
    
    // Dynamically import sendResetPasswordEmail to avoid circular dependency issues if any
    const { sendResetPasswordEmail } = await import("../../config/mailer.js");
    await sendResetPasswordEmail({
      toEmail: user.email,
      toName: user.fullName || user.clubName,
      resetLink,
    });

    return res.json({ message: "A password reset link has been sent to your email." });

  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ error: "Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character." });
  }

  try {
    let user: any = null;
    let modelName: string = "";

    const models = ["student", "coachReferee", "member", "club"];
    
    for (const m of models) {
      const found = await (prisma as any)[m].findFirst({
        where: {
          resetPasswordToken: token,
          resetPasswordExpires: { gt: new Date() },
        },
      });
      if (found) {
        user = found;
        modelName = m;
        break;
      }
    }

    if (!user) {
      return res.status(400).json({ error: "Password reset token is invalid or has expired." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await (prisma as any)[modelName].update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        mustChangePassword: false, // Reset this if it was their first login
      },
    });

    return res.json({ message: "Your password has been reset successfully. You can now log in." });

  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const trackStatus = async (req: Request, res: Response) => {
  const { tempId, password } = req.body;

  if (!tempId || !password) {
    return res.status(400).json({ error: "Temporary ID and password are required" });
  }

  try {
    let user: any = null;
    let role = "";

    // Check Student
    user = await prisma.student.findFirst({
      where: { OR: [{ tempId: tempId }, { permanentId: tempId }] },
      include: { district: true }
    });
    if (user) role = "PLAYER";

    // Check Coach
    if (!user) {
      user = await prisma.coachReferee.findFirst({
        where: { OR: [{ tempId: tempId }, { permanentId: tempId }] },
        include: { district: true }
      });
      if (user) role = "COACH";
    }

    // Check Member
    if (!user) {
      user = await prisma.member.findFirst({
        where: { OR: [{ tempId: tempId }, { permanentId: tempId }] },
        include: { district: true }
      });
      if (user) role = user.role;
    }

    // Check Club
    if (!user) {
      user = await prisma.club.findFirst({
        where: { OR: [{ tempId: tempId }, { permanentId: tempId }] },
        include: { district: true }
      });
      if (user) role = "CLUB";
    }

    if (!user) {
      return res.status(404).json({ error: "No application found with this Temporary ID." });
    }

    // Verify password
    if (!user.password) {
      return res.status(401).json({ error: "No password set for this account." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const tokenPayload: any = { userId: user.id, role: role };
    if (user.districtId) {
      tokenPayload.districtId = (user.assignedDistrictId && ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role)) ? user.assignedDistrictId : user.districtId;
    }
    const token = jwt.sign(
      tokenPayload,
      getJwtSecret(),
      { expiresIn: "24h" }
    );

    const { password: _, ...safeUser } = user;
    
    return res.json({
      token,
      user: {
        ...safeUser,
        fullName: safeUser.fullName || safeUser.name || safeUser.clubName,
        role: role
      }
    });
  } catch (error) {
    console.error("Track status error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ── Aadhaar Verification (DigiLocker via Sandbox) ────────────────────────────
// UIDAI discontinued offline e-KYC (OTP). The user now signs in to DigiLocker in a
// popup and consents to share their Aadhaar; the frontend polls checkAadhaarDigilocker.
const DIGILOCKER_START_COOLDOWN_MS = 15 * 1000;
const lastDigilockerStartAt = new Map<string, number>();

export const startAadhaarDigilocker = async (req: Request, res: Response) => {
  const { aadhaarNumber, email } = req.body;
  if (!isValidAadhaarFormat(aadhaarNumber)) {
    return res.status(400).json({ error: "Please enter a valid 12-digit Aadhaar number." });
  }
  if (!isSandboxConfigured()) return sendAadhaarNotConfigured(res);

  try {
    // 1. Check for duplicates in the system
    const aadhaarConflict = await findAadhaarConflict(aadhaarNumber);
    if (aadhaarConflict) return res.status(400).json({ error: aadhaarConflict });

    // 1.5 Check for duplicate email in the system
    if (email) {
      const emailConflict = await findEmailConflict(email);
      if (emailConflict) return res.status(400).json({ error: emailConflict });
    }

    // 2. Limit paid API calls from repeated clicks
    const now = Date.now();
    const last = lastDigilockerStartAt.get(aadhaarNumber);
    if (last && now - last < DIGILOCKER_START_COOLDOWN_MS) {
      const wait = Math.ceil((DIGILOCKER_START_COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait} seconds before trying again.` });
    }
    lastDigilockerStartAt.set(aadhaarNumber, now);
    for (const [key, at] of lastDigilockerStartAt) {
      if (now - at > DIGILOCKER_START_COOLDOWN_MS) lastDigilockerStartAt.delete(key);
    }

    // 3. Start a DigiLocker consent session (via Sandbox)
    const { sessionId, authorizationUrl } = await initDigilockerSession();

    return res.json({
      authorizationUrl,
      digilockerSessionToken: createDigilockerSessionToken(aadhaarNumber, sessionId),
    });
  } catch (error) {
    if (error instanceof SandboxError) {
      return res.status(error.status >= 500 ? 502 : 400).json({ error: error.message });
    }
    console.error("Error starting DigiLocker verification:", error);
    return res.status(500).json({ error: "Failed to start Aadhaar verification." });
  }
};

/** Returns { status: "pending" } until the user consents in DigiLocker, then verifies the Aadhaar. */
export const checkAadhaarDigilocker = async (req: Request, res: Response) => {
  const { aadhaarNumber, digilockerSessionToken } = req.body;
  if (!isValidAadhaarFormat(aadhaarNumber)) {
    return res.status(400).json({ error: "Please enter a valid 12-digit Aadhaar number." });
  }
  if (!isSandboxConfigured()) return sendAadhaarNotConfigured(res);

  const sessionId = readDigilockerSessionToken(digilockerSessionToken, aadhaarNumber);
  if (!sessionId) {
    return res.status(400).json({ error: "Verification session expired. Please click Verify again." });
  }

  try {
    const status = await getDigilockerSessionStatus(sessionId);
    if (status === "created") return res.json({ status: "pending" });
    if (status !== "succeeded") {
      return res.status(400).json({ error: "DigiLocker verification was cancelled or expired. Please click Verify again." });
    }

    const details = await fetchDigilockerAadhaar(sessionId);
    // DigiLocker returns a masked number (e.g. xxxxxxxx1234); its last 4 digits must match what was entered.
    const lastFour = (details.maskedAadhaar || "").replace(/\D/g, "").slice(-4);
    if (lastFour.length !== 4 || lastFour !== aadhaarNumber.slice(-4)) {
      console.error(`[Aadhaar] DigiLocker Aadhaar ending ${lastFour || "n/a"} does not match entered number ending ${aadhaarNumber.slice(-4)}`);
      return res.status(400).json({ error: "The Aadhaar in your DigiLocker account does not match the number you entered." });
    }

    return res.json({
      status: "verified",
      message: "Aadhaar verified successfully.",
      aadhaarVerificationToken: createAadhaarVerifiedToken(aadhaarNumber, details.name),
      aadhaarDetails: { name: details.name, gender: details.gender, dateOfBirth: details.dateOfBirth },
    });
  } catch (error) {
    if (error instanceof SandboxError) {
      return res.status(error.status >= 500 ? 502 : 400).json({ error: error.message });
    }
    console.error("Error checking DigiLocker verification:", error);
    return res.status(500).json({ error: "Failed to verify Aadhaar." });
  }
};

// ── OTP Verification: email, and mobile via WhatsApp (MSG91) ────────────────
const OTP_COOLDOWN_MS = 30 * 1000;
const lastOtpAt = new Map<string, number>();

const otpChannels = {
  email: {
    isValid: isValidEmailFormat,
    invalidMessage: "Please enter a valid email address.",
    findConflict: findEmailConflict,
    isConfigured: () => true,
    deliver: (email: string, otp: string) => sendEmailVerificationOtp({ toEmail: email, otp }),
    sentMessage: "OTP sent to your email.",
    failedMessage: "Failed to send OTP email. Please try again later.",
    verifiedMessage: "Email verified successfully.",
  },
  mobile: {
    isValid: isValidMobileFormat,
    invalidMessage: "Please enter a valid 10-digit mobile number.",
    findConflict: async () => null, // each registration rejects a mobile already used in its own role
    isConfigured: isWhatsappConfigured,
    deliver: sendWhatsappOtp,
    sentMessage: "OTP sent to your WhatsApp.",
    failedMessage: "Failed to send OTP on WhatsApp. Please check the number uses WhatsApp and try again.",
    verifiedMessage: "Mobile number verified successfully.",
  },
} satisfies Record<OtpChannel, unknown>;

const sendOtp = (channel: OtpChannel) => async (req: Request, res: Response) => {
  const config = otpChannels[channel];
  const { target } = req.body;
  if (!config.isValid(target)) return res.status(400).json({ error: config.invalidMessage });
  if (!config.isConfigured()) {
    console.error(`[OTP] ${channel} OTP is not configured.`);
    return res.status(503).json({ error: "Verification is not available right now. Please try again later." });
  }

  try {
    const conflict = await config.findConflict(target);
    if (conflict) return res.status(400).json({ error: conflict });

    const key = `${channel}:${target.toLowerCase()}`;
    const now = Date.now();
    const last = lastOtpAt.get(key);
    if (last && now - last < OTP_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait} seconds before requesting another OTP.` });
    }
    lastOtpAt.set(key, now);
    for (const [k, at] of lastOtpAt) {
      if (now - at > OTP_COOLDOWN_MS) lastOtpAt.delete(k);
    }

    const { otp, token } = createOtp(channel, target);
    try {
      await config.deliver(target, otp);
    } catch (deliveryError) {
      lastOtpAt.delete(key); // nothing was sent, so allow an immediate retry
      throw deliveryError;
    }

    return res.json({ message: config.sentMessage, otpToken: token });
  } catch (error) {
    console.error(`Error sending ${channel} OTP:`, error);
    return res.status(500).json({ error: config.failedMessage });
  }
};

const verifyOtp = (channel: OtpChannel) => async (req: Request, res: Response) => {
  const config = otpChannels[channel];
  const { target, otp, otpToken } = req.body;
  if (!config.isValid(target) || typeof otp !== "string" || !/^[0-9]{6}$/.test(otp)) {
    return res.status(400).json({ error: "A valid value and a 6-digit OTP are required." });
  }

  const problem = checkOtp(channel, otpToken, target, otp);
  if (problem) return res.status(400).json({ error: problem });

  return res.json({ message: config.verifiedMessage, verificationToken: createVerifiedToken(channel, target) });
};

export const sendEmailOtp = sendOtp("email");
export const verifyEmailOtp = verifyOtp("email");
export const sendMobileOtp = sendOtp("mobile");
export const verifyMobileOtp = verifyOtp("mobile");
