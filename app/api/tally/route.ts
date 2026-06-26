import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { parseTally, insertReview } from "@/lib/reviews";

export const dynamic = "force-dynamic";

/**
 * Vérifie la signature Tally : HMAC-SHA256 du corps brut avec le signing secret,
 * encodé en base64, comparé au header `tally-signature`.
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.TALLY_SIGNING_SECRET;
  if (!secret) return false; // pas de secret configuré => refus
  if (!header) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const raw = await req.text(); // corps brut nécessaire pour le HMAC

  if (!verifySignature(raw, req.headers.get("tally-signature"))) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = parseTally(payload);
  if (!parsed) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    await insertReview(parsed, payload);
  } catch (err) {
    console.error("[tally] insert failed", err);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rating: parsed.rating });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "tally-webhook" });
}
