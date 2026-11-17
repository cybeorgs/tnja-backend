import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";
import { BACKGROUND_PATH, renderCertificate, defaultConfig, sanitizeConfig, formatWeightCategory, type CertificateConfig } from "./certificate.template.js";
import { sendCertificateEmail } from "../../config/mailer.js";

const TOURNAMENT_MANAGER_ROLES = [
  "CLUB", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY",
  "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN",
];

const baseUrl = (req: Request) => `${req.protocol}://${req.get("host")}`;

/** Saved certificate settings, or defaults derived from the tournament when none are saved. */
const certificateConfigFor = (
  tournament: { title: string; location: string; date: Date; dateTo: Date | null; certificateConfig: unknown },
  req: Request,
): CertificateConfig =>
  tournament.certificateConfig ? sanitizeConfig(tournament.certificateConfig) : defaultConfig(tournament, baseUrl(req));

/** Loads a tournament the signed-in organiser may manage; sends the error response and returns null otherwise. */
async function loadManagedTournament(req: Request, res: Response) {
  const { userId, role } = (req as any).user;
  if (!TOURNAMENT_MANAGER_ROLES.includes(role)) {
    res.status(403).json({ error: "Only tournament organisers can manage certificates." });
    return null;
  }
  const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id as string } });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return null;
  }
  if (role !== "SUPER_ADMIN" && role !== "CEO" && tournament.clubId !== userId && tournament.officialId !== userId && tournament.officialCoachId !== userId) {
    res.status(403).json({ error: "This tournament does not belong to you." });
    return null;
  }
  return tournament;
}

/** GET /tournaments/:id/certificate-config */
export const getCertificateConfig = async (req: Request, res: Response) => {
  try {
    const tournament = await loadManagedTournament(req, res);
    if (!tournament) return;
    return res.json({
      config: certificateConfigFor(tournament, req),
      isSaved: !!tournament.certificateConfig,
      defaults: defaultConfig(tournament, baseUrl(req)),
    });
  } catch (error) {
    console.error("Error loading certificate settings:", error);
    return res.status(500).json({ error: "Failed to load certificate settings." });
  }
};

/** PUT /tournaments/:id/certificate-config  body: { config } */
export const saveCertificateConfig = async (req: Request, res: Response) => {
  try {
    const tournament = await loadManagedTournament(req, res);
    if (!tournament) return;
    const config = sanitizeConfig(req.body?.config);
    await prisma.tournament.update({ where: { id: tournament.id }, data: { certificateConfig: config as any } });
    return res.json({ message: "Certificate settings saved.", config });
  } catch (error) {
    console.error("Error saving certificate settings:", error);
    return res.status(500).json({ error: "Failed to save certificate settings." });
  }
};

