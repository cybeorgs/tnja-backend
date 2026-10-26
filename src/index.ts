import { validateEnv, getAllowedOrigins, isProduction } from "./config/env.js";
validateEnv();

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import registrationRoutes from "./modules/registrations/registration.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import grievanceRoutes from "./modules/grievances/grievance.routes.js";
import uploadRoutes from "./modules/upload/upload.routes.js";
import { razorpayWebhook } from "./modules/payments/webhook.controller.js";
import { GRIEVANCE_MEDIA } from "./middleware/uploadMiddleware.js";

import { createServer } from "http";
import { initWebSocketServer } from "./socket/socket.js";

const app = express();
const PORT = process.env.PORT || 9000;

app.disable("x-powered-by");
// Behind Nginx: trust X-Forwarded-* so req.protocol is "https" for generated upload URLs.
app.set("trust proxy", 1);

const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    // Non-browser requests (curl, server-side fetch, health checks) send no Origin.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
}));

// Razorpay webhooks are signed over the raw body, so this route must be
// registered before express.json() consumes and re-serialises it.
app.post("/api/webhooks/razorpay", express.raw({ type: "*/*", limit: "1mb" }), razorpayWebhook);

app.use(express.json());

// Serve local uploaded files statically. Grievance images/audio/videos live in
// their own folders (MEDIA_*_DIR), mounted before the general /uploads folder.
for (const { dir, urlPath } of Object.values(GRIEVANCE_MEDIA)) {
  if (urlPath) app.use(`/uploads/${urlPath}`, express.static(dir));
}
app.use("/uploads", express.static("uploads"));

// Global request logger
app.use((req, res, next) => {
  // Log the path only; query strings can carry personal data. Grievance paths carry account and
  // grievance ids that, side by side, could tie an anonymous complainant to their grievance.
  const loggedPath = req.path.startsWith("/api/grievances") ? req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id") : req.path;
  console.log(`${req.method} ${loggedPath}`);
  next();
});

// Routes
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", registrationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", grievanceRoutes);
app.use("/api", uploadRoutes);

// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "TNJA Backend is running" });
});

// Last-resort error handler: never leak stack traces or internals in production.
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err?.message || err);
  if (res.headersSent) return next(err);
  const status = Number(err?.status || err?.statusCode) || 500;
  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : err?.message || "Request failed",
    ...(!isProduction && status >= 500 && { details: err?.message }),
  });
});

const server = createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (${isProduction ? "production" : "development"})`);
  console.log(`[CORS] Allowed origins: ${allowedOrigins.join(", ")}`);
});
