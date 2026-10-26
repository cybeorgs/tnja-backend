import fs from "fs";
import path from "path";
import { PDFDocument, PDFName } from "pdf-lib";

// Removes hidden metadata that can identify the person who made a file: photo EXIF
// (GPS location, camera serial, owner name), XMP/IPTC, PNG/WebP text chunks, PDF
// author/creator info and MP3 ID3 tags. Used for anonymous grievance attachments.
// Videos, Word/Excel files and other audio formats are not rewritten; callers report
// them so the person can be warned.

/** Keeps a JPEG's orientation (so photos aren't shown sideways) as the only EXIF field. */
function jpegOrientation(app1: Buffer): number | null {
  if (app1.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const tiff = app1.subarray(6);
  const little = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (o: number) => (little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  try {
    const ifd = u32(4);
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (u16(entry) === 0x0112) return u16(entry + 8);
    }
  } catch {
    // Malformed EXIF: no orientation.
  }
  return null;
}

/** A minimal EXIF APP1 segment holding only the Orientation tag. */
function orientationSegment(orientation: number): Buffer {
  const body = Buffer.alloc(6 + 8 + 2 + 12 + 4);
  body.write("Exif\0\0", 0, "latin1");
  body.write("MM\0*", 6, "latin1");
  body.writeUInt32BE(8, 10); // IFD0 offset
  body.writeUInt16BE(1, 14); // one entry
  body.writeUInt16BE(0x0112, 16); // Orientation
  body.writeUInt16BE(3, 18); // SHORT
  body.writeUInt32BE(1, 20); // count
  body.writeUInt16BE(orientation, 24);
  body.writeUInt32BE(0, 28); // no next IFD
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

function stripJpeg(buf: Buffer): Buffer {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let orientation: number | null = null;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // not a marker: leave the file untouched
    const marker = buf[i + 1]!;
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      // The orientation-only EXIF goes right after JFIF (APP0) when there is one.
      if (orientation && orientation !== 1) out.splice(out[1]?.[1] === 0xe0 ? 2 : 1, 0, orientationSegment(orientation));
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }
    const len = buf.readUInt16BE(i + 2);
    const segment = buf.subarray(i, i + 2 + len);
    // Keep JFIF (APP0), ICC colour profile (APP2) and Adobe (APP14); drop EXIF/XMP (APP1),
    // IPTC/Photoshop (APP13), other APPn and comments (COM).
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xe1) orientation ??= jpegOrientation(segment.subarray(4));
    if ((!isApp && marker !== 0xfe) || marker === 0xe0 || marker === 0xe2 || marker === 0xee) out.push(segment);
    i += 2 + len;
  }
  return buf;
}

function stripPng(buf: Buffer): Buffer {
  const SIGNATURE = "\x89PNG\r\n\x1a\n";
  if (buf.toString("latin1", 0, 8) !== SIGNATURE) return buf;
  const drop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const chunk = buf.subarray(i, i + 12 + len);
    if (!drop.has(type)) out.push(chunk);
    i += 12 + len;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

function stripWebp(buf: Buffer): Buffer {
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") return buf;
  const out: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString("latin1", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const chunk = Buffer.from(buf.subarray(i, i + 8 + size + (size % 2)));
    if (fourcc === "VP8X") chunk[8] = chunk[8]! & ~(0x08 | 0x04); // clear EXIF and XMP flags
    if (fourcc !== "EXIF" && fourcc !== "XMP ") out.push(chunk);
    i += 8 + size + (size % 2);
  }
  const body = Buffer.concat(out);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

function stripMp3(buf: Buffer): Buffer {
  let start = 0;
  // ID3v2 tags at the start (there can be several).
  while (buf.toString("latin1", start, start + 3) === "ID3" && start + 10 <= buf.length) {
    const size = ((buf[start + 6]! & 0x7f) << 21) | ((buf[start + 7]! & 0x7f) << 14) | ((buf[start + 8]! & 0x7f) << 7) | (buf[start + 9]! & 0x7f);
    const footer = buf[start + 5]! & 0x10 ? 10 : 0;
    start += 10 + size + footer;
  }
  let end = buf.length;
  // ID3v1 tag: the last 128 bytes, starting with "TAG".
  if (end - start >= 128 && buf.toString("latin1", end - 128, end - 125) === "TAG") end -= 128;
  return buf.subarray(start, end);
}

async function stripPdf(buf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setCreator("");
  doc.setProducer("");
  doc.catalog.delete(PDFName.of("Metadata")); // XMP metadata stream
  return Buffer.from(await doc.save({ updateFieldAppearances: false }));
}

const CLEANERS: Record<string, (buf: Buffer) => Buffer | Promise<Buffer>> = {
  ".jpg": stripJpeg,
  ".jpeg": stripJpeg,
  ".png": stripPng,
  ".webp": stripWebp,
  ".mp3": stripMp3,
  ".pdf": stripPdf,
};

/**
 * Rewrites the file without identifying metadata. Returns false when this type
 * can't be cleaned (or cleaning failed) so the caller can warn that it may still
 * carry metadata.
 */
export async function stripIdentifyingMetadata(filePath: string): Promise<boolean> {
  const clean = CLEANERS[path.extname(filePath).toLowerCase()];
  if (!clean) return false;
  try {
    const original = await fs.promises.readFile(filePath);
    const cleaned = await clean(original);
    if (cleaned !== original) await fs.promises.writeFile(filePath, cleaned);
    return true;
  } catch (err: any) {
    // e.g. an encrypted PDF pdf-lib can't open; the file name is random, so nothing identifying is logged.
    console.error("[metadata] could not clean an attachment:", err?.message || err);
    return false;
  }
}
