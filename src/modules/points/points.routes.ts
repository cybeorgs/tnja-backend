import { Router } from "express";
import { authenticateJWT, authorize } from "../../middleware/authMiddleware.js";
import {
  getPointsConfig, updatePointsConfig, recalculateTournamentPoints, getRankingsHandler, getMyPoints,
  getMonthlyRecords, updateMonthlyRecords, getTournamentPoints, updateSportsmanship, upsertVolunteer, removeVolunteer,
} from "./points.controller.js";

const router = Router();
const POINTS_ADMINS = ["SUPER_ADMIN", "CEO"];

// Configuration (Admin → Configuration → Ranking Points)
router.get("/points/config", authenticateJWT, getPointsConfig);
router.put("/points/config", authenticateJWT, authorize(POINTS_ADMINS), updatePointsConfig);
router.post("/points/recalculate", authenticateJWT, authorize(POINTS_ADMINS), recalculateTournamentPoints);

// Rankings: best student, coach, club, district and zone
router.get("/rankings", authenticateJWT, getRankingsHandler);

// Player's own points
router.get("/players/me/points", authenticateJWT, getMyPoints);

// Coach's monthly attendance and discipline update
router.get("/coach/monthly-records", authenticateJWT, getMonthlyRecords);
router.put("/coach/monthly-records", authenticateJWT, updateMonthlyRecords);

// Tournament sportsmanship and volunteers (each handler checks the user manages the tournament)
router.get("/tournaments/:id/points", authenticateJWT, getTournamentPoints);
router.put("/tournaments/:id/sportsmanship/:playerId", authenticateJWT, updateSportsmanship);
router.put("/tournaments/:id/volunteers", authenticateJWT, upsertVolunteer);
router.delete("/tournaments/:id/volunteers/:playerId", authenticateJWT, removeVolunteer);

export default router;
