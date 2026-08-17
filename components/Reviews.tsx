"use client";

import { useMemo, useState } from "react";
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

export default function Reviews({ data }: { data: ReviewsSummary }) {
  const { count, avgRating, maxRating } = data;

  // Le plus récent en premier.
  const reviews = useMemo<Review[]>(
    () => [...data.reviews].sort((a, b) => time(b.submittedAt) - time(a.submittedAt)),
    [data.reviews]
  );

  const [index, setIndex] = useState(0);
  const current = reviews[Math.min(index, reviews.length - 1)];

  const go = (delta: number) =>
    setIndex((i) => Math.max(0, Math.min(reviews.length - 1, i + delta)));

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

      {count === 0 || !current ? (
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
            <Arrow dir="prev" onClick={() => go(-1)} disabled={index === 0} />

            <div
              key={index}
              aria-live="polite"
              className="flex-1 min-w-0 min-h-[9rem] rounded-lg border border-black/5 bg-surface/60 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                {current.rating != null ? (
                  <Stars value={current.rating} max={maxRating} />
                ) : (
                  <span className="text-xs text-muted">Sans note</span>
                )}
                <span className="text-xs text-muted">{formatDate(current.submittedAt)}</span>
              </div>
              <dl className="space-y-2">
                {current.fields.map((f, j) => (
                  <div key={j}>
                    <dt className="text-xs text-muted">{f.label}</dt>
                    <dd className="text-sm text-ink whitespace-pre-line">{fieldValue(f.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Arrow dir="next" onClick={() => go(1)} disabled={index >= reviews.length - 1} />
          </div>

          <div className="mt-3 flex items-center justify-center gap-3">
            <div className={`items-center gap-1.5 ${reviews.length > 12 ? "hidden" : "flex"}`}>
              {reviews.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Avis ${i + 1}`}
                  aria-current={i === index}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-4 bg-brand" : "w-1.5 bg-black/15 hover:bg-black/30"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted tabular-nums">
              {index + 1}/{reviews.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