/** POST /tournaments/:id/certificate-preview  body: { config?, placement? } → sample PDF (unsaved settings allowed) */
export const previewCertificate = async (req: Request, res: Response) => {
  try {
    const tournament = await loadManagedTournament(req, res);
    if (!tournament) return;
    const config = req.body?.config ? sanitizeConfig(req.body.config) : certificateConfigFor(tournament, req);
    const placement = ["FIRST", "SECOND", "THIRD"].includes(req.body?.placement) ? req.body.placement : "PARTICIPATION";
    const pdfBytes = await renderCertificate(config, {
      name: "Sample Player Name",
      dob: new Date("2012-06-15"),
      fatherName: "Sample Father Name",
      district: "Chennai",
      weightCategory: formatWeightCategory("-45", "MALE"),
      ageGroup: "Sub-Junior",
      placement,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="certificate-preview.pdf"`);
    return res.end(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Error generating certificate preview:", error);
    return res.status(500).json({ error: "Failed to generate certificate preview." });
  }
};

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
      if (role !== "SUPER_ADMIN" && role !== "CEO" && managedTournament.clubId !== userId && managedTournament.officialId !== userId && managedTournament.officialCoachId !== userId) {
        return res.status(403).json({ error: "This tournament does not belong to you." });
      }
      whereClause.id = regId;
    }

    const registration = await prisma.tournamentRegistration.findFirst({
      where: whereClause,
      include: {
        player: { select: { fullName: true, age: true, gender: true, dob: true, district: { select: { name: true } } } },
        tournament: { select: { title: true, date: true, dateTo: true, location: true, status: true, certificateConfig: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!registration) {
      return res.status(404).json({ error: "Registration not found." });
    }

    // Check if the player's category draw is concluded. A category can have several
    // draw rows (one per exactAge created at registration, plus the one saved from the
    // admin bracket), so look for any concluded row rather than an arbitrary first one.
    const concludedDraw = await prisma.tournamentDraw.findFirst({
      where: {
        tournamentId,
        ageGroup: registration.ageGroup,
        gender: registration.gender === "MALE" ? "MALE" : "FEMALE",
        weightCategory: registration.weightCategory,
        isConcluded: true,
      }
    });

    const isCategoryConcluded = !!concludedDraw;

    // Organisers can generate a certificate at any time (using the current placement);
    // participants only once their category or the tournament is concluded.
    if (isParticipant && registration.tournament.status !== "CLOSED" && !isCategoryConcluded) {
      return res.status(400).json({ error: "Certificate is only available after the category or tournament is concluded." });
    }

    const { player, tournament } = registration;
    // Organisers previewing before conclusion can pass the placement picked on screen.
    const requestedPlacement = req.query.placement as string | undefined;
    const placement = isManager && requestedPlacement && ["FIRST", "SECOND", "THIRD", "PARTICIPATION"].includes(requestedPlacement)
      ? requestedPlacement
      : registration.placement;

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

    // TNJA championship artwork (merit for 1st–3rd, participation otherwise).
    if (fs.existsSync(BACKGROUND_PATH)) {
      const pdfBytes = await renderCertificate(certificateConfigFor(tournament, req), {
        name: player.fullName,
        dob: player.dob,
        // Players have no father's name on record; the line is left for hand-filling.
        fatherName: null,
        district: registration.representingDistrict || player.district?.name || null,
        weightCategory: formatWeightCategory(registration.weightCategory, registration.gender),
        ageGroup: registration.ageGroup,
        placement,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${player.fullName.replace(/\s+/g, "_")}_certificate.pdf"`);
      return res.end(Buffer.from(pdfBytes));
    }

    // Fallback: generic layout when the artwork file is missing.
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

// ── Emailing certificates ─────────────────────────────────────────────────────

const PLACEMENT_LABEL: Record<string, string> = {
  FIRST: "Merit Certificate — First Place (Gold)",
  SECOND: "Merit Certificate — Second Place (Silver)",
  THIRD: "Merit Certificate — Third Place (Bronze)",
};
const categoryLabelOf = (r: { ageGroup: string; gender: string; weightCategory: string }) =>
  `${r.ageGroup} · ${r.gender === "FEMALE" ? "Girls" : "Boys"} · ${r.weightCategory}`;
const drawKey = (ageGroup: string, gender: string, weightCategory: string) => `${ageGroup}|${gender}|${weightCategory}`;

/** One sending job per tournament at a time; progress is read by the recipients endpoint. */
type EmailJob = { total: number; done: number; sent: number; failed: { name: string; error: string }[]; startedAt: number; finishedAt?: number };
const emailJobs = new Map<string, EmailJob>();

/** Approved registrations of a tournament with what is needed to build and send their certificate. */
async function loadRecipients(tournamentId: string, tournamentClosed: boolean) {
  const [regs, concluded] = await Promise.all([
    prisma.tournamentRegistration.findMany({
      where: { tournamentId, status: "APPROVED" },
      include: { player: { select: { fullName: true, email: true, dob: true, district: { select: { name: true } } } } },
      orderBy: [{ ageGroup: "asc" }, { weightCategory: "asc" }, { createdAt: "asc" }],
    }),
    prisma.tournamentDraw.findMany({ where: { tournamentId, isConcluded: true }, select: { ageGroup: true, gender: true, weightCategory: true } }),
  ]);
  const concludedKeys = new Set(concluded.map((d) => drawKey(d.ageGroup, d.gender, d.weightCategory)));
  return regs.map((r) => {
    const isConcluded = tournamentClosed || concludedKeys.has(drawKey(r.ageGroup, r.gender, r.weightCategory));
    const email = r.player.email?.trim() || "";
    const reason = !isConcluded ? "Category not concluded yet" : !email ? "No email on record" : null;
    return { reg: r, email, ready: !reason, reason };
  });
}

/** GET /tournaments/:id/certificate-recipients → who can be emailed, their status, and any running job. */
export const getCertificateRecipients = async (req: Request, res: Response) => {
  try {
    const tournament = await loadManagedTournament(req, res);
    if (!tournament) return;
    const rows = await loadRecipients(tournament.id, tournament.status === "CLOSED");
    return res.json({
      recipients: rows.map(({ reg, email, ready, reason }) => ({
        regId: reg.id,
        name: reg.player.fullName,
        email,
        category: categoryLabelOf(reg),
        placement: reg.placement ?? "PARTICIPATION",
        ready,
        reason,
        emailedAt: reg.certificateEmailedAt,
      })),
      job: emailJobs.get(tournament.id) ?? null,
    });
  } catch (error) {
    console.error("Error listing certificate recipients:", error);
    return res.status(500).json({ error: "Failed to load players." });
  }
};

/**
 * POST /tournaments/:id/certificate-email  body: { regIds: string[] }
 * Queues the certificates and replies at once; mail goes out in the background one by one (so the
 * SMTP provider is not flooded) and progress is reported by getCertificateRecipients.
 */
export const emailCertificates = async (req: Request, res: Response) => {
  try {
    const tournament = await loadManagedTournament(req, res);
    if (!tournament) return;

    const running = emailJobs.get(tournament.id);
    if (running && !running.finishedAt) {
      return res.status(409).json({ error: "Certificates are already being sent for this tournament. Please wait for it to finish." });
    }

    const regIds: string[] = Array.isArray(req.body?.regIds) ? req.body.regIds.filter((x: unknown) => typeof x === "string").slice(0, 1000) : [];
    if (!regIds.length) return res.status(400).json({ error: "Choose at least one player." });

    const wanted = new Set(regIds);
    const rows = (await loadRecipients(tournament.id, tournament.status === "CLOSED")).filter((r) => wanted.has(r.reg.id));
    const toSend = rows.filter((r) => r.ready);
    const skipped = rows.filter((r) => !r.ready).map((r) => ({ name: r.reg.player.fullName, reason: r.reason }));
    if (!toSend.length) return res.status(400).json({ error: "None of the chosen players can be sent a certificate yet.", skipped });

    const job: EmailJob = { total: toSend.length, done: 0, sent: 0, failed: [], startedAt: Date.now() };
    emailJobs.set(tournament.id, job);
    const config = certificateConfigFor(tournament, req);

    // Background send: the response does not wait for SMTP.
    void (async () => {
      for (const { reg, email } of toSend) {
        try {
          const placement = reg.placement ?? "PARTICIPATION";
          const pdf = await renderCertificate(config, {
            name: reg.player.fullName,
            dob: reg.player.dob,
            fatherName: null,
            district: reg.representingDistrict || reg.player.district?.name || null,
            weightCategory: formatWeightCategory(reg.weightCategory, reg.gender),
            ageGroup: reg.ageGroup,
            placement,
          });
          await sendCertificateEmail({
            toEmail: email,
            toName: reg.player.fullName,
            tournamentTitle: tournament.title,
            categoryLabel: categoryLabelOf(reg),
            certificateLabel: PLACEMENT_LABEL[placement] ?? "Participation Certificate",
            pdf: Buffer.from(pdf),
            filename: `${reg.player.fullName.replace(/[^\w.-]+/g, "_")}_certificate.pdf`,
          });
          await prisma.tournamentRegistration.update({ where: { id: reg.id }, data: { certificateEmailedAt: new Date() } });
          job.sent++;
        } catch (err) {
          console.error(`[Certificates] Email to ${email} failed:`, err);
          job.failed.push({ name: reg.player.fullName, error: err instanceof Error ? err.message : "Send failed" });
        } finally {
          job.done++;
        }
      }
      job.finishedAt = Date.now();
      console.log(`[Certificates] ${tournament.title}: emailed ${job.sent}/${job.total}, ${job.failed.length} failed`);
    })();

    return res.status(202).json({ queued: toSend.length, skipped });
  } catch (error) {
    console.error("Error queueing certificate emails:", error);
    return res.status(500).json({ error: "Failed to send certificates." });
  }
};
