import type { Metadata } from "next";
import Reviews from "@/components/Reviews";
import TechCourseChart from "@/components/TechCourseChart";
import {
  getTechCourseReviews,
  getTechCourseStats,
  type TechCourseStats,
  type TechLessonStat,
  type TechModule,
} from "@/lib/tech-course";
import type { ReviewsSummary } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export const metadata: Metadata = {
  title: "Les fondamentaux tech pour les Products",
  description: "Suivi des inscriptions, de la complétion par module et des avis de la formation.",
  robots: { index: false, follow: false },
};

const formatNumber = (value: number) => value.toLocaleString("fr-FR");

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function ModuleCard({ module, enrolled }: { module: TechModule; enrolled: number }) {
  return (
    <article className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <div className="text-sm text-muted">Module {module.order}</div>
      <h3 className="mt-1 text-base font-semibold text-ink">{module.name}</h3>
      <div className="mt-3 text-4xl font-semibold text-ink tabular-nums">
        {module.completionPct}&#8239;%
      </div>
      <div
        className="mt-3 h-2.5 rounded-full bg-black/5 overflow-hidden"
        role="img"
        aria-label={`${module.completionPct} % des inscrits ont terminé le module ${module.order}`}
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.min(100, module.completionPct)}%` }}
        />
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted">Terminé</dt>
          <dd className="text-ink tabular-nums">
            {formatNumber(module.completed)} sur {formatNumber(enrolled)} inscrits
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Commencé</dt>
          <dd className="text-ink tabular-nums">{formatNumber(module.started)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Épisodes</dt>
          <dd className="text-ink tabular-nums">{module.episodes}</dd>
        </div>
      </dl>
    </article>
  );
}

function LessonProgress({ lessons }: { lessons: TechLessonStat[] }) {
  const groups = [...new Set(lessons.map((lesson) => lesson.group))];
  return (
    <details open className="group rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <summary className="flex items-center justify-between cursor-pointer list-none select-none">
        <h2 className="text-base font-semibold text-ink">Progression par leçon</h2>
        <span className="text-muted text-xs transition-transform group-open:rotate-180">▼</span>
      </summary>
      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          <div key={group}>
            <h3 className="text-xs font-medium text-muted mb-2">{group}</h3>
            <ul className="space-y-3">
              {lessons
                .filter((lesson) => lesson.group === group)
                .map((lesson) => (
                  <li key={lesson.id}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-sm text-ink min-w-0">
                        {lesson.label}
                        {lesson.premium && (
                          <span className="ml-2 inline-block rounded-full border border-black/10 px-1.5 text-[11px] text-muted">
                            Premium
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-ink tabular-nums shrink-0">
                        <span className="font-semibold">{formatNumber(lesson.learners)}</span>
                        <span className="text-muted">&nbsp;· {lesson.sharePct}&#8239;%</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-black/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, lesson.sharePct)}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function TechFundamentalsPage() {
  let stats: TechCourseStats | null = null;
  let reviews: ReviewsSummary | null = null;

  try {
    [stats, reviews] = await Promise.all([getTechCourseStats(), getTechCourseReviews()]);
  } catch (error) {
    console.error("[tech-course] stats failed", error);
  }

  const rating =
    reviews?.avgRating != null
      ? reviews.avgRating.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : "À venir";
  const reviewCount = reviews?.count ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Les fondamentaux tech pour les Products</h1>
        <p className="text-muted mt-1">
          Suivi des inscriptions, de la complétion par module et des avis. Modules 1 et 2 en ligne.
        </p>
      </header>

      {!stats ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          Les données sont momentanément indisponibles. Réessaie dans quelques minutes.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Chiffres clés">
            <Kpi label="Inscrits (cours démarré)" value={formatNumber(stats.enrolled)} hint="Comptes internes exclus" />
            <Kpi
              label="Leçons suivies"
              value={formatNumber(stats.lessonsFollowed)}
              hint={`${formatNumber(stats.activeLearners)} avec au moins une leçon terminée`}
            />
            <Kpi
              label="Note moyenne sur 4"
              value={rating}
              hint={reviews ? `${formatNumber(reviewCount)} ${reviewCount > 1 ? "avis complets" : "avis complet"}` : "Avis indisponibles"}
            />
          </section>

          <section aria-labelledby="modules-title">
            <h2 id="modules-title" className="text-base font-semibold text-ink mb-3">
              Complétion par module
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.modules.map((module) => (
                <ModuleCard key={module.order} module={module} enrolled={stats.enrolled} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted max-w-3xl">
              Un module est terminé quand tous ses épisodes le sont. Les épisodes marqués Premium sont
              réservés aux abonnés&nbsp;: un inscrit sans abonnement ne peut donc pas terminer un module.
            </p>
          </section>

          <TechCourseChart daily={stats.daily} monthly={stats.monthly} />

          {reviews ? (
            <Reviews
              data={reviews}
              title="Avis sur les modules 1 et 2"
              emptyMessage="Aucun avis pour le moment. Ils apparaîtront ici dès la première réponse au formulaire."
            />
          ) : (
            <div className="rounded-xl bg-card border border-black/5 p-5 text-sm text-muted shadow-sm">
              Les avis sont momentanément indisponibles.
            </div>
          )}

          <LessonProgress lessons={stats.lessons} />
        </div>
      )}

      <footer className="mt-10 text-xs text-muted">
        Données issues de MemberPress Courses et du formulaire d&apos;avis&nbsp;· agrégats anonymisés, sans
        adresse email.
      </footer>
    </main>
  );
}
