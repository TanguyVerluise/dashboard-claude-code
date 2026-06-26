import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Client Neon initialisé paresseusement : évite de lire DATABASE_URL au moment
// de l'import (les imports ESM sont hoistés avant dotenv dans les scripts).
let _sql: NeonQueryFunction<false, false> | null = null;

export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql(strings, ...values);
}
