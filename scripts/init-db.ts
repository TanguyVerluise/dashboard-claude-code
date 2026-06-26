/**
 * Crée la table `events` et son index d'idempotence.
 * Lancer une fois : `pnpm init-db` (lit DATABASE_URL depuis .env.local).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant (.env.local).");
  process.exit(1);
}
const sql = neon(url);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id            bigserial PRIMARY KEY,
      event_type    text        NOT NULL,
      member_id     bigint,
      member_email  text,
      member_name   text,
      course_id     bigint,
      course_title  text,
      lesson_id     bigint,
      lesson_title  text,
      occurred_at   timestamp   NOT NULL,
      received_at   timestamptz NOT NULL DEFAULT now(),
      raw           jsonb,
      source_key    text
    )
  `;

  // Pour les tables déjà créées : ajoute la colonne d'idempotence du backfill.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS source_key text`;

  // Idempotence du backfill (1 ligne par message source, ex: Gmail message id).
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS events_source_key_idx
    ON events (source_key) WHERE source_key IS NOT NULL
  `;

  // Idempotence : un même évènement renvoyé deux fois ne crée qu'une ligne.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS events_dedup_idx
    ON events (event_type, member_id, course_id, COALESCE(lesson_id, 0), occurred_at)
  `;

  // Index d'agrégation pour les séries temporelles.
  await sql`CREATE INDEX IF NOT EXISTS events_type_time_idx ON events (event_type, occurred_at)`;

  console.log("✅ Schéma prêt (table events + index).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
