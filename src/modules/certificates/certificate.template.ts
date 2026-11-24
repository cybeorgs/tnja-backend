import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fs from "fs";
import path from "path";

/**
 * TNJA tournament certificate. The background (assets/certificates/certificate-background.jpeg)
 * holds only what never changes: the gold border and the association header (logos, name,
 * affiliations). Everything else — championship name, host, co-sponsor, venue, dates, side
 * logos, signatories and their signatures — comes from the tournament's certificate settings
 * in the admin panel. 1st–3rd place get a MERIT certificate, everyone else PARTICIPATION.
 *
 * Coordinates are in background-image pixels (1200 × 1600, origin top-left); `pt()` maps them
 * to PDF points, so positions can be re-measured straight off the image.
 */

export const CERT_ASSETS_DIR = path.join(process.cwd(), "assets", "certificates");
export const BACKGROUND_PATH = path.join(CERT_ASSETS_DIR, "certificate-background.jpeg");
/** URL prefix the default assets are served under (see index.ts). */
export const DEFAULTS_URL_PATH = "/uploads/certificate-defaults";
const UPLOADS_DIR = path.resolve("./uploads");

const IMG_W = 1200;
const IMG_H = 1600;
const SCALE = 0.5; // 1 px = 0.5 pt → 600 × 800 pt page, same aspect as the artwork
const PAGE_W = IMG_W * SCALE;
const PAGE_H = IMG_H * SCALE;

const RED = rgb(0.86, 0.13, 0.13);
const MAROON = rgb(100 / 255, 26 / 255, 27 / 255);
const LABEL = rgb(0.36, 0.11, 0.13);
const NAVY = rgb(0.13, 0.12, 0.42);
const INK = rgb(0.08, 0.12, 0.42); // filled-in values
const SIGN_TEXT = rgb(0.45, 0.09, 0.11);
const SIGN_SUB = rgb(0.35, 0.07, 0.09);

export const MAX_SIGNATORIES = 6;

export interface Signatory {
  name: string;
  /** Degrees printed small after the name, e.g. "M.Com.," */
  qualification?: string;
  /** e.g. "President, TNJA Reg.No. 329/2017" */
  designation?: string;
  /** Optional second line, e.g. "Tiruppur District Judo Association" */
  organisation?: string;
  /** URL of an uploaded PNG/JPG signature */
  signature?: string;
  /** Signature size set in the admin panel, as a percentage of the default (50–200). */
  signatureScale?: number;
}

export const SIGNATURE_SCALE_MIN = 50;
export const SIGNATURE_SCALE_MAX = 200;

const clampScale = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(SIGNATURE_SCALE_MAX, Math.max(SIGNATURE_SCALE_MIN, n)) : 100;
};

export interface CertificateConfig {
  referenceNo: string;
  championshipTitle: string;
  hostedBy: string;
  coSponsoredBy: string;
  venueName: string;
  venueAddress: string;
  dateText: string;
  leftLogo: string;
  rightLogo: string;
  signatories: Signatory[];
}

export interface CertificatePlayer {
  name: string;
  dob?: Date | null;
  fatherName?: string | null;
  district?: string | null;
  weightCategory?: string | null;
  ageGroup?: string | null;
  placement?: string | null;
  /** Merit number typed by the organiser, or the automatic participation number ("SUB-JUNIOR 001"). */
  certificateNo?: string | null;
}

const POSITION_TEXT: Record<string, string> = {
  FIRST: "First Place  -  Gold Medal",
  SECOND: "Second Place  -  Silver Medal",
  THIRD: "Third Place  -  Bronze Medal",
};

const AGE_OPTIONS = ["Mini Sub-Junior", "Sub-Junior", "Cadet", "Junior", "Senior"];

