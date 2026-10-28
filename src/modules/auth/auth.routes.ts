import { Router } from "express";
import { login, switchRole, getProfile, updateProfile, changePassword, forgotPassword, resetPassword, trackStatus, startAadhaarDigilocker, checkAadhaarDigilocker, sendEmailOtp, verifyEmailOtp, sendMobileOtp, verifyMobileOtp } from "./auth.controller.js";
import { authenticateJWT } from "../../middleware/authMiddleware.js";
import { limits } from "../../middleware/rateLimit.js";

const router = Router();

router.post("/login", limits.login, login);
router.post("/switch-role", authenticateJWT, switchRole);
router.get("/profile", authenticateJWT, getProfile);
router.put("/profile", authenticateJWT, updateProfile);
router.post("/change-password", authenticateJWT, changePassword);
router.post("/forgot-password", limits.forgotPassword, forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/track-status", limits.trackStatus, trackStatus);

// Paid providers (Sandbox KYC, Twilio SMS) and email: rate limited per IP, per target and per day.
router.post("/aadhaar/digilocker/start", limits.aadhaarStart, startAadhaarDigilocker);
router.post("/aadhaar/digilocker/check", limits.aadhaarCheck, checkAadhaarDigilocker);
router.post("/email-otp/send", limits.emailOtpSend, sendEmailOtp);
router.post("/email-otp/verify", limits.otpVerify, verifyEmailOtp);
router.post("/mobile-otp/send", limits.mobileOtpSend, sendMobileOtp);
router.post("/mobile-otp/verify", limits.otpVerify, verifyMobileOtp);
export default router;
