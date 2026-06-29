import { Kpis } from "@/lib/db";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export default function KpiCards({ kpis }: { kpis: Kpis }) {
  const rate = Math.round(kpis.completionRate * 100);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Inscrits (cours démarré)" value={kpis.started.toLocaleString("fr-FR")} />
      <Card label="Formation terminée" value={kpis.completed.toLocaleString("fr-FR")} />
      <Card
        label="Taux de complétion"
        value={`${rate}%`}
        hint={`${kpis.lessonsFollowed.toLocaleString("fr-FR")} / ${(kpis.started * kpis.numLessons).toLocaleString("fr-FR")} leçons`}
      />
      <Card
        label="Leçons suivies"
        value={kpis.lessonsFollowed.toLocaleString("fr-FR")}
        hint="volume total de leçons suivies"
      />
    </div>
  );
}