// ── Config helpers ───────────────────────────────────────────────────────────

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Keeps only known fields with sane lengths; anything else in the body is dropped. */
export function sanitizeConfig(raw: any): CertificateConfig {
  const signatories: Signatory[] = Array.isArray(raw?.signatories)
    ? raw.signatories.slice(0, MAX_SIGNATORIES).map((s: any) => ({
        name: str(s?.name, 80),
        qualification: str(s?.qualification, 60),
        designation: str(s?.designation, 120),
        organisation: str(s?.organisation, 120),
        signature: str(s?.signature, 500),
        signatureScale: clampScale(s?.signatureScale),
      })).filter((s: Signatory) => s.name)
    : [];
  return {
    referenceNo: str(raw?.referenceNo, 80),
    championshipTitle: str(raw?.championshipTitle, 120),
    hostedBy: str(raw?.hostedBy, 160),
    coSponsoredBy: str(raw?.coSponsoredBy, 160),
    venueName: str(raw?.venueName, 120),
    venueAddress: str(raw?.venueAddress, 160),
    dateText: str(raw?.dateText, 120),
    leftLogo: str(raw?.leftLogo, 500),
    rightLogo: str(raw?.rightLogo, 500),
    signatories,
  };
}

/** "20-11-2026 Friday & 21-11-2026 Saturday" (India time). */
export function formatEventDates(from: Date, to?: Date | null) {
  const fmt = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", weekday: "long",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}-${get("month")}-${get("year")} ${get("weekday")}`;
  };
  const a = fmt(new Date(from));
  if (!to) return a;
  const b = fmt(new Date(to));
  return a === b ? a : `${a}  &  ${b}`;
}

/** Settings used when an admin has not filled the certificate form yet. */
export function defaultConfig(
  tournament: { title: string; location: string; date: Date; dateTo?: Date | null },
  baseUrl: string,
): CertificateConfig {
  const asset = (f: string) => `${baseUrl}${DEFAULTS_URL_PATH}/${f}`;
  // Championship name, venue and dates come from the tournament itself; everything else is
  // pre-filled from the TNJA certificate design and edited per tournament in the admin panel.
  return {
    referenceNo: "TNJA329/2017/SUBJUN@2026 P :",
    championshipTitle: tournament.title.toUpperCase(),
    hostedBy: "Tiruppur District Judo Association, Reg.No. 206/2025",
    coSponsoredBy: "Veer Viveka Namo Academy",
    venueName: tournament.location,
    venueAddress: "Nathakadiyur, Kangeyam, Tiruppur.",
    dateText: formatEventDates(tournament.date, tournament.dateTo),
    leftLogo: asset("logo-left.png"),
    rightLogo: asset("logo-right.png"),
    signatories: [
      { name: "S.PARTH JINDAL", qualification: "MBA", designation: "President, TNJA Reg.No. 329/2017", organisation: "", signature: "" },
      { name: "R. VIJAYA MOHANA MURALI", qualification: "M.Com.,", designation: "Chief Executive Officer, TNJA Reg.No. 329/2017", organisation: "", signature: asset("signature-ceo.png") },
      { name: "NA.MURALI", qualification: "M.Sc.,(Ex.Phy)", designation: "General Secretary, TNJA Reg.No.329/2017", organisation: "", signature: asset("signature-general-secretary.png") },
      // Host district officers and the tournament director, as on the TNJA certificate design.
      // Organisers change these per tournament in the admin panel's Certificates tab.
      { name: "S. SUDHARSAN", qualification: "B.TECH., M.E", designation: "PRESIDENT, Reg.No. 206/2025", organisation: "Tiruppur District Judo Association", signature: "" },
      { name: "R. MOHITH SURIYA", qualification: "B.A., LL.B.", designation: "SECRETARY", organisation: "Tiruppur District Judo Association", signature: "" },
      { name: "K.MURALI", qualification: "B. Sc., NSNIS(Judo)", designation: "Tournament Director", organisation: "", signature: "" },
    ],
  };
}

/**
 * Maps an image URL saved in the settings to a file on this server. Only our own upload
 * folder and the bundled defaults are read — never an arbitrary URL or path.
 */
function resolveImageFile(url?: string): string | null {
  if (!url) return null;
  let pathname = url;
  try { pathname = new URL(url, "http://local").pathname; } catch { return null; }
  const name = path.basename(decodeURIComponent(pathname));
  if (!name || name.startsWith(".")) return null;
  const file = pathname.startsWith(`${DEFAULTS_URL_PATH}/`)
    ? path.join(CERT_ASSETS_DIR, name)
    : pathname.startsWith("/uploads/") ? path.join(UPLOADS_DIR, name) : null;
  return file && fs.existsSync(file) ? file : null;
}

