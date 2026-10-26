import prisma from "../database/prisma.js";

/** Offices a coach can hold alongside coaching (everything a member can be promoted to except CEO). */
export const COACH_OFFICE_ROLES = [
  "DISTRICT_PRESIDENT",
  "DISTRICT_SECRETARY",
  "ZONE_PRESIDENT",
  "ZONE_SECRETARY",
  "STATE_PRESIDENT",
  "STATE_SECRETARY",
];

/** Offices tied to one district (district offices) or to that district's zone (zone offices). */
export const DISTRICT_SCOPED_OFFICE_ROLES = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY"];

/**
 * An office-bearer by id: a Member, or a coach acting in their office.
 * Ids are UUIDs, so a coach's id never matches a member's.
 */
export async function findOfficial(userId: string) {
  const select = { id: true, fullName: true, districtId: true, assignedDistrictId: true };
  const member = await prisma.member.findUnique({ where: { id: userId }, select });
  if (member) return member;
  return prisma.coachReferee.findUnique({ where: { id: userId }, select });
}

/**
 * Who already holds `role` for the target district / its zone / the state, among
 * both members and coaches — each office has one holder. Returns their name or null.
 */
export async function findOfficeHolder(role: string, targetDistrictId: string, excludeId: string): Promise<string | null> {
  let scope: any = {};

  if (role === "DISTRICT_PRESIDENT" || role === "DISTRICT_SECRETARY") {
    scope = { OR: [{ assignedDistrictId: targetDistrictId }, { districtId: targetDistrictId, assignedDistrictId: null }] };
  } else if (role === "ZONE_PRESIDENT" || role === "ZONE_SECRETARY") {
    const targetDistrict = await prisma.district.findUnique({ where: { id: targetDistrictId } });
    if (!targetDistrict?.zoneName) return null;
    const zoneDistricts = await prisma.district.findMany({ where: { zoneName: targetDistrict.zoneName }, select: { id: true } });
    const zoneDistrictIds = zoneDistricts.map((d: any) => d.id);
    scope = { OR: [{ assignedDistrictId: { in: zoneDistrictIds } }, { districtId: { in: zoneDistrictIds }, assignedDistrictId: null }] };
  } else if (role !== "STATE_PRESIDENT" && role !== "STATE_SECRETARY") {
    return null;
  }

  const [member, coach] = await Promise.all([
    prisma.member.findFirst({ where: { role: role as any, ...scope, NOT: { id: excludeId } }, select: { fullName: true } }),
    prisma.coachReferee.findFirst({ where: { officeRole: role as any, ...scope, NOT: { id: excludeId } }, select: { fullName: true } }),
  ]);
  return member?.fullName ?? coach?.fullName ?? null;
}
