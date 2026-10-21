import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";

type Purpose = "REGISTRATION" | "TOURNAMENT" | "EVENT";
type StatusGroup = "CAPTURED" | "PENDING" | "FAILED" | "REFUNDED";

interface Transaction {
  id: string;
  purpose: Purpose;
  /** PLAYER / COACH / MEMBER / CLUB … */
  payerType: string;
  payerId: string;
  payerName: string;
  /** Permanent ID if issued, otherwise the temporary ID. */
  payerRef: string | null;
  /** What was paid for: "Player registration", or the tournament/event title. */
  description: string;
  amount: number; // paise
  currency: string;
  status: StatusGroup;
  method: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  failureReason: string | null;
  date: string;
}

const STATUS_GROUP: Record<string, StatusGroup> = {
  CREATED: "PENDING",
  AUTHORIZED: "PENDING",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
};

const TYPE_LABEL: Record<string, string> = { PLAYER: "Player", COACH: "Coach / Referee", MEMBER: "Member", CLUB: "Club" };

/** Calendar day (YYYY-MM-DD) in India Standard Time, so daily totals match the admins' clock. */
const IST_OFFSET_MS = 330 * 60 * 1000;
const istDay = (iso: string) => new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const parseDate = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/** Looks up display names and IDs for payers across the four account tables. */
async function loadPayers(idsByType: Map<string, Set<string>>) {
  const payers = new Map<string, { name: string; ref: string | null }>();
  const ids = (type: string) => [...(idsByType.get(type) ?? [])];
  const select = { id: true, permanentId: true, tempId: true } as const;

  const [students, coaches, members, clubs] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: ids("PLAYER") } }, select: { ...select, fullName: true } }),
    prisma.coachReferee.findMany({ where: { id: { in: ids("COACH") } }, select: { ...select, fullName: true } }),
    prisma.member.findMany({ where: { id: { in: ids("MEMBER") } }, select: { ...select, fullName: true } }),
    prisma.club.findMany({ where: { id: { in: ids("CLUB") } }, select: { ...select, name: true } }),
  ]);
  for (const p of [...students, ...coaches, ...members]) payers.set(p.id, { name: p.fullName, ref: p.permanentId || p.tempId });
  for (const c of clubs) payers.set(c.id, { name: c.name, ref: c.permanentId || c.tempId });
  return payers;
}

/** Ledger payer types are login roles; office-bearer roles live in the member table. */
const accountType = (payerType: string) => (["PLAYER", "COACH", "CLUB"].includes(payerType) ? payerType : "MEMBER");

// GET /api/admin/payments?from=&to=&purpose=&status=&q=&page=&pageSize=
export const getPaymentsReport = async (req: Request, res: Response) => {
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const purpose = String(req.query.purpose || "ALL").toUpperCase();
  const status = String(req.query.status || "ALL").toUpperCase();
  const q = String(req.query.q || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(5000, Math.max(1, parseInt(String(req.query.pageSize || "25"), 10) || 25));

  // A payment belongs to the day it was paid, or the day it was started if it never completed.
  const range = { ...(from && { gte: from }), ...(to && { lte: to }) };
  const inRange = from || to ? { OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] } : {};

  try {
    const [registrationPayments, ledger] = await Promise.all([
      purpose === "ALL" || purpose === "REGISTRATION" ? prisma.registrationPayment.findMany({ where: inRange }) : [],
      purpose === "ALL" || purpose === "TOURNAMENT" || purpose === "EVENT"
        ? prisma.paymentLedger.findMany({ where: { ...inRange, ...(purpose !== "ALL" && { purpose: purpose as "TOURNAMENT" | "EVENT" }) } })
        : [],
    ]);

    const idsByType = new Map<string, Set<string>>();
    const addId = (type: string, id: string) => {
      if (!idsByType.has(type)) idsByType.set(type, new Set());
      idsByType.get(type)!.add(id);
    };
    registrationPayments.forEach((p) => addId(p.applicantType, p.applicantId));
    ledger.forEach((p) => addId(accountType(p.payerType), p.payerId));
    const payers = await loadPayers(idsByType);

    let rows: Transaction[] = [
      ...registrationPayments.map((p): Transaction => {
        const payer = payers.get(p.applicantId);
        return {
          id: p.id,
          purpose: "REGISTRATION",
          payerType: p.applicantType,
          payerId: p.applicantId,
          payerName: payer?.name ?? "Deleted account",
          payerRef: payer?.ref ?? null,
          description: `${TYPE_LABEL[p.applicantType] ?? p.applicantType} registration fee`,
          amount: p.amount,
          currency: p.currency,
          status: STATUS_GROUP[p.status] ?? "PENDING",
          method: null,
          razorpayPaymentId: p.razorpayPaymentId,
          razorpayOrderId: p.razorpayOrderId,
          failureReason: p.failureReason,
          date: (p.paidAt ?? p.createdAt).toISOString(),
        };
      }),
      ...ledger.map((p): Transaction => {
        const payer = payers.get(p.payerId);
        return {
          id: p.id,
          purpose: p.purpose,
          payerType: p.payerType,
          payerId: p.payerId,
          payerName: payer?.name ?? p.payerName ?? "Deleted account",
          payerRef: payer?.ref ?? null,
          description: `${p.purpose === "TOURNAMENT" ? "Tournament" : "Event"}: ${p.referenceTitle ?? "—"}`,
          amount: p.amount,
          currency: p.currency,
          status: STATUS_GROUP[p.status] ?? "PENDING",
          method: p.method,
          razorpayPaymentId: p.razorpayPaymentId,
          razorpayOrderId: p.razorpayOrderId,
          failureReason: null,
          date: (p.paidAt ?? p.createdAt).toISOString(),
        };
      }),
    ];

    if (q) {
      rows = rows.filter((r) =>
        [r.payerName, r.payerRef, r.description, r.razorpayPaymentId, r.razorpayOrderId]
          .some((v) => v?.toLowerCase().includes(q))
      );
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));

    // Summary covers the whole filtered range, before the status filter and paging.
    const captured = rows.filter((r) => r.status === "CAPTURED");
    const sum = (list: Transaction[]) => list.reduce((total, r) => total + r.amount, 0);
    const group = (list: Transaction[], key: (r: Transaction) => string) => {
      const out = new Map<string, { amount: number; count: number }>();
      for (const r of list) {
        const k = key(r);
        const g = out.get(k) ?? { amount: 0, count: 0 };
        g.amount += r.amount;
        g.count += 1;
        out.set(k, g);
      }
      return [...out.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.amount - a.amount);
    };

    const summary = {
      collected: sum(captured),
      capturedCount: captured.length,
      averageTicket: captured.length ? Math.round(sum(captured) / captured.length) : 0,
      pendingCount: rows.filter((r) => r.status === "PENDING").length,
      failedCount: rows.filter((r) => r.status === "FAILED").length,
      refunded: sum(rows.filter((r) => r.status === "REFUNDED")),
      byPurpose: group(captured, (r) => r.purpose),
      byRegistrationType: group(captured.filter((r) => r.purpose === "REGISTRATION"), (r) => r.payerType),
      byDay: group(captured, (r) => istDay(r.date)).sort((a, b) => a.key.localeCompare(b.key)),
    };

    const filtered = status === "ALL" ? rows : rows.filter((r) => r.status === status);
    return res.json({
      summary,
      total: filtered.length,
      page,
      pageSize,
      transactions: filtered.slice((page - 1) * pageSize, page * pageSize),
    });
  } catch (error) {
    console.error("[getPaymentsReport]", error);
    return res.status(500).json({ error: "Failed to load payments report" });
  }
};