async function embedImage(pdfDoc: PDFDocument, url?: string): Promise<PDFImage | null> {
  const file = resolveImageFile(url);
  if (!file) return null;
  try {
    const bytes = fs.readFileSync(file);
    // Detect by content, not extension.
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdfDoc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdfDoc.embedJpg(bytes);
  } catch (err) {
    console.error("Certificate image could not be embedded:", file, err);
  }
  return null; // WEBP/GIF etc. are not supported by PDF; skipped
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

/**
 * Page geometry: s = points per artwork pixel, h = page height in points. Each design is measured in
 * its own artwork pixels (participation: 1200 × 1600 image; merit: the PDF rendered 1414 px wide).
 */
type Geo = { s: number; h: number };
const PART: Geo = { s: SCALE, h: PAGE_H };

const pt = (xPx: number, yPx: number, g: Geo = PART) => ({ x: xPx * g.s, y: g.h - yPx * g.s });

/** Standard PDF fonts only cover WinAnsi; drop anything else (e.g. Tamil script) rather than crash. */
const winAnsi = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "").replace(/\s+/g, " ").trim();

/** Largest size ≤ sizePx (in px) at which `text` fits maxWPx; returned in points. */
const fitSize = (font: PDFFont, text: string, sizePx: number, maxWPx: number, minPx = 14, g: Geo = PART) => {
  let size = sizePx;
  while (size > minPx && font.widthOfTextAtSize(text, size * g.s) > maxWPx * g.s) size -= 0.5;
  return size * g.s;
};

type Run = { text: string; font: PDFFont; sizePx: number; color: RGB };

/** Draws runs of mixed fonts as one line centred on cx, shrinking all runs together to fit. */
function drawRunsCentered(page: PDFPage, runs: Run[], cxPx: number, baselinePx: number, maxWPx: number, g: Geo = PART) {
  const clean = runs.map((r) => ({ ...r, text: winAnsi(r.text) })).filter((r) => r.text);
  if (!clean.length) return;
  const GAP = 0.4; // em space between runs
  const widthAt = (k: number) => clean.reduce((w, r, i) => {
    const size = r.sizePx * k * g.s;
    return w + r.font.widthOfTextAtSize(r.text, size) + (i < clean.length - 1 ? size * GAP : 0);
  }, 0);
  let k = 1;
  while (k > 0.45 && widthAt(k) > maxWPx * g.s) k -= 0.02;
  let x = cxPx * g.s - widthAt(k) / 2;
  const y = g.h - baselinePx * g.s;
  for (const r of clean) {
    const size = r.sizePx * k * g.s;
    page.drawText(r.text, { x, y, size, font: r.font, color: r.color });
    x += r.font.widthOfTextAtSize(r.text, size) + size * GAP;
  }
}

function drawCentered(page: PDFPage, font: PDFFont, text: string, cxPx: number, baselinePx: number, sizePx: number, color: RGB, maxWPx = 880, g: Geo = PART) {
  drawRunsCentered(page, [{ text, font, sizePx, color }], cxPx, baselinePx, maxWPx, g);
}

/** Fits an image inside a box (px) keeping its aspect ratio, centred. */
function drawImageInBox(page: PDFPage, img: PDFImage, cxPx: number, cyPx: number, wPx: number, hPx: number, g: Geo = PART) {
  const k = Math.min((wPx * g.s) / img.width, (hPx * g.s) / img.height);
  const w = img.width * k;
  const h = img.height * k;
  page.drawImage(img, { x: cxPx * g.s - w / 2, y: g.h - cyPx * g.s - h / 2, width: w, height: h });
}

/** Fits an image inside a box (px) keeping its aspect ratio, centred horizontally and sitting on bottomPx. */
function drawImageOnBaseline(page: PDFPage, img: PDFImage, cxPx: number, bottomPx: number, wPx: number, hPx: number, g: Geo = PART) {
  const k = Math.min((wPx * g.s) / img.width, (hPx * g.s) / img.height);
  const w = img.width * k;
  const h = img.height * k;
  page.drawImage(img, { x: cxPx * g.s - w / 2, y: g.h - bottomPx * g.s, width: w, height: h });
}

