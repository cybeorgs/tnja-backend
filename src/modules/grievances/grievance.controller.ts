import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";

const ADMIN_ROLES = ["SUPER_ADMIN", "CEO", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"];

export const createGrievance = async (req: Request, res: Response) => {
  try {
    // The grievance is always filed as the logged-in account, never an id from the form.
    const { userId, role } = (req as any).user;
    const { userName, userEmail, subject, description } = req.body;

    if (!userId || !role || !subject || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Extract files from request
    const files = (req as any).files as Express.Multer.File[] || [];
    const images = files
      .filter(f => f.fieldname === "images")
      .map(f => `${req.protocol}://${req.get("host")}/uploads/${f.filename}`);
      
    const documents = files
      .filter(f => f.fieldname === "documents")
      .map(f => `${req.protocol}://${req.get("host")}/uploads/${f.filename}`);

    const grievance = await prisma.grievance.create({
      data: {
        userId,
        userName: userName || "Anonymous",
        userEmail: userEmail || "N/A",
        role,
        subject,
        description,
        status: "PENDING",
        images,
        documents
      }
    });

    try {
      const { sendNotificationToAdmins } = await import("../../socket/socket.js");
      sendNotificationToAdmins({
        type: "NEW_GRIEVANCE",
        grievanceId: grievance.id,
        userName: grievance.userName,
        subject: grievance.subject,
        message: `New grievance submitted by ${grievance.userName}: "${grievance.subject}"`,
      });
    } catch (wsErr) {
      console.error("WS notify admins error:", wsErr);
    }

    return res.status(201).json({
      message: "Grievance submitted successfully",
      grievance
    });
  } catch (error: any) {
    console.error("Create Grievance error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getMyGrievances = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const user = (req as any).user;
    if (user.userId !== userId && !ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({ error: "You can only view your own grievances." });
    }
    const grievances = await prisma.grievance.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json(grievances);
  } catch (error: any) {
    console.error("Get My Grievances error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getAllGrievances = async (req: Request, res: Response) => {
  try {
    const grievances = await prisma.grievance.findMany({
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json(grievances);
  } catch (error: any) {
    console.error("Get All Grievances error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const replyToGrievance = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { reply } = req.body;

    const grievance = await prisma.grievance.update({
      where: { id },
      data: {
        reply,
        status: "REPLAY" 
      }
    });

    try {
      const { sendNotificationToUser } = await import("../../socket/socket.js");
      sendNotificationToUser(grievance.userId, {
        type: "GRIEVANCE_REPLY",
        grievanceId: grievance.id,
        subject: grievance.subject,
        reply: grievance.reply,
        message: `Admin has replied to your grievance regarding: "${grievance.subject}"`,
      });
    } catch (wsErr) {
      console.error("WS notification error:", wsErr);
    }

    return res.status(200).json({
      message: "Reply sent successfully",
      grievance
    });
  } catch (error: any) {
    console.error("Reply to Grievance error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const closeGrievance = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { remark } = req.body;

    const grievance = await prisma.grievance.update({
      where: { id },
      data: {
        remark,
        status: "CLOSED" 
      }
    });

    try {
      const { sendNotificationToUser } = await import("../../socket/socket.js");
      sendNotificationToUser(grievance.userId, {
        type: "GRIEVANCE_CLOSED",
        grievanceId: grievance.id,
        subject: grievance.subject,
        remark: grievance.remark,
        message: `Admin has closed your grievance regarding: "${grievance.subject}"`,
      });
    } catch (wsErr) {
      console.error("WS notification error:", wsErr);
    }

    return res.status(200).json({
      message: "Grievance closed successfully",
      grievance
    });
  } catch (error: any) {
    console.error("Close Grievance error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
