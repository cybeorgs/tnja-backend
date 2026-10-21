import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";

export const getDistricts = async (req: Request, res: Response) => {
  try {
    const districts = await prisma.district.findMany({
      orderBy: { name: 'asc' }
    });
    return res.json(districts);
  } catch (error) {
    console.error("Error fetching districts:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** PATCH /admin/districts/:id/code – set the code that prefixes the district's player IDs (e.g. CBE). */
export const updateDistrictCode = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) {
    return res.status(400).json({ error: "District code must be 2 to 5 letters (e.g. CBE)." });
  }

  try {
    const clash = await prisma.district.findFirst({ where: { code, NOT: { id } }, select: { name: true } });
    if (clash) return res.status(409).json({ error: `Code ${code} is already used by ${clash.name}.` });

    const district = await prisma.district.update({ where: { id }, data: { code } });
    return res.json({ message: `${district.name} code set to ${code}.`, data: district });
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "District not found" });
    console.error("[updateDistrictCode]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getTaluksByDistrict = async (req: Request, res: Response) => {
  const districtId = String(req.params.districtId);
  try {
    const taluks = await prisma.taluk.findMany({
      where: { districtId },
      orderBy: { name: 'asc' }
    });
    return res.json(taluks);
  } catch (error) {
    console.error("Error fetching taluks:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Loose key so "Kuttalam"/"Kuthalam", "Kancheepuram"/"Kanchipuram",
// "The Nilgiris"/"Nilgiris" etc. compare equal.
const baseKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\b(taluk|taluka|block|district)\b/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1");

// India Post spellings that baseKey alone can't reconcile with the names in
// tn-districts-taluks.json.
const NAME_ALIASES = new Map(
  Object.entries({
    Tuticorin: "Thoothukudi",
    Tiruchy: "Tiruchirappalli",
    Trichy: "Tiruchirappalli",
    Kanyakumari: "Kanniyakumari",
    Sivagangai: "Sivaganga",
    Ooty: "Udhagamandalam",
  }).map(([from, to]) => [baseKey(from), baseKey(to)])
);

const nameKey = (s: string) => {
  const k = baseKey(s);
  return NAME_ALIASES.get(k) ?? k;
};

type PostOffice = { Name: string; District: string; Block: string; State: string };

const pincodeCache = new Map<string, PostOffice[]>();

const fetchPostOffices = async (pincode: string): Promise<PostOffice[]> => {
  const cached = pincodeCache.get(pincode);
  if (cached) return cached;
  const r = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Pincode API responded ${r.status}`);
  const body = (await r.json()) as { Status: string; PostOffice: PostOffice[] | null }[];
  const offices = body?.[0]?.Status === "Success" ? body[0].PostOffice ?? [] : [];
  pincodeCache.set(pincode, offices);
  return offices;
};

// GET /api/locations/pincode/:pincode
// India Post's District field still uses pre-2019/2020 boundaries (e.g. 609805
// is listed under Nagapattinam, but is now in Mayiladuthurai), while its Block
// field matches current taluk names. So taluks are matched first and the
// district is derived from them; the India Post district is only a fallback.
export const getLocationByPincode = async (req: Request, res: Response) => {
  const pincode = String(req.params.pincode);
  if (!/^[1-9]\d{5}$/.test(pincode)) {
    return res.status(400).json({ error: "Pincode must be 6 digits" });
  }
  try {
    const offices = (await fetchPostOffices(pincode)).filter((o) => nameKey(o.State) === "tamilnadu");
    if (offices.length === 0) {
      return res.status(404).json({ error: "No Tamil Nadu location found for this pincode" });
    }

    const districts = await prisma.district.findMany({ include: { taluks: true } });
    const blockKeys = new Set(offices.map((o) => nameKey(o.Block)));

    const matchedTaluks = districts.flatMap((d) =>
      d.taluks
        .filter((t) => blockKeys.has(nameKey(t.name)))
        .map((t) => ({ id: t.id, name: t.name, districtId: d.id }))
    );

    let district: (typeof districts)[number] | undefined;
    if (matchedTaluks.length > 0) {
      // Each post office votes for the district of the taluk its block matches;
      // a pincode straddling two districts goes to the one with more offices.
      const counts = new Map<string, number>();
      for (const o of offices) {
        const t = matchedTaluks.find((t) => nameKey(t.name) === nameKey(o.Block));
        if (t) counts.set(t.districtId, (counts.get(t.districtId) ?? 0) + 1);
      }
      const bestId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      district = districts.find((d) => d.id === bestId);
    } else {
      const postDistrictKeys = new Set(offices.map((o) => nameKey(o.District)));
      district = districts.find((d) => postDistrictKeys.has(nameKey(d.name)));
    }

    if (!district) {
      return res.status(404).json({ error: "Could not map this pincode to a district" });
    }

    const districtId = district.id;
    const taluks = matchedTaluks
      .filter((t) => t.districtId === districtId)
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json({
      pincode,
      district: { id: district.id, name: district.name },
      taluks,
      postOffices: offices.map((o) => o.Name),
    });
  } catch (error) {
    console.error("Error looking up pincode:", error);
    return res.status(502).json({ error: "Pincode lookup service unavailable" });
  }
};

export const getTalukDetails = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const taluk = await prisma.taluk.findUnique({
      where: { id }
    });
    if (!taluk) return res.status(404).json({ error: "Taluk not found" });
    return res.json(taluk);
  } catch (error) {
    console.error("Error fetching taluk details:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