const normaliseAgeGroup = (g: string) => g.toLowerCase().replace(/[^a-z]/g, "");

const formatDob = (d: Date) => {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
};

export const formatWeightCategory = (weightCategory: string, gender?: string | null) => {
  const w = weightCategory.trim();
  if (!w || w.toUpperCase() === "ALL") return "";
  const withUnit = /kg/i.test(w) ? w.replace(/\s*kg/i, " Kg") : `${w} Kg`;
  const genderText = gender === "FEMALE" ? "Girls" : gender === "MALE" ? "Boys" : "";
  return genderText ? `${genderText}  ${withUnit}` : withUnit;
};

/** Signatory slots: up to 3 on the first row, 2 on the second, 1 centred at the bottom. */
const SIGNATORY_SLOTS = [
  { cx: 272, nameY: 1255, sigCy: 1205, sigH: 70 },
  { cx: 600, nameY: 1255, sigCy: 1205, sigH: 70 },
  { cx: 922, nameY: 1255, sigCy: 1205, sigH: 70 },
  { cx: 272, nameY: 1357, sigCy: 1315, sigH: 50 },
  { cx: 922, nameY: 1357, sigCy: 1315, sigH: 50 },
  { cx: 600, nameY: 1454, sigCy: 1413, sigH: 50 },
];

/** Which slots to use for n signatories, so 1–2 people sit centred rather than off to one side. */
const slotsFor = (n: number): number[] => {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (n === 2) return [0, 2];
  return [0, 1, 2, 3, 4, 5].slice(0, n);
};

// ── Merit certificate (1st–3rd) ──────────────────────────────────────────────

/**
 * Merit design ("Judo Merit Certificate 2026", A4). The background holds the fixed artwork: gold
 * border, kanji, top logos, TNJA header, JSW, "CERTIFICATE OF MERIT", field labels with dotted
 * lines and the Hansei circle. Coordinates are in pixels of that design rendered 1414 px wide.
 */
export const MERIT_BACKGROUND_PATH = path.join(CERT_ASSETS_DIR, "merit-background.jpeg");
const MERIT: Geo = { s: 595.2756 / 1414, h: 841.8898 };
const BLACK = rgb(0.08, 0.08, 0.08);
const GREY = rgb(0.15, 0.15, 0.15);

const MERIT_SIGNATORY_SLOTS = [
  { cx: 352, nameY: 1605, sigBottom: 1578, sigH: 95 },
  { cx: 707, nameY: 1605, sigBottom: 1578, sigH: 95 },
  { cx: 1040, nameY: 1605, sigBottom: 1578, sigH: 95 },
  { cx: 375, nameY: 1748, sigBottom: 1722, sigH: 80 },
  { cx: 1040, nameY: 1748, sigBottom: 1722, sigH: 80 },
  { cx: 707, nameY: 1840, sigBottom: 1814, sigH: 80 },
];

