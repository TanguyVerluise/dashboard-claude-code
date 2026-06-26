import { NextRequest, NextResponse } from "next/server";
import { parseEvent } from "@/lib/events";
import { insertEvent } from "@/lib/db";

// Toujours exécuté à la demande, jamais mis en cache.
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false; // pas de secret configuré => refus par sécurité
  const token =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-webhook-secret") ??
    "";
  return token === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = parseEvent(payload);
  if (!parsed) {
    // Évènement inconnu ou sans date exploitable : on accuse réception (2xx)
    // pour éviter que MemberPress ne retente en boucle.
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    await insertEvent(parsed, payload);
  } catch (err) {
    console.error("[webhook] insert failed", err);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventType: parsed.eventType });
}

// Petit GET de diagnostic (sans secret : ne renvoie aucune donnée).
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "memberpress-webhook" });
}
