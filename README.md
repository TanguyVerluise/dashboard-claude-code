# Dashboard — Formation Claude Code

Dashboard public qui visualise l'adoption de la formation **Claude Code** (MemberPress Courses), **jour par jour et mois par mois** :

- inscrits (cours démarré), formation terminée, taux de complétion ;
- courbe des inscriptions / complétions dans le temps (toggle Jour / Mois) ;
- entonnoir de progression leçon par leçon (Épisode 1 → n).

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · Neon Postgres · Recharts · pnpm.

## Comment ça marche

MemberPress Courses envoie un webhook (push) à chaque évènement :

| Évènement MemberPress   | `event_type`       | Date utilisée            |
| ----------------------- | ------------------ | ------------------------ |
| `mpca-course-started`   | `course_started`   | `data.course.started`    |
| `mpca-lesson-completed` | `lesson_completed` | `data.lesson.completed`  |
| `mpca-course-completed` | `course_completed` | `data.course.completed`  |

`POST /api/webhook` enregistre chaque évènement (dédup idempotente) dans la table `events`.
Le dashboard dérive tous les agrégats en SQL — aucune donnée personnelle n'est affichée.

## Démarrage local

```bash
pnpm install
cp .env.example .env.local   # renseigner DATABASE_URL (Neon) + WEBHOOK_SECRET
pnpm init-db                 # crée la table + index
pnpm seed                    # (optionnel) données de démo
pnpm dev
```

Tester le webhook :

```bash
curl -X POST "http://localhost:3000/api/webhook?token=$WEBHOOK_SECRET" \
  -H 'content-type: application/json' \
  -d '{"event":"mpca-course-started","type":"member","data":{"id":45,"email":"a@b.c","display_name":"Test","course":{"id":150428,"title":"Claude Code","started":"2026-06-26 12:35:20","completed":"0000-00-00 00:00"}}}'
```

## Déploiement (Vercel)

1. `vercel link` puis ajouter l'intégration **Neon** (Marketplace) → fournit `DATABASE_URL`.
2. `vercel env add WEBHOOK_SECRET` (production + preview).
3. Déployer, puis `pnpm init-db` une fois contre la base de prod.
4. Dans MemberPress (**Developer Tools → Webhooks**), pointer l'URL :
   `https://<app>.vercel.app/api/webhook?token=<WEBHOOK_SECRET>` et activer les évènements course/lesson.

## Limite connue

Le webhook ne capture que les évènements **à partir de sa mise en service**. L'historique antérieur
peut être importé séparément (export MemberPress Courses → script d'insertion dans `events`).
