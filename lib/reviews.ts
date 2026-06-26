import { sql } from "./sql";

// Parsing des soumissions Tally (webhook FORM_RESPONSE).
// Le payload contient data.fields[] : { key, label, type, value, options? }.
// Pour les choix (MULTIPLE_CHOICE/CHECKBOXES/DROPDOWN), value = ids d'options
// qu'on résout en texte via le tableau options.

export interface ResolvedField {
  label: string;
  type: string;
  value: string | string[] | number | boolean | null;
}

export interface ParsedReview {
  submissionId: string | null;
  respondentId: string | null;
  formName: string | null;
  rating: number | null;
  fields: ResolvedField[];
  submittedAt: string | null;
}

export interface Review {
  rating: number | null;
  fields: ResolvedField[];
  submittedAt: string | null;
}

export interface ReviewsSummary {
  count: number;
  avgRating: number | null;
  maxRating: number; // échelle des notes (ex: 4 étoiles)
  reviews: Review[];
}

function resolveField(f: Record<string, unknown>): ResolvedField {
  let value = f.value as ResolvedField["value"];
  const options = f.options as { id: string; text: string }[] | undefined;
  if (Array.isArray(options) && options.length) {
    const byId = new Map(options.map((o) => [o.id, o.text]));
    if (Array.isArray(value)) value = value.map((v) => byId.get(String(v)) ?? String(v));
    else if (value != null && byId.has(String(value))) value = byId.get(String(value))!;
  }
  // Un tableau à un seul élément s'affiche mieux en chaîne simple.
  if (Array.isArray(value) && value.length === 1) value = value[0];
  return {
    label: (f.label as string) ?? (f.key as string) ?? "",
    type: (f.type as string) ?? "",
    value: value ?? null,
  };
}

/** Détecte une note (1..N) dans les réponses : motif "N⭐" / "N étoile" / nb d'étoiles. */
function extractRating(fields: ResolvedField[]): number | null {
  for (const f of fields) {
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    for (const v of vals) {
      if (typeof v !== "string") {
        if (typeof v === "number" && /rating|scale|note/i.test(f.type + f.label)) return v;
        continue;
      }
      const m = v.match(/(\d+)\s*(?:⭐|★|star|étoile|etoile)/i);
      if (m) return Number(m[1]);
      const stars = (v.match(/[⭐★]/g) || []).length;
      if (stars) return stars;
    }
  }
  return null;
}

export function parseTally(payload: unknown): ParsedReview | null {
  const root = payload as Record<string, unknown> | null;
  const d = root?.data as Record<string, unknown> | undefined;
  if (!d || !Array.isArray(d.fields)) return null;
  const fields = (d.fields as Record<string, unknown>[]).map(resolveField);
  return {
    submissionId: (d.submissionId as string) ?? (d.responseId as string) ?? null,
    respondentId: (d.respondentId as string) ?? null,
    formName: (d.formName as string) ?? null,
    rating: extractRating(fields),
    fields,
    submittedAt: (d.createdAt as string) ?? (root?.createdAt as string) ?? null,
  };
}

export async function insertReview(r: ParsedReview, raw: unknown): Promise<void> {
  await sql`
    INSERT INTO reviews
      (submission_id, respondent_id, form_name, rating, fields, submitted_at, raw)
    VALUES
      (${r.submissionId}, ${r.respondentId}, ${r.formName}, ${r.rating},
       ${JSON.stringify(r.fields)}::jsonb, ${r.submittedAt}, ${JSON.stringify(raw)}::jsonb)
    ON CONFLICT (submission_id) DO NOTHING
  `;
}

export async function getReviews(): Promise<ReviewsSummary> {
  const rows = (await sql`
    SELECT rating, fields, submitted_at::text AS submitted_at
    FROM reviews
    ORDER BY submitted_at DESC NULLS LAST
    LIMIT 200
  `) as Record<string, unknown>[];

  const reviews: Review[] = rows.map((r) => ({
    rating: r.rating == null ? null : Number(r.rating),
    fields: (r.fields as ResolvedField[]) ?? [],
    submittedAt: (r.submitted_at as string) ?? null,
  }));

  const rated = reviews.map((r) => r.rating).filter((x): x is number => x != null);
  const avgRating = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
  const maxRating = Math.max(4, ...rated); // l'échelle du formulaire est /4

  return { count: reviews.length, avgRating, maxRating, reviews };
}
