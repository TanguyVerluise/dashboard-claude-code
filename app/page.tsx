import KpiCards from "@/components/KpiCards";
import EnrollmentChart from "@/components/EnrollmentChart";
import LessonFunnel from "@/components/LessonFunnel";
import {
  getKpis,
  getTimeSeries,
  getLessonFunnel,
  type Kpis,
  type SeriesPoint,
  type FunnelStep,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  let kpis: Kpis | null = null;
  let daily: SeriesPoint[] = [];
  let monthly: SeriesPoint[] = [];
  let funnel: FunnelStep[] = [];
  let error: string | null = null;

  try {
    [kpis, daily, monthly, funnel] = await Promise.all([
      getKpis(),
      getTimeSeries("day"),
      getTimeSeries("month"),
      getLessonFunnel(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Erreur inconnue";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Formation Claude Code</h1>
        <p className="text-muted mt-1">
          Suivi des inscriptions et de la progression — jour par jour et mois par mois.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Base de données indisponible.</p>
          <p className="mt-1">
            Vérifie <code>DATABASE_URL</code> et lance <code>pnpm init-db</code>.
          </p>
          <p className="mt-2 text-amber-700/80 break-all">{error}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {kpis && <KpiCards kpis={kpis} />}
          <EnrollmentChart daily={daily} monthly={monthly} />
          <LessonFunnel steps={funnel} />
        </div>
      )}

      <footer className="mt-10 text-xs text-muted">
        Données issues des webhooks MemberPress Courses · agrégats anonymisés.
      </footer>
    </main>
  );
}
