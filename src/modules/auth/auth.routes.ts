import { Router } from "express";
import { login, switchRole, getProfile, updateProfile, changePassword, forgotPassword, resetPassword, trackStatus, startAadhaarDigilocker, checkAadhaarDigilocker, sendEmailOtp, verifyEmailOtp, sendMobileOtp, verifyMobileOtp } from "./auth.controller.js";
import { authenticateJWT } from "../../middleware/authMiddleware.js";

const router = Router();

router.post("/login", login);
router.post("/switch-role", authenticateJWT, switchRole);
router.get("/profile", authenticateJWT, getProfile);
router.put("/profile", authenticateJWT, updateProfile);
router.post("/change-password", authenticateJWT, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/track-status", trackStatus);

router.post("/aadhaar/digilocker/start", startAadhaarDigilocker);
router.post("/aadhaar/digilocker/check", checkAadhaarDigilocker);
router.post("/email-otp/send", sendEmailOtp);
router.post("/email-otp/verify", verifyEmailOtp);
router.post("/mobile-otp/send", sendMobileOtp);
router.post("/mobile-otp/verify", verifyMobileOtp);
export default router;
