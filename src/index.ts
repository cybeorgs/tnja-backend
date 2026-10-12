import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import registrationRoutes from "./modules/registrations/registration.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import grievanceRoutes from "./modules/grievances/grievance.routes.js";
import uploadRoutes from "./modules/upload/upload.routes.js";

import { createServer } from "http";
import { initWebSocketServer } from "./socket/socket.js";

const app = express();
const PORT = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

// Serve local uploaded files statically
app.use("/uploads", express.static("uploads"));

// Global request logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
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

const server = createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
