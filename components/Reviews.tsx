"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ReviewsSummary, ResolvedField, Review } from "@/lib/reviews";

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

function time(s: string | null): number {
  if (!s) return -Infinity;
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return isNaN(d.getTime()) ? -Infinity : d.getTime();
}

function Arrow({
  dir,
  onClick,
  disabled,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Avis précédent" : "Avis suivant"}
      className="h-7 w-7 shrink-0 rounded-full border border-black/10 bg-card text-ink/70 text-xs leading-none flex items-center justify-center transition hover:bg-surface hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {dir === "prev" ? "‹" : "›"}
    </button>
  );
}

function ReviewCard({ review, maxRating }: { review: Review; maxRating: number }) {
  return (
    <div className="min-w-0 min-h-[9rem] rounded-lg border border-black/5 bg-surface/60 p-4">
      <div className="flex items-center justify-between mb-3">
        {review.rating != null ? (
          <Stars value={review.rating} max={maxRating} />
        ) : (
          <span className="text-xs text-muted">Sans note</span>
        )}
        <span className="text-xs text-muted">{formatDate(review.submittedAt)}</span>
      </div>
      <dl className="space-y-2">
        {review.fields.map((f, j) => (
          <div key={j}>
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="text-sm text-ink whitespace-pre-line break-words">{fieldValue(f.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * 2 avis côte à côte quand le carrousel est assez large (desktop), 1 seul sinon.
 * Basé sur la largeur réelle du conteneur (ResizeObserver) plutôt que sur celle
 * de la fenêtre : le composant reste correct quel que soit son emplacement.
 */
function usePerPage(ref: React.RefObject<HTMLDivElement | null>): number {
  const [perPage, setPerPage] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setPerPage(entry.contentRect.width >= 520 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return perPage;
}

export default function Reviews({ data }: { data: ReviewsSummary }) {
  const { count, avgRating, maxRating } = data;

  // Le plus récent en premier.
  const reviews = useMemo<Review[]>(
    () => [...data.reviews].sort((a, b) => time(b.submittedAt) - time(a.submittedAt)),
    [data.reviews]
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const perPage = usePerPage(rootRef);
  const pageCount = Math.max(1, Math.ceil(reviews.length / perPage));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * perPage;
  const visible = reviews.slice(start, start + perPage);

  const go = (delta: number) => setPage(Math.max(0, Math.min(pageCount - 1, safePage + delta)));

  return (
    <div ref={rootRef} className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
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

      {count === 0 || visible.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-muted text-sm">
          Aucun avis pour le moment — ils apparaîtront ici dès la première réponse au formulaire.
        </div>
      ) : (
        <div>
          <div
            className="flex items-center gap-3"
            role="group"
            aria-roledescription="carrousel"
            aria-label="Avis sur la formation"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                go(-1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                go(1);
              }
            }}
          >
            <Arrow dir="prev" onClick={() => go(-1)} disabled={safePage === 0} />

            {/* Grille : les colonnes restent égales même si la dernière page est incomplète. */}
            <div
              key={safePage}
              aria-live="polite"
              className="flex-1 min-w-0 grid items-stretch gap-3"
              style={{ gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))` }}
            >
              {visible.map((r, i) => (
                <ReviewCard key={start + i} review={r} maxRating={maxRating} />
              ))}
            </div>

            <Arrow dir="next" onClick={() => go(1)} disabled={safePage >= pageCount - 1} />
          </div>

          <div className="mt-3 flex items-center justify-center gap-3">
            <div className={`items-center gap-1.5 ${pageCount > 12 ? "hidden" : "flex"}`}>
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === safePage}
                  className={`h-1.5 rounded-full transition-all ${
                    i === safePage ? "w-4 bg-brand" : "w-1.5 bg-black/15 hover:bg-black/30"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted tabular-nums">
              {visible.length > 1 ? `${start + 1}–${start + visible.length}` : start + 1}/
              {reviews.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
