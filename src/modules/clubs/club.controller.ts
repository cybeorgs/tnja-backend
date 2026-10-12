import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";

export const getClubs = async (req: Request, res: Response) => {
  console.log("GET /api/clubs hit");
  try {
    const { districtId, talukId } = req.query;
    const where: any = { status: "APPROVED" };

    if (districtId) where.districtId = String(districtId);
    if (talukId) where.talukId = String(talukId);

    const clubs = await prisma.club.findMany({
      where,
      include: {
        district: true,
        taluk: true,
      },
      orderBy: {
        name: 'asc'
      }
    });
    return res.json(clubs);
  } catch (error) {
    console.error("Error fetching clubs:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
