import { Router } from "express";
import { registerStudent, registerCoach, registerClub, registerMember, resubmitApplication, resubmitBplProof, continueWithoutBpl } from "./registration.controller.js";
import { updateApplicationStatus, requestChanges, getApplicationDetails, getPendingApplications, getDashboardStats, getLocationAnalytics, getGlobalSettings, updateGlobalSettings, promoteMember, forceCreateStudent, forceCreateClub, forceCreateMember, importStudentsExcel, importCoachesExcel } from "../admin/admin.controller.js";
import { getAllUsers, updateUserCredentials, updateUserProfile, getPublicCoaches, getPublicMembers, getCoachStudents, deleteUser, getUserDetails, searchRefereeById, searchStudents, blockUser } from "../users/user.controller.js";
import { getClubs } from "../clubs/club.controller.js";
import { getDistricts, getTaluksByDistrict, getTalukDetails, getLocationByPincode, updateDistrictCode } from "../locations/location.controller.js";
import { authenticateJWT, authorizeAdmin, authorize } from "../../middleware/authMiddleware.js";
import { createEvent, getActiveEvents, getAdminEvents, getMyEvents, updateEvent, applyForEvent, createEventPaymentOrder, verifyEventPayment, getEventSections } from "../events/event.controller.js";
import { createTournament, startTournament, getClubTournaments, getTournamentRegistrations, updateRegistrationStatus, disqualifyRegistration, updateRegistrationMetrics, sendRegistrationReply, getRegistrationMessages, updateTournament, deleteTournament, getPlayerTournaments, getPlayerPublicMatches, getCategoryParticipants, createTournamentPaymentOrder, verifyTournamentPayment, getAdminTournaments, getAdminApprovedTournaments, approveTournament, sendTournamentReply, getApprovedTournaments, getTournamentById, getTournamentDraws, saveTournamentDraw, getTournamentMessages, getTournamentMats, saveTournamentMats, getRefereeMats, submitMatchResult, updateMatchState, submitTournamentResults, bulkImportRegistrations, addManualRegistration, downloadTournamentReport } from "../tournaments/tournament.controller.js";
import { downloadCertificate } from "../certificates/certificate.controller.js";
import { createPaymentOrder, verifyPayment } from "../payments/payment.controller.js";
import { scoreboardOptions } from "../../constants/scoreboardOptions.js";
import { upload } from "../../middleware/uploadMiddleware.js";

const router = Router();

router.post("/events/create", authenticateJWT, createEvent);
router.get("/events/my", authenticateJWT, getMyEvents);
router.put("/events/:id", authenticateJWT, updateEvent);
router.post("/events/apply", authenticateJWT, applyForEvent);
router.get("/events/active", authenticateJWT, getActiveEvents);
router.get("/events/admin", authenticateJWT, authorizeAdmin, getAdminEvents);
router.post("/events/create-payment-order", authenticateJWT, createEventPaymentOrder);
router.post("/events/verify-payment", authenticateJWT, verifyEventPayment);
router.get("/events/sections", authenticateJWT, getEventSections);

// ── Tournament Routes ──────────────────────────────────────────────────────
router.get("/referees/my-mats", authenticateJWT, getRefereeMats);

// Club
router.post("/tournaments/club/create", authenticateJWT, createTournament);
router.put("/tournaments/:id/start", authenticateJWT, startTournament);
router.get("/tournaments/club", authenticateJWT, getClubTournaments);
// Official
router.post("/tournaments/official/create", authenticateJWT, authorize(["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"]), createTournament);
router.get("/tournaments/official/my", authenticateJWT, authorize(["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"]), getClubTournaments); // Reusing getClubTournaments since we can modify it

router.get("/tournaments/approved", authenticateJWT, getApprovedTournaments);
// Player
router.get("/tournaments/player", authenticateJWT, getPlayerTournaments);
router.get("/tournaments/player/category-participants", authenticateJWT, getCategoryParticipants);
router.get("/tournaments/player/matches", authenticateJWT, getPlayerPublicMatches);
router.post("/tournaments/player/pay", authenticateJWT, createTournamentPaymentOrder);
router.post("/tournaments/player/verify", authenticateJWT, verifyTournamentPayment);
router.get("/tournaments/:id/certificate", authenticateJWT, downloadCertificate);
router.get("/tournaments/:id/report", authenticateJWT, downloadTournamentReport);

