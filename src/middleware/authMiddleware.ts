import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Token missing from header" });
    }

    jwt.verify(token, process.env.JWT_SECRET || "fallback", (err, user) => {
      if (err) {
        return res.status(403).json({ error: "Forbidden: Invalid token" });
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: "Unauthorized: No token provided" });
  }
};

export const authorizeAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const adminRoles = [
    "SUPER_ADMIN", 
    "DISTRICT_PRESIDENT", 
    "DISTRICT_SECRETARY", 
    "ZONE_PRESIDENT", 
    "ZONE_SECRETARY", 
    "STATE_PRESIDENT", 
    "STATE_SECRETARY",
    "CEO"
  ];

  if (req.user && adminRoles.includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({ error: "Forbidden: Admin access required" });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ error: "Forbidden: You do not have permission to access this resource" });
    }
  };
};
