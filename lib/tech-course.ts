import { unstable_cache } from "next/cache";
import type { ResolvedField, Review, ReviewsSummary } from "./reviews";
import { sql } from "./sql";

// Dashboard of the "Les fondamentaux tech pour les Products" course.
// Only aggregates leave this file: no member id, name or email reaches the page.

const COURSE_ID = 151786;
const REVIEWS_CACHE_SECONDS = 300;

export interface TechLesson {
  id: number;
  group: string;
  moduleOrder: number | null;
  label: string;
  premium: boolean;
}

const MODULE_1 = "Anatomie d'une app web";
const MODULE_2 = "Git et GitHub";

const LESSONS: TechLesson[] = [
  { id: 151788, group: "Introduction", moduleOrder: null, label: "Ce que tu vas apprendre dans cette formation", premium: false },
  { id: 151789, group: `Module 1 · ${MODULE_1}`, moduleOrder: 1, label: "Épisode 1 : Naviguer sur une app web : client, serveur, DNS", premium: false },
  { id: 151790, group: `Module 1 · ${MODULE_1}`, moduleOrder: 1, label: "Épisode 2 : Structure du code d'une application", premium: true },
  { id: 151792, group: `Module 1 · ${MODULE_1}`, moduleOrder: 1, label: "Épisode 3 : Où tourne le code ? Serveurs et hébergement", premium: true },
  { id: 151793, group: `Module 2 · ${MODULE_2}`, moduleOrder: 2, label: "Épisode 1 : Développement en local vs cloud : où est modifié le code ?", premium: false },
  { id: 151794, group: `Module 2 · ${MODULE_2}`, moduleOrder: 2, label: "Épisode 2 : Introduction à Git, GitHub et au versioning", premium: true },
  { id: 151795, group: `Module 2 · ${MODULE_2}`, moduleOrder: 2, label: "Épisode 3 : Votre premier commit sur GitHub", premium: true },
  { id: 151796, group: `Module 2 · ${MODULE_2}`, moduleOrder: 2, label: "Épisode 4 : Travailler avec des branches et des pull requests", premium: true },
  { id: 151797, group: `Module 2 · ${MODULE_2}`, moduleOrder: 2, label: "Épisode 5 : Pour aller plus loin : workflows Git avancés", premium: true },
  { id: 151821, group: "Fin des modules 1 et 2", moduleOrder: null, label: "Ton avis sur les modules 1 et 2", premium: true },
];

const MODULES = [
  { order: 1, name: MODULE_1 },
  { order: 2, name: MODULE_2 },
];

export interface TechModule {
  order: number;
  name: string;
  episodes: number;
  started: number;
  completed: number;
  completionPct: number;
}

export interface TechLessonStat extends TechLesson {
  learners: number;
  sharePct: number;
}

export interface TechSeriesPoint {
  bucket: string;
  enrollments: number;
  module1: number;
  module2: number;
}

export interface TechCourseStats {
  enrolled: number;
  activeLearners: number;
  lessonsFollowed: number;
  modules: TechModule[];
  lessons: TechLessonStat[];
  daily: TechSeriesPoint[];
  monthly: TechSeriesPoint[];
}

