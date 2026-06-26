// Parsing défensif des payloads webhook MemberPress Courses.
//
// 3 évènements gérés :
//   mpca-course-started    -> course_started    (occurred_at = data.course.started)
//   mpca-lesson-completed  -> lesson_completed  (occurred_at = data.lesson.completed)
//   mpca-course-completed  -> course_completed  (occurred_at = data.course.completed)

export type EventType = "course_started" | "lesson_completed" | "course_completed";

export interface ParsedEvent {
  eventType: EventType;
  memberId: number | null;
  memberEmail: string | null;
  memberName: string | null;
  courseId: number | null;
  courseTitle: string | null;
  lessonId: number | null;
  lessonTitle: string | null;
  /** Wall-clock MemberPress "YYYY-MM-DD HH:MM:SS" (Europe/Paris), stocké tel quel. */
  occurredAt: string;
}

const EVENT_MAP: Record<string, EventType> = {
  "mpca-course-started": "course_started",
  "mpca-lesson-completed": "lesson_completed",
  "mpca-course-completed": "course_completed",
};

/** "2026-06-26 12:35:20" -> normalisé, ou null si vide / "0000-00-00..." / invalide. */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.startsWith("0000-00-00")) return null;
  // Accepte "YYYY-MM-DD HH:MM:SS" ou "YYYY-MM-DD HH:MM" (et variante avec "T").
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d} ${h}:${mi}:${s ?? "00"}`;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toName(data: Record<string, unknown>): string | null {
  if (typeof data.display_name === "string" && data.display_name.trim())
    return data.display_name.trim();
  const parts = [data.first_name, data.last_name]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  return parts.length ? parts.join(" ") : null;
}

/**
 * Convertit un payload brut en ParsedEvent, ou null s'il est inexploitable
 * (type d'évènement inconnu, ou date de référence absente/invalide).
 */
export function parseEvent(payload: unknown): ParsedEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const eventType = EVENT_MAP[String(root.event)];
  if (!eventType) return null;

  const data = (root.data ?? {}) as Record<string, unknown>;
  const course = (data.course ?? {}) as Record<string, unknown>;
  const lesson = (data.lesson ?? {}) as Record<string, unknown>;

  let occurredAt: string | null = null;
  if (eventType === "course_started") occurredAt = normalizeDate(course.started);
  else if (eventType === "course_completed") occurredAt = normalizeDate(course.completed);
  else if (eventType === "lesson_completed") occurredAt = normalizeDate(lesson.completed);

  if (!occurredAt) return null;

  return {
    eventType,
    memberId: toNumber(data.id),
    memberEmail: typeof data.email === "string" ? data.email : null,
    memberName: toName(data),
    courseId: toNumber(course.id),
    courseTitle: typeof course.title === "string" ? course.title : null,
    lessonId: eventType === "lesson_completed" ? toNumber(lesson.id) : null,
    lessonTitle:
      eventType === "lesson_completed" && typeof lesson.title === "string"
        ? lesson.title
        : null,
    occurredAt,
  };
}

/** Extrait le numéro d'épisode depuis un titre "Épisode N : ...". null sinon. */
export function episodeNumber(title: string | null): number | null {
  if (!title) return null;
  const m = title.match(/[ÉE]pisode\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}