/** "SUB_JUNIOR" / "sub junior" → "Sub-Junior" (the spelling on the certificate). */
const ageGroupLabel = (g: string) =>
  AGE_OPTIONS.find((o) => normaliseAgeGroup(o) === normaliseAgeGroup(g))
  ?? g.toLowerCase().replace(/[_\s]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** The reference line's trailing "P :" (participation) reads "M :" on merit certificates. */
const meritReference = (ref: string) => ref.replace(/\bP\s*:\s*$/, "M :");

async function renderMeritCertificate(config: CertificateConfig, player: CertificatePlayer, position: string): Promise<Uint8Array> {
  const g = MERIT;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Merit Certificate - ${winAnsi(player.name)}`);
  const page = pdfDoc.addPage([595.2756, g.h]);
  page.drawImage(await pdfDoc.embedJpg(fs.readFileSync(MERIT_BACKGROUND_PATH)), { x: 0, y: 0, width: 595.2756, height: g.h });

  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const timesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Reference line + certificate number, right-aligned inside the red frame.
  const certNo = winAnsi(player.certificateNo ?? "");
  const refBase = winAnsi(meritReference(config.referenceNo));
  if (refBase || certNo) {
    const ref = refBase ? [refBase, certNo].filter(Boolean).join(" ") : `Certificate No : ${certNo}`;
    const size = fitSize(helv, ref, 14, 420, 9, g);
    page.drawText(ref, { x: 1138 * g.s - helv.widthOfTextAtSize(ref, size), y: g.h - 331 * g.s, size, font: helv, color: GREY });
  }

  // Event header
  if (config.championshipTitle) drawCentered(page, helvBold, config.championshipTitle.toUpperCase(), 707, 573, 50, BLACK, 960, g);
  if (config.hostedBy) drawCentered(page, timesItalic, `Hosted By - ${config.hostedBy}`, 707, 611, 30, GREY, 820, g);
  if (config.coSponsoredBy) drawCentered(page, timesItalic, `Co-sponsored by : ${config.coSponsoredBy}`, 707, 646, 30, GREY, 600, g);
  if (config.venueName) {
    drawRunsCentered(page, [
      { text: "Venue :", font: timesItalic, sizePx: 32, color: BLACK },
      { text: config.venueName, font: timesBoldItalic, sizePx: 34, color: BLACK },
    ], 707, 692, 590, g);
  }
  if (config.venueAddress) drawCentered(page, timesItalic, config.venueAddress, 707, 726, 30, BLACK, 560, g);

  const [leftLogo, rightLogo] = await Promise.all([embedImage(pdfDoc, config.leftLogo), embedImage(pdfDoc, config.rightLogo)]);
  if (leftLogo) drawImageInBox(page, leftLogo, 310, 727, 185, 165, g);
  if (rightLogo) drawImageInBox(page, rightLogo, 1106, 740, 165, 95, g);

  // Fields: values sit on the dotted lines printed in the artwork.
  const VALUE_X = 556;
  const VALUE_MAX_W = 1185 - VALUE_X;
  const value = (text: string | null | undefined, baselinePx: number, sizePx = 34) => {
    const v = winAnsi(text ?? "");
    if (!v) return;
    page.drawText(v, { ...pt(VALUE_X, baselinePx, g), size: fitSize(timesBoldItalic, v, sizePx, VALUE_MAX_W, 14, g), font: timesBoldItalic, color: INK });
  };
  const lineY = [992, 1056, 1121, 1186, 1250, 1314]; // dotted lines: name … position
  value(player.name.toUpperCase(), lineY[0]! - 7, 36);
  value(player.dob ? formatDob(new Date(player.dob)) : "", lineY[1]! - 7);
  value(player.fatherName?.toUpperCase(), lineY[2]! - 7);
  value(player.district?.toUpperCase(), lineY[3]! - 7);
  value(player.weightCategory, lineY[4]! - 7);
  value(position, lineY[5]! - 7);

  if (player.ageGroup) {
    const age = winAnsi(ageGroupLabel(player.ageGroup));
    page.drawText(age, { ...pt(VALUE_X, 1386, g), size: fitSize(timesItalic, age, 38, VALUE_MAX_W, 14, g), font: timesItalic, color: BLACK });
  }
  if (config.dateText) {
    const d = winAnsi(config.dateText);
    page.drawText(d, { ...pt(VALUE_X, 1451, g), size: fitSize(timesBoldItalic, d, 34, VALUE_MAX_W, 14, g), font: timesBoldItalic, color: BLACK });
  }

  // Signatories
  const people = config.signatories.slice(0, MAX_SIGNATORIES);
  const slots = slotsFor(people.length);
  const signatures = await Promise.all(people.map((s) => embedImage(pdfDoc, s.signature)));
  people.forEach((s, i) => {
    const slot = MERIT_SIGNATORY_SLOTS[slots[i] ?? -1];
    if (!slot) return;
    const sig = signatures[i];
    if (sig) {
      const k = clampScale(s.signatureScale) / 100;
      drawImageOnBaseline(page, sig, slot.cx, slot.sigBottom, Math.min(230 * k, 330), slot.sigH * k, g);
    }
    drawRunsCentered(page, [
      { text: s.name.toUpperCase() + (s.qualification ? "," : ""), font: helvBold, sizePx: 24, color: BLACK },
      { text: s.qualification ?? "", font: helvBold, sizePx: 17, color: BLACK },
    ], slot.cx, slot.nameY, 296, g);
    if (s.designation) drawCentered(page, helvBold, s.designation, slot.cx, slot.nameY + 25, 16, BLACK, 296, g);
    if (s.organisation) drawCentered(page, helvBold, s.organisation, slot.cx, slot.nameY + (s.designation ? 48 : 25), 16, BLACK, 296, g);
  });

  return pdfDoc.save();
}

// ── Renderer ─────────────────────────────────────────────────────────────────

export async function renderCertificate(config: CertificateConfig, player: CertificatePlayer): Promise<Uint8Array> {
  // 1st–3rd place use the separate merit design when its artwork is installed.
  const meritPosition = player.placement ? POSITION_TEXT[player.placement] : undefined;
  if (meritPosition && fs.existsSync(MERIT_BACKGROUND_PATH)) {
    return renderMeritCertificate(config, player, meritPosition.replace(/\s+-\s+/, " - "));
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Certificate - ${winAnsi(player.name)}`);
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  page.drawImage(await pdfDoc.embedJpg(fs.readFileSync(BACKGROUND_PATH)), { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const times = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const timesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
  void times;

  // ── Event header ───────────────────────────────────────────────────────────
  // Reference line (top right) followed by this certificate's number, e.g. "TNJA329/2017/SUBJUN@2026 P : 041".
  const certNo = winAnsi(player.certificateNo ?? "");
  const refBase = winAnsi(config.referenceNo);
  if (refBase || certNo) {
    const ref = refBase ? [refBase, certNo].filter(Boolean).join(" ") : `Certificate No : ${certNo}`;
    const size = fitSize(helv, ref, 11, 330, 8);
    page.drawText(ref, { x: 1002 * SCALE - helv.widthOfTextAtSize(ref, size), y: PAGE_H - 271 * SCALE, size, font: helv, color: rgb(0.2, 0.2, 0.2) });
  }
  if (config.championshipTitle) drawCentered(page, helvBold, config.championshipTitle.toUpperCase(), 600, 443, 40, RED, 880);
  if (config.hostedBy) drawCentered(page, timesItalic, `Hosted By - ${config.hostedBy}`, 600, 474, 24, LABEL, 700);
  if (config.coSponsoredBy) drawCentered(page, timesItalic, `Co-sponsored by : ${config.coSponsoredBy}`, 600, 503, 24, LABEL, 700);
  if (config.venueName) {
    drawRunsCentered(page, [
      { text: "Venue :", font: timesItalic, sizePx: 25, color: NAVY },
      { text: config.venueName, font: timesBoldItalic, sizePx: 27, color: NAVY },
    ], 600, 546, 560);
  }
  if (config.venueAddress) drawCentered(page, timesItalic, config.venueAddress, 600, 576, 23, NAVY, 560);

  // Venue lines stay within x 320–880; the side logos sit outside that, against the inner border
  // (the white area runs roughly x 125–1075 at this height).
  const [leftLogo, rightLogo] = await Promise.all([embedImage(pdfDoc, config.leftLogo), embedImage(pdfDoc, config.rightLogo)]);
  if (leftLogo) drawImageInBox(page, leftLogo, 222, 555, 150, 110);
  if (rightLogo) drawImageInBox(page, rightLogo, 1000, 555, 140, 110);

  // ── Title ──────────────────────────────────────────────────────────────────
  const position = player.placement ? POSITION_TEXT[player.placement] : undefined;
  drawCentered(page, timesBold, position ? "MERIT CERTIFICATE" : "PARTICIPATION CERTIFICATE", 600, 670, 62, MAROON, 880);
  if (position) drawCentered(page, timesBoldItalic, position, 600, 712, 28, MAROON);

  // ── Fields ─────────────────────────────────────────────────────────────────
  const LABEL_X = 183;
  const COLON_X = 410;
  const VALUE_X = 446;
  const DOTS_FROM = 441;
  const DOTS_TO = 940;
  const rowY = (i: number) => 762 + i * 55;
  const label = (text: string, i: number) => {
    page.drawText(text, { ...pt(LABEL_X, rowY(i)), size: 26 * SCALE, font: timesItalic, color: LABEL });
    page.drawText(":", { ...pt(COLON_X, rowY(i)), size: 26 * SCALE, font: timesItalic, color: LABEL });
  };
  const dottedLine = (i: number) => {
    const y = PAGE_H - (rowY(i) + 1) * SCALE;
    page.drawLine({ start: { x: DOTS_FROM * SCALE, y }, end: { x: DOTS_TO * SCALE, y }, thickness: 0.6, color: LABEL, dashArray: [0.6, 1.4] });
  };
  const value = (text: string | null | undefined, i: number, sizePx = 26) => {
    const v = winAnsi(text ?? "");
    if (!v) return;
    const size = fitSize(timesBoldItalic, v, sizePx, DOTS_TO - VALUE_X, 12);
    page.drawText(v, { ...pt(VALUE_X, rowY(i) - 5), size, font: timesBoldItalic, color: INK });
  };

  const rows: [string, string | null | undefined, number?][] = [
    ["Name", player.name.toUpperCase(), 28],
    ["Date of Birth", player.dob ? formatDob(new Date(player.dob)) : ""],
    ["Father's Name", player.fatherName?.toUpperCase()],
    ["District", player.district?.toUpperCase()],
    ["Weight Category", player.weightCategory],
  ];
  rows.forEach(([text, v, size], i) => {
    label(text, i);
    dottedLine(i);
    value(v, i, size);
  });

  // Age category: print every option and ring the player's.
  label("Age Category", 5);
  const ageSize = 25 * SCALE;
  const sep = " / ";
  let ax = DOTS_FROM * SCALE;
  const ageY = PAGE_H - rowY(5) * SCALE;
  const target = player.ageGroup ? normaliseAgeGroup(player.ageGroup) : "";
  AGE_OPTIONS.forEach((opt, idx) => {
    const w = timesItalic.widthOfTextAtSize(opt, ageSize);
    page.drawText(opt, { x: ax, y: ageY, size: ageSize, font: timesItalic, color: LABEL });
    if (normaliseAgeGroup(opt) === target) {
      page.drawEllipse({ x: ax + w / 2, y: ageY + ageSize * 0.3, xScale: w / 2 + 3, yScale: ageSize * 0.72, borderColor: INK, borderWidth: 1.3 });
    }
    ax += w;
    if (idx < AGE_OPTIONS.length - 1) {
      page.drawText(sep, { x: ax, y: ageY, size: ageSize, font: timesItalic, color: LABEL });
      ax += timesItalic.widthOfTextAtSize(sep, ageSize);
    }
  });

  label("Date", 6);
  if (config.dateText) {
    const d = winAnsi(config.dateText);
    page.drawText(d, { ...pt(DOTS_FROM, rowY(6)), size: fitSize(timesBoldItalic, d, 26, DOTS_TO + 60 - DOTS_FROM), font: timesBoldItalic, color: MAROON });
  }

  // ── Signatories ────────────────────────────────────────────────────────────
  const people = config.signatories.slice(0, MAX_SIGNATORIES);
  const slots = slotsFor(people.length);
  const signatures = await Promise.all(people.map((s) => embedImage(pdfDoc, s.signature)));
  people.forEach((s, i) => {
    const slot = SIGNATORY_SLOTS[slots[i] ?? -1];
    if (!slot) return;
    const sig = signatures[i];
    if (sig) {
      // The signature keeps its foot just above the name and grows upwards (and sideways,
      // capped so it can't run into the neighbouring signatory) as the admin enlarges it.
      const k = clampScale(s.signatureScale) / 100;
      drawImageOnBaseline(page, sig, slot.cx, slot.sigCy + slot.sigH / 2, Math.min(210 * k, 310), slot.sigH * k);
    }
    drawRunsCentered(page, [
      { text: s.name.toUpperCase() + (s.qualification ? "," : ""), font: helvBold, sizePx: 17, color: SIGN_TEXT },
      { text: s.qualification ?? "", font: helvBold, sizePx: 12, color: SIGN_TEXT },
    ], slot.cx, slot.nameY, 320);
    if (s.designation) drawCentered(page, helvBold, s.designation, slot.cx, slot.nameY + 20, 13.5, SIGN_SUB, 320);
    if (s.organisation) drawCentered(page, helvBold, s.organisation, slot.cx, slot.nameY + (s.designation ? 39 : 20), 13.5, SIGN_SUB, 320);
  });

  return pdfDoc.save();
}