function excludedMemberIds(): number[] {
  return (process.env.TECH_COURSE_EXCLUDED_MEMBER_IDS ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

function parisDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function utcTextToParisDay(utc: string): string {
  return parisDay(new Date(`${utc.replace(" ", "T")}Z`));
}

function buildSeries(
  enrollments: string[],
  moduleDone: { order: number; day: string }[],
  granularity: "day" | "month",
): TechSeriesPoint[] {
  if (enrollments.length === 0) return [];
  const toBucket = (day: string) => (granularity === "day" ? day : `${day.slice(0, 7)}-01`);
  const points = new Map<string, TechSeriesPoint>();
  const firstDay = [...enrollments].sort()[0];
  const cursor = new Date(`${toBucket(firstDay)}T00:00:00Z`);
  const end = new Date(`${toBucket(parisDay(new Date()))}T00:00:00Z`);
  while (cursor <= end) {
    const bucket = cursor.toISOString().slice(0, 10);
    points.set(bucket, { bucket, enrollments: 0, module1: 0, module2: 0 });
    if (granularity === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  for (const day of enrollments) {
    const point = points.get(toBucket(day));
    if (point) point.enrollments += 1;
  }
  for (const done of moduleDone) {
    const point = points.get(toBucket(done.day));
    if (!point) continue;
    if (done.order === 1) point.module1 += 1;
    if (done.order === 2) point.module2 += 1;
  }
  return [...points.values()];
}

export async function getTechCourseStats(): Promise<TechCourseStats> {
  const excluded = excludedMemberIds();
  const rows = (await sql`
    SELECT event_type, member_id::text AS member, lesson_id::text AS lesson, min(occurred_at)::text AS first_at
    FROM events
    WHERE course_id = ${COURSE_ID}
      AND event_type IN ('course_started', 'lesson_completed')
      AND member_id IS NOT NULL
      AND member_id <> ALL(${excluded}::bigint[])
    GROUP BY 1, 2, 3
  `) as { event_type: string; member: string; lesson: string | null; first_at: string }[];

  const enrolledAt = new Map<string, string>();
  for (const row of rows) {
    if (row.event_type === "course_started") enrolledAt.set(row.member, row.first_at);
  }

  const knownLessons = new Set(LESSONS.map((lesson) => String(lesson.id)));
  const doneByMember = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (row.event_type !== "lesson_completed" || !row.lesson) continue;
    if (!enrolledAt.has(row.member) || !knownLessons.has(row.lesson)) continue;
    const done = doneByMember.get(row.member) ?? new Map<string, string>();
    done.set(row.lesson, row.first_at);
    doneByMember.set(row.member, done);
  }

  const enrolled = enrolledAt.size;
  const moduleDone: { order: number; day: string }[] = [];
  const modules: TechModule[] = MODULES.map((module) => {
    const episodeIds = LESSONS.filter((l) => l.moduleOrder === module.order).map((l) => String(l.id));
    let started = 0;
    let completed = 0;
    for (const done of doneByMember.values()) {
      const dates = episodeIds.map((id) => done.get(id)).filter((d): d is string => d != null);
      if (dates.length > 0) started += 1;
      if (dates.length === episodeIds.length) {
        completed += 1;
        moduleDone.push({ order: module.order, day: utcTextToParisDay([...dates].sort().at(-1)!) });
      }
    }
    return {
      order: module.order,
      name: module.name,
      episodes: episodeIds.length,
      started,
      completed,
      completionPct: pct(completed, enrolled),
    };
  });

  const lessons: TechLessonStat[] = LESSONS.map((lesson) => {
    let learners = 0;
    for (const done of doneByMember.values()) {
      if (done.has(String(lesson.id))) learners += 1;
    }
    return { ...lesson, learners, sharePct: pct(learners, enrolled) };
  });

  const enrollmentDays = [...enrolledAt.values()].map(utcTextToParisDay);
  return {
    enrolled,
    activeLearners: doneByMember.size,
    lessonsFollowed: lessons.reduce((sum, lesson) => sum + lesson.learners, 0),
    modules,
    lessons,
    daily: buildSeries(enrollmentDays, moduleDone, "day"),
    monthly: buildSeries(enrollmentDays, moduleDone, "month"),
  };
}

interface FeedReview {
  submitted_at: string | null;
  rating: number | null;
  appreciation: string | null;
  liked: string | null;
  improve: string | null;
}

const fetchReviewsFeed = unstable_cache(
  async (): Promise<FeedReview[]> => {
    const url = process.env.TECH_COURSE_REVIEWS_URL;
    if (!url) throw new Error("TECH_COURSE_REVIEWS_URL is not set");
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Reviews feed returned ${response.status}`);
    const body = (await response.json()) as { reviews?: FeedReview[] };
    if (!Array.isArray(body.reviews)) throw new Error("Unexpected reviews feed");
    return body.reviews;
  },
  ["tech-course-reviews-feed"],
  { revalidate: REVIEWS_CACHE_SECONDS },
);

export async function getTechCourseReviews(): Promise<ReviewsSummary | null> {
  let feed: FeedReview[];
  try {
    feed = await fetchReviewsFeed();
  } catch (error) {
    console.error("[tech-course] reviews feed failed", error);
    return null;
  }

  const reviews: Review[] = feed.map((row) => {
    const fields: ResolvedField[] = [];
    if (row.appreciation) fields.push({ label: "J'ai trouvé cette formation :", type: "MULTIPLE_CHOICE", value: row.appreciation });
    if (row.liked) fields.push({ label: "Qu'as-tu aimé dans cette formation ?", type: "TEXTAREA", value: row.liked });
    if (row.improve) fields.push({ label: "Comment pourrait-on améliorer cette formation ?", type: "TEXTAREA", value: row.improve });
    return { rating: row.rating, fields, submittedAt: row.submitted_at };
  });
  const rated = reviews.map((r) => r.rating).filter((r): r is number => r != null);
  return {
    count: reviews.length,
    avgRating: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    maxRating: 4,
    reviews,
  };
}