// --- Admin Tournaments ---
router.get("/tournaments/admin", authenticateJWT, authorize(["SUPER_ADMIN", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"]), getAdminTournaments);
router.get("/tournaments/admin/approved", authenticateJWT, authorize(["SUPER_ADMIN", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"]), getAdminApprovedTournaments);

// --- Parameterized Routes (MUST BE LAST) ---
router.get("/tournaments/:id/registrations", authenticateJWT, getTournamentRegistrations);
router.post("/tournaments/:id/registrations/bulk", authenticateJWT, upload.single("file"), bulkImportRegistrations);
router.post("/tournaments/:id/registrations/manual", authenticateJWT, addManualRegistration);
router.patch("/tournaments/:id/registrations/:regId", authenticateJWT, updateRegistrationStatus);
router.patch("/tournaments/:id/registrations/:regId/disqualify", authenticateJWT, disqualifyRegistration);
router.patch("/tournaments/:id/registrations/:regId/metrics", authenticateJWT, updateRegistrationMetrics);
router.post("/tournaments/:id/registrations/:regId/reply", authenticateJWT, sendRegistrationReply);
router.get("/tournaments/:id/registrations/:regId/messages", authenticateJWT, getRegistrationMessages);
router.get("/tournaments/:id", authenticateJWT, getTournamentById);
router.get("/tournaments/:id/draws", getTournamentDraws);
router.post("/tournaments/:id/draws", authenticateJWT, authorize(["SUPER_ADMIN", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "CLUB", "COACH"]), saveTournamentDraw);
router.get("/tournaments/:id/messages", authenticateJWT, getTournamentMessages);
router.get("/tournaments/:id/mats", authenticateJWT, getTournamentMats);
router.post("/tournaments/:id/mats", authenticateJWT, authorizeAdmin, saveTournamentMats);
router.patch("/tournaments/:id/matches/:matchId/state", authenticateJWT, updateMatchState);
router.post("/tournaments/:id/matches/:matchId/result", authenticateJWT, submitMatchResult);
router.post("/tournaments/:id/results", authenticateJWT, submitTournamentResults);
router.put("/tournaments/:id", authenticateJWT, updateTournament);
router.delete("/tournaments/:id", authenticateJWT, deleteTournament);
router.patch("/tournaments/:id/approve", authenticateJWT, authorize(["SUPER_ADMIN", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"]), approveTournament);
router.post("/tournaments/:id/reply", authenticateJWT, authorize(["SUPER_ADMIN", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "CLUB"]), sendTournamentReply);

router.get("/scoreboard/options", (req, res) => {
  return res.json(scoreboardOptions);
});

router.get("/districts", getDistricts);
router.get("/districts/:districtId/taluks", getTaluksByDistrict);
router.get("/taluks/:id", getTalukDetails);
router.get("/locations/pincode/:pincode", getLocationByPincode);
router.get("/clubs", getClubs);
router.get("/coaches", getPublicCoaches);
router.get("/members", getPublicMembers);
router.get("/referees/search", searchRefereeById);
router.get("/students/search", authenticateJWT, searchStudents);
router.post("/register/student", registerStudent);
router.post("/register/coach", registerCoach);
router.post("/register/club", registerClub);
router.post("/register/member", registerMember);
router.post("/resubmit-application", authenticateJWT, resubmitApplication);
router.post("/application/bpl/resubmit", authenticateJWT, resubmitBplProof);
router.post("/application/bpl/decline", authenticateJWT, continueWithoutBpl);

// Admin / Super-admin routes
const ALL_ADMIN_ROLES = ["SUPER_ADMIN", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO"];

router.get("/applications/pending", authenticateJWT, authorize(ALL_ADMIN_ROLES), getPendingApplications);   // ?type=STUDENT|COACH|MEMBER|CLUB
router.patch("/application/status", authenticateJWT, authorize(ALL_ADMIN_ROLES), updateApplicationStatus);
router.post("/admin/request-changes", authenticateJWT, authorize(ALL_ADMIN_ROLES), requestChanges);
router.get("/application/:tempId", authenticateJWT, authorize(ALL_ADMIN_ROLES), getApplicationDetails);
router.get("/admin/stats", authenticateJWT, authorizeAdmin, getDashboardStats);
router.get("/admin/location-analytics", authenticateJWT, authorizeAdmin, getLocationAnalytics);
router.post("/application/create-order", authenticateJWT, createPaymentOrder);
router.post("/application/verify-payment", authenticateJWT, verifyPayment);

// Super Admin Direct Creation
router.post("/admin/create-student", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), forceCreateStudent);
router.post("/admin/create-club", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), forceCreateClub);
router.post("/admin/create-member", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), forceCreateMember);
router.post("/admin/import-students", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), upload.single("file"), importStudentsExcel);
router.post("/admin/import-coaches", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), upload.single("file"), importCoachesExcel);

router.patch("/admin/districts/:id/code", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), updateDistrictCode);

router.get("/settings/global", getGlobalSettings);
router.patch("/settings/global", authenticateJWT, authorizeAdmin, updateGlobalSettings);

// User Management (Super Admin)
router.get("/users/all", authenticateJWT, authorizeAdmin, getAllUsers);
router.patch("/users/credentials", authenticateJWT, authorizeAdmin, updateUserCredentials);
router.patch("/users/profile", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), updateUserProfile);
router.get("/users/:type/:id", authenticateJWT, authorizeAdmin, getUserDetails);
router.delete("/users/:type/:id", authenticateJWT, authorize(["SUPER_ADMIN", "CEO"]), deleteUser);
router.patch("/users/:type/:id/block", authenticateJWT, authorize(["SUPER_ADMIN", "CEO", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"]), blockUser);
router.patch("/member/promote", authenticateJWT, authorizeAdmin, promoteMember);

// ── Coach/Referee Dashboard ────────────────────────────────────────────────────────
router.get("/coach/students", authenticateJWT, getCoachStudents);

export default router;
