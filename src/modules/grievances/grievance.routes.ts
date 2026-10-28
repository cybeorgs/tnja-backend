import { Router } from "express";
import { 
  createGrievance, 
  getMyGrievances, 
  getAllGrievances,
  getGrievanceMessages,
  sendGrievanceMessage,
  resolveGrievance,
  confirmResolution,
  RESPONDER_ROLES
} from "./grievance.controller.js";

import type { Request, Response, NextFunction } from "express";
import { grievanceUpload } from "../../middleware/uploadMiddleware.js";
import { authenticateJWT, authorize } from "../../middleware/authMiddleware.js";

const router = Router();

// Turn multer errors (wrong type, too many or too large files) into a 400 the form can show.
const uploadGrievanceFiles = (req: Request, res: Response, next: NextFunction) => {
  grievanceUpload(req, res, (err: any) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "A file is too large."
      : err.code === "LIMIT_UNEXPECTED_FILE" ? `Too many files attached (${err.field}).`
      : err.message || "File upload failed";
    return res.status(400).json({ error: message });
  });
};

router.post("/grievances", authenticateJWT, uploadGrievanceFiles, createGrievance);
router.get("/grievances/user/:userId", authenticateJWT, getMyGrievances);
router.get("/grievances", authenticateJWT, authorize(RESPONDER_ROLES), getAllGrievances);
// Chat between the complainant and responders (each handler checks who may take part).
router.get("/grievances/:id/messages", authenticateJWT, getGrievanceMessages);
router.post("/grievances/:id/messages", authenticateJWT, sendGrievanceMessage);
// The responder marks it resolved; it closes only when the complainant confirms.
router.put("/grievances/:id/resolve", authenticateJWT, authorize(RESPONDER_ROLES), resolveGrievance);
router.put("/grievances/:id/confirm", authenticateJWT, confirmResolution);

export default router;
