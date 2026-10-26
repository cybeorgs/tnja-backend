import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request } from "express";

// Ensure uploads directory exists
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Setup Disk Storage engine
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Standardize file name: timestamp + random number + original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// Setup File Filter (Allowing safe images and document formats)
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".xlsx", ".xls", ".csv"];
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error("Only images, PDF, and Excel/CSV files are allowed!"));
  }
};

// Limit size to 5MB
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── Grievance attachments ────────────────────────────────────────────────────
// Images, audio and video each go to their own folder (MEDIA_*_DIR in .env, e.g.
// E:/tnja-img locally); documents stay in ./uploads. Each folder is served under
// /uploads/<urlPath>, which Nginx already proxies to the backend.
const MB = 1024 * 1024;

export const GRIEVANCE_MEDIA = {
  images: {
    dir: process.env.MEDIA_IMAGE_DIR || "./uploads/images",
    urlPath: "images",
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    maxBytes: 10 * MB,
    maxCount: 5,
    label: "Images (JPG, PNG, WEBP, GIF)",
  },
  documents: {
    dir: uploadDir,
    urlPath: "",
    extensions: [".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".csv"],
    maxBytes: 10 * MB,
    maxCount: 5,
    label: "Documents (PDF, Word, Excel, CSV, TXT)",
  },
  audio: {
    dir: process.env.MEDIA_AUDIO_DIR || "./uploads/audio",
    urlPath: "audio",
    extensions: [".mp3", ".wav", ".m4a", ".aac", ".ogg"],
    maxBytes: 25 * MB,
    maxCount: 3,
    label: "Audio (MP3, WAV, M4A, AAC, OGG)",
  },
  videos: {
    dir: process.env.MEDIA_VIDEO_DIR || "./uploads/videos",
    urlPath: "videos",
    extensions: [".mp4", ".mov", ".webm", ".mkv", ".3gp"],
    maxBytes: 100 * MB,
    maxCount: 2,
    label: "Videos (MP4, MOV, WEBM, MKV, 3GP)",
  },
} as const;

export type GrievanceMediaField = keyof typeof GRIEVANCE_MEDIA;

for (const { dir } of Object.values(GRIEVANCE_MEDIA)) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const grievanceStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, GRIEVANCE_MEDIA[file.fieldname as GrievanceMediaField].dir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `grievance-${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const grievanceFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const kind = GRIEVANCE_MEDIA[file.fieldname as GrievanceMediaField];
  if (!kind) return cb(new Error(`Unexpected attachment field "${file.fieldname}"`));
  if (!(kind.extensions as readonly string[]).includes(path.extname(file.originalname).toLowerCase())) {
    return cb(new Error(`"${file.originalname}" is not allowed. ${kind.label} only.`));
  }
  cb(null, true);
};

// Multer has one size limit for every field, so it is the largest (video) one;
// the per-kind limits are checked after upload by checkGrievanceFileSizes.
export const grievanceUpload = multer({
  storage: grievanceStorage,
  fileFilter: grievanceFileFilter,
  limits: { fileSize: GRIEVANCE_MEDIA.videos.maxBytes },
}).fields(Object.entries(GRIEVANCE_MEDIA).map(([name, kind]) => ({ name, maxCount: kind.maxCount })));

/** Error message for the first file over its kind's size limit, else null. */
export const checkGrievanceFileSizes = (files: Record<string, Express.Multer.File[]>): string | null => {
  for (const [field, list] of Object.entries(files)) {
    const kind = GRIEVANCE_MEDIA[field as GrievanceMediaField];
    const tooBig = list.find((f) => f.size > kind.maxBytes);
    if (tooBig) return `"${tooBig.originalname}" is larger than ${kind.maxBytes / MB} MB.`;
  }
  return null;
};

/** Deletes uploaded files, e.g. when the grievance they came with is rejected. */
export const removeUploadedFiles = (files: Record<string, Express.Multer.File[]>) => {
  for (const f of Object.values(files).flat()) fs.promises.unlink(f.path).catch(() => {});
};
