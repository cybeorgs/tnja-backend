import { Router } from "express";
import { login, getProfile, updateProfile, changePassword, forgotPassword, resetPassword, trackStatus, sendAadhaarOtp, verifyAadhaarOtp } from "./auth.controller.js";
import { authenticateJWT } from "../../middleware/authMiddleware.js";

const router = Router();

router.post("/login", login);
router.get("/profile", authenticateJWT, getProfile);
router.put("/profile", authenticateJWT, updateProfile);
router.post("/change-password", authenticateJWT, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/track-status", trackStatus);

router.post("/send-aadhaar-otp", sendAadhaarOtp);
router.post("/verify-aadhaar-otp", verifyAadhaarOtp);
export default router;
