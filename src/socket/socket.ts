import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import url from "url";

interface ClientConnection {
  ws: WebSocket;
  role: string;
}

const clients = new Map<string, ClientConnection>();

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const parameters = url.parse(req.url || "", true).query;
    const userId = parameters.userId as string;
    const role = (parameters.role as string) || "GUEST";

    if (userId) {
      clients.set(userId, { ws, role });
      console.log(`[WS] User ${userId} connected with role ${role}`);

      ws.on("close", () => {
        clients.delete(userId);
        console.log(`[WS] User ${userId} disconnected`);
      });
    }
  });

  return wss;
}

export function sendNotificationToUser(userId: string, data: any) {
  const conn = clients.get(userId);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(data));
    // Type only: logging the user with the payload would tie an anonymous complainant to their grievance.
    console.log(`[WS] Sent ${data?.type ?? "notification"} to a user`);
    return true;
  }
  return false;
}

export function sendNotificationToAdmins(data: any) {
  const adminRoles = [
    "SUPER_ADMIN",
    "DISTRICT_PRESIDENT",
    "DISTRICT_SECRETARY",
    "ZONE_PRESIDENT",
    "ZONE_SECRETARY",
    "STATE_PRESIDENT",
    "STATE_SECRETARY",
    "CEO",
  ];
  let count = 0;
  for (const [userId, conn] of clients.entries()) {
    if (adminRoles.includes(conn.role) && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(data));
      count++;
    }
  }
  console.log(`[WS] Sent ${data?.type ?? "notification"} to ${count} admins`);
  return count > 0;
}
