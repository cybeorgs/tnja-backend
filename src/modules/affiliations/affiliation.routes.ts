import { Router } from "express";
import { authenticateJWT } from "../../middleware/authMiddleware.js";
import { getMine, getOptions, join, release, cancel, inbox, decideHandler } from "./affiliation.controller.js";

// Players apply to / leave coaches and clubs; coaches, clubs and Super Admin / CEO decide.
// Each handler checks who the caller acts as.
const router = Router();

router.get("/affiliations/me", authenticateJWT, getMine);
router.get("/affiliations/options", authenticateJWT, getOptions);
router.post("/affiliations/join", authenticateJWT, join);
router.post("/affiliations/release", authenticateJWT, release);
router.post("/affiliations/:id/cancel", authenticateJWT, cancel);
router.get("/affiliations/inbox", authenticateJWT, inbox);
router.post("/affiliations/:id/decide", authenticateJWT, decideHandler);

export default router;
