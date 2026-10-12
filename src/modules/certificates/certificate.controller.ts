import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";

const TOURNAMENT_MANAGER_ROLES = [
  "CLUB", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY",
  "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN",
];

export const downloadCertificate = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const tournamentId = req.params.id as string;
  const regId = req.query.regId as string | undefined;

  const isParticipant = role === "PLAYER" || role === "STUDENT";
  const isManager = TOURNAMENT_MANAGER_ROLES.includes(role);

  if (!isParticipant && !isManager) {
    return res.status(403).json({ error: "Only participants or tournament organisers can download certificates." });
  }

  if (isManager && !regId) {
    return res.status(400).json({ error: "regId is required to download a participant's certificate." });
  }

  try {
    let whereClause: any = { tournamentId };

    if (isParticipant) {
      // Players can only ever pull their own registration's certificate.
      whereClause.playerId = userId;
      if (regId) whereClause.id = regId;
    } else {
      const managedTournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
      if (!managedTournament) return res.status(404).json({ error: "Tournament not found." });
      if (role !== "SUPER_ADMIN" && role !== "CEO" && managedTournament.clubId !== userId && managedTournament.officialId !== userId) {
        return res.status(403).json({ error: "This tournament does not belong to you." });
      }
      whereClause.id = regId;
    }

    const registration = await prisma.tournamentRegistration.findFirst({
      where: whereClause,
      include: {
        player: { select: { fullName: true, age: true, gender: true } },
        tournament: { select: { title: true, date: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!registration) {
      return res.status(404).json({ error: "Registration not found." });
    }

    // Check if the player's category draw is concluded
    const categoryDraw = await prisma.tournamentDraw.findFirst({
      where: {
        tournamentId,
        ageGroup: registration.ageGroup,
        gender: registration.gender === "MALE" ? "MALE" : "FEMALE",
        weightCategory: registration.weightCategory,
      }
    });

    const isCategoryConcluded = categoryDraw ? categoryDraw.isConcluded : false;

    if (registration.tournament.status !== "CLOSED" && !isCategoryConcluded) {
      return res.status(400).json({ error: "Certificate is only available after the category or tournament is concluded." });
    }

    const { player, tournament, placement } = registration;

    // Fetch all draws for this tournament to find the exact category the player competed in
    const draws = await prisma.tournamentDraw.findMany({
      where: { tournamentId },
      select: { ageGroup: true, gender: true, weightCategory: true, rounds: true }
    });

    let exactCategory = "";
    for (const draw of draws) {
      const rounds = draw.rounds as any[];
      if (!Array.isArray(rounds)) continue;
      
      let playerFound = false;
      for (const round of rounds) {
        if (!Array.isArray(round)) continue;
        for (const match of round) {
          if (match.slotA?.playerId === registration.playerId || match.slotB?.playerId === registration.playerId) {
            playerFound = true;
            break;
          }
        }
        if (playerFound) break;
      }
      
      if (playerFound) {
        const genText = draw.gender === "FEMALE" ? "GIRLS" : "BOYS";
        const weightText = draw.weightCategory.toLowerCase().includes("kg") ? draw.weightCategory : `${draw.weightCategory}KG`;
        exactCategory = `${draw.ageGroup.toUpperCase()} ${genText} - ${weightText.toUpperCase()}`;
        break;
      }
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 landscape size

    // Set up fonts
    const serifFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const serifBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const sansFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const sansBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();

    // Colors
    const black = rgb(0.1, 0.1, 0.1);
    const gold = rgb(0.85, 0.73, 0.35);
    const darkGray = rgb(0.4, 0.4, 0.4);
    const lightGray = rgb(0.97, 0.97, 0.97);

    // Fill background with light gray texture color
    page.drawRectangle({
      x: 0, y: 0,
      width, height,
      color: lightGray,
    });

    // ─── BACKGROUND SHAPES (Black & Gold) ───────────────────────────────────
    
    // Top Left Corner
    // Main black triangle
    page.drawSvgPath(`M 0,${height} L 240,${height} L 0,${height - 240} Z`, { color: black });
    // Thin gold stripe
    page.drawSvgPath(`M 0,${height - 250} L 250,${height} L 270,${height} L 0,${height - 270} Z`, { color: gold });
    // Thin black stripe
    page.drawSvgPath(`M 0,${height - 280} L 280,${height} L 295,${height} L 0,${height - 295} Z`, { color: black });

    // Main Black Title Bar (Slanted edges)
    // Left edge slants from (140, height-110) to (210, height-40)
    // Right edge slants from (730, height-110) to (800, height-40)
    page.drawSvgPath(`M 140,${height - 110} L 730,${height - 110} L 800,${height - 40} L 210,${height - 40} Z`, { color: black });
    
    // Thin black line below the title bar
    page.drawSvgPath(`M 120,${height - 120} L 600,${height - 120} L 605,${height - 125} L 115,${height - 125} Z`, { color: black });

    // Top Right Corner
    // Gold trapezoid area
    page.drawSvgPath(`M 740,${height - 110} L 842,${height - 110} L 842,${height - 40} L 810,${height - 40} Z`, { color: gold });
    // Black thin stripe
    page.drawSvgPath(`M 810,${height - 110} L 842,${height - 110} L 842,${height - 78} Z`, { color: black });
    page.drawSvgPath(`M 825,${height - 40} L 842,${height - 40} L 842,${height - 57} Z`, { color: black });

    // Bottom Black Bar
    page.drawRectangle({
      x: 0, y: 0,
      width: width, height: 40,
      color: black,
    });

    // Bottom Gold Strip
    page.drawRectangle({
      x: 0, y: 40,
      width: width, height: 5,
      color: gold,
    });

    // ─── TEXT CONTENT ───────────────────────────────────────────────────────

    let certificateTitle = "CERTIFICATE OF PARTICIPATION";
    let placementText = "PARTICIPANT";
    
    if (placement === "FIRST") {
      certificateTitle = "CERTIFICATE OF ACHIEVEMENT";
      placementText = "1ST PLACE CHAMPION";
    } else if (placement === "SECOND") {
      certificateTitle = "CERTIFICATE OF ACHIEVEMENT";
      placementText = "2ND PLACE WINNER";
    } else if (placement === "THIRD") {
      certificateTitle = "CERTIFICATE OF ACHIEVEMENT";
      placementText = "3RD PLACE WINNER";
    }

    // Top Header Title (Inside Black Bar)
    const titleWidth = serifFont.widthOfTextAtSize(certificateTitle, 36);
    page.drawText(certificateTitle, {
      x: width / 2 - titleWidth / 2,
      y: height - 90,
      size: 36,
      font: serifFont,
      color: gold,
    });

    // Logo & Watermark
    let currentY = height - 160;
    try {
      const logoPath = path.join(process.cwd(), "assets", "Logo.png");
      if (fs.existsSync(logoPath)) {
        const logoImageBytes = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedPng(logoImageBytes);
        
        // Draw Faint Watermark
        const wmDims = logoImage.scale(1.5);
        // We can't set opacity directly in drawImage easily in all pdf-lib versions without graphics state,
        // so we'll just skip watermark if it's too dark, or draw the logo as normal.
        
        // Draw Main Logo
        const logoDims = logoImage.scale(0.3);
        currentY -= logoDims.height;
        page.drawImage(logoImage, {
          x: width / 2 - logoDims.width / 2,
          y: currentY,
          width: logoDims.width,
          height: logoDims.height,
        });
        currentY -= 40; // Space below logo
      }
    } catch (err) {
      console.error("Error loading logo for certificate:", err);
    }

    // "THIS CERTIFIES THAT"
    const certThat = "THIS CERTIFIES THAT";
    const certThatWidth = serifFont.widthOfTextAtSize(certThat, 14);
    page.drawText(certThat, {
      x: width / 2 - certThatWidth / 2,
      y: currentY,
      size: 14,
      font: serifFont,
      color: darkGray,
    });
    currentY -= 60;

    // Player Name
    const nameWidth = serifFont.widthOfTextAtSize(player.fullName.toUpperCase(), 48);
    page.drawText(player.fullName.toUpperCase(), {
      x: width / 2 - nameWidth / 2,
      y: currentY,
      size: 48,
      font: serifFont,
      color: black,
    });
    currentY -= 40;

    // "HAS MET OR SURPASSED..."
    const reqText1 = "HAS MET OR SURPASSED ALL OF THE NECESSARY REQUIREMENTS";
    const reqText2 = "TO BE PROMOTED TO";
    const reqWidth1 = serifBoldFont.widthOfTextAtSize(reqText1, 11);
    const reqWidth2 = serifBoldFont.widthOfTextAtSize(reqText2, 11);
    
    page.drawText(reqText1, {
      x: width / 2 - reqWidth1 / 2,
      y: currentY,
      size: 11,
      font: serifBoldFont,
      color: darkGray,
    });
    currentY -= 16;
    page.drawText(reqText2, {
      x: width / 2 - reqWidth2 / 2,
      y: currentY,
      size: 11,
      font: serifBoldFont,
      color: darkGray,
    });
    currentY -= 45;

    // Placement / Rank
    const placeWidth = serifFont.widthOfTextAtSize(placementText, 32);
    page.drawText(placementText, {
      x: width / 2 - placeWidth / 2,
      y: currentY,
      size: 32,
      font: serifFont,
      color: black,
    });
    currentY -= 30;

    // Tournament Name (Small text below placement)
    const tNameText = tournament.title;
    const tNameWidth = serifFont.widthOfTextAtSize(tNameText, 12);
    page.drawText(tNameText, {
      x: width / 2 - tNameWidth / 2,
      y: currentY,
      size: 12,
      font: serifFont,
      color: rgb(0.6, 0.6, 0.6),
    });

    // ─── FOOTER (Columns) ───────────────────────────────────────────────────

    const footerY = 90;

    // Column 1: Date
    const dateLabel = "DATE";
    const dateVal = new Date(tournament.date).toLocaleDateString("en-US");
    const dateLabelWidth = serifFont.widthOfTextAtSize(dateLabel, 12);
    const dateValWidth = serifFont.widthOfTextAtSize(dateVal, 14);
    
    page.drawText(dateLabel, { x: 180 - dateLabelWidth/2, y: footerY + 20, size: 12, font: serifFont, color: black });
    page.drawText(dateVal, { x: 180 - dateValWidth/2, y: footerY, size: 14, font: serifFont, color: darkGray });

    // Column 2: Category
    const rankLabel = "CATEGORY";
    
    let rankVal = exactCategory;
    if (!rankVal) {
      // Fallback if player wasn't found in any draw
      let ageGroup = "SENIOR";
      const age = player.age;
      if (age >= 10 && age <= 14) ageGroup = "SUB-JUNIOR";
      else if (age >= 15 && age <= 17) ageGroup = "CADET";
      else if (age >= 18 && age <= 20) ageGroup = "JUNIOR";
      else if (age >= 21 && age <= 34) ageGroup = "SENIOR";
      else if (age >= 35) ageGroup = "VETERAN";

      rankVal = `${ageGroup} ${player.gender === "FEMALE" ? "GIRLS" : "BOYS"} - ${registration.weight || ""}KG`;
    }
    const rankLabelWidth = serifFont.widthOfTextAtSize(rankLabel, 12);
    const rankValWidth = serifFont.widthOfTextAtSize(rankVal, 14);

    page.drawText(rankLabel, { x: width / 2 - rankLabelWidth/2, y: footerY + 20, size: 12, font: serifFont, color: black });
    page.drawText(rankVal, { x: width / 2 - rankValWidth/2, y: footerY, size: 14, font: serifFont, color: darkGray });

    // Column 3: Signature
    const sigLabel = "CHIEF INSTRUCTOR";
    const sigLabelWidth = serifFont.widthOfTextAtSize(sigLabel, 12);
    
    page.drawLine({
      start: { x: width - 250, y: footerY + 15 },
      end: { x: width - 90, y: footerY + 15 },
      thickness: 1,
      color: black,
    });
    // Draw a script-like font if we had one, but we'll just write Tamil Nadu Judo Assoc
    page.drawText("TNJA Official", { x: width - 210, y: footerY + 25, size: 24, font: serifFont, color: black });
    page.drawText(sigLabel, { x: width - 170 - sigLabelWidth/2, y: footerY - 5, size: 12, font: serifFont, color: black });

    // Bottom Bar Text
    const footerDisclaimer = "Tamil Nadu Judo Association Teaches Traditional Martial Arts Training As Well As Life Long Leadership And Personal Development Training";
    const fDiscWidth = sansFont.widthOfTextAtSize(footerDisclaimer, 9);
    page.drawText(footerDisclaimer, {
      x: width / 2 - fDiscWidth / 2,
      y: 16,
      size: 9,
      font: sansFont,
      color: gold,
    });

    const pdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${player.fullName.replace(/\s+/g, "_")}_certificate.pdf"`
    );
    return res.end(Buffer.from(pdfBytes));

  } catch (error) {
    console.error("Error generating certificate:", error);
    return res.status(500).json({ error: "Failed to generate certificate." });
  }
};
