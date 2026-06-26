import { ReviewsSummary, ResolvedField } from "@/lib/reviews";

function Stars({ value, max }: { value: number; max: number }) {
  return (
    <span className="text-brand" title={`${value}/${max}`}>
      {"★".repeat(Math.max(0, Math.min(value, max)))}
      <span className="text-black/15">{"★".repeat(Math.max(0, max - value))}</span>
    </span>
  );
}

function formatDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Paris" });
}

function fieldValue(v: ResolvedField["value"]): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export default function Reviews({ data }: { data: ReviewsSummary }) {
  const { count, avgRating, maxRating, reviews } = data;

  return (
    <div className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-ink">Avis sur la formation</h2>
        {count > 0 && avgRating != null && (
          <div className="flex items-center gap-2 text-sm">
            <Stars value={Math.round(avgRating)} max={maxRating} />
            <span className="font-semibold text-ink tabular-nums">
              {avgRating.toFixed(1)}/{maxRating}
            </span>
            <span className="text-muted">· {count} avis</span>
          </div>
        )}
      </div>

      {count === 0 ? (
        <div className="h-24 flex items-center justify-center text-muted text-sm">
          Aucun avis pour le moment — ils apparaîtront ici dès la première réponse au formulaire.
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r, i) => (
            <li key={i} className="rounded-lg border border-black/5 bg-surface/60 p-4">
              <div className="flex items-center justify-between mb-3">
                {r.rating != null ? (
                  <Stars value={r.rating} max={maxRating} />
                ) : (
                  <span className="text-xs text-muted">Sans note</span>
                )}
                <span className="text-xs text-muted">{formatDate(r.submittedAt)}</span>
              </div>
              <dl className="space-y-2">
                {r.fields.map((f, j) => (
                  <div key={j}>
                    <dt className="text-xs text-muted">{f.label}</dt>
                    <dd className="text-sm text-ink whitespace-pre-line">{fieldValue(f.value)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
