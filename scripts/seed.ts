/**
 * Insère des évènements de démo étalés sur plusieurs jours/mois, pour visualiser
 * le dashboard sans attendre de vrais webhooks. `pnpm seed`.
 * Passe par parseEvent + insertEvent (même chemin que le webhook réel).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { parseEvent } from "../lib/events";
import { insertEvent } from "../lib/db";

const COURSE = { id: 150428, title: "Claude Code pour les équipes Produit" };
const LESSONS = [
  { id: 150431, title: "Épisode 1 : Installe Claude Desktop et prend en main Claude Code" },
  { id: 150432, title: "Épisode 2 : Tes premiers prompts utiles" },
  { id: 150433, title: "Épisode 3 : Automatiser une tâche récurrente" },
  { id: 150434, title: "Épisode 4 : Mettre Claude Code en production" },
];

function startedEvent(memberId: number, date: string) {
  return {
    event: "mpca-course-started",
    type: "member",
    data: {
      id: memberId,
      email: `member${memberId}@example.com`,
      display_name: `Membre ${memberId}`,
      course: { ...COURSE, started: date, completed: "0000-00-00 00:00" },
    },
  };
}

function lessonEvent(memberId: number, lessonIdx: number, date: string) {
  return {
    event: "mpca-lesson-completed",
    type: "member",
    data: {
      id: memberId,
      email: `member${memberId}@example.com`,
      display_name: `Membre ${memberId}`,
      course: { ...COURSE, started: date, completed: "0000-00-00 00:00" },
      lesson: { ...LESSONS[lessonIdx], started: date, completed: date },
    },
  };
}

function completedEvent(memberId: number, date: string) {
  return {
    event: "mpca-course-completed",
    type: "member",
    data: {
      id: memberId,
      email: `member${memberId}@example.com`,
      display_name: `Membre ${memberId}`,
      course: { ...COURSE, started: date, completed: date },
    },
  };
}

async function push(payload: unknown) {
  const parsed = parseEvent(payload);
  if (parsed) await insertEvent(parsed, payload);
}

async function main() {
  // 18 membres répartis sur mai et juin 2026.
  const days = [
    "2026-05-04", "2026-05-04", "2026-05-11", "2026-05-19", "2026-05-26",
    "2026-06-01", "2026-06-02", "2026-06-08", "2026-06-08", "2026-06-15",
    "2026-06-16", "2026-06-18", "2026-06-22", "2026-06-23", "2026-06-24",
    "2026-06-25", "2026-06-26", "2026-06-26",
  ];

  let member = 1000;
  for (let i = 0; i < days.length; i++) {
    const m = member++;
    const start = `${days[i]} 09:${(10 + i).toString().padStart(2, "0")}:00`;
    await push(startedEvent(m, start));

    // Entonnoir décroissant : tout le monde fait l'épisode 1, de moins en moins ensuite.
    const reach = Math.max(1, LESSONS.length - (i % (LESSONS.length + 1)));
    for (let l = 0; l < reach; l++) {
      await push(lessonEvent(m, l, `${days[i]} 1${l}:00:00`));
    }
    if (reach === LESSONS.length) {
      await push(completedEvent(m, `${days[i]} 18:00:00`));
    }
  }

  console.log("✅ Données de démo insérées.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
