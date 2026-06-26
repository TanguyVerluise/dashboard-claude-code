import { FunnelStep } from "@/lib/db";

export default function LessonFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = steps.reduce((m, s) => Math.max(m, s.members), 0);

  return (
    <div className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <h2 className="text-base font-semibold text-ink mb-4">
        Progression par leçon (entonnoir)
      </h2>

      {steps.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-muted text-sm">
          Aucune leçon complétée pour le moment.
        </div>
      ) : (
        <ul className="space-y-3">
          {steps.map((s) => {
            const pct = max ? Math.round((s.members / max) * 100) : 0;
            const label = s.episode != null ? `Épisode ${s.episode}` : s.title;
            return (
              <li key={`${s.lessonId}-${s.title}`}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-sm text-ink truncate" title={s.title}>
                    {label}
                  </span>
                  <span className="text-sm font-semibold text-ink tabular-nums shrink-0">
                    {s.members}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
