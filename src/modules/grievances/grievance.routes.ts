import { Router } from "express";
import { 
  createGrievance, 
  getMyGrievances, 
  getAllGrievances, 
  replyToGrievance,
  closeGrievance
} from "./grievance.controller.js";

import { upload } from "../../middleware/uploadMiddleware.js";
import { authenticateJWT, authorizeAdmin } from "../../middleware/authMiddleware.js";

const router = Router();

router.post("/grievances", authenticateJWT, upload.any(), createGrievance);
router.get("/grievances/user/:userId", authenticateJWT, getMyGrievances);
router.get("/grievances", authenticateJWT, authorizeAdmin, getAllGrievances);
router.put("/grievances/:id/reply", authenticateJWT, authorizeAdmin, replyToGrievance);
router.put("/grievances/:id/close", authenticateJWT, authorizeAdmin, closeGrievance);

export default router;
