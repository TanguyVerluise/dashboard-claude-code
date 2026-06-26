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

### Authentification du webhook

MemberPress envoie sa **Webhook Key** dans le header `memberpress-webhook-key`
(MemberPress → Developers → Webhooks). L'endpoint la valide via `MEMBERPRESS_WEBHOOK_KEY`.
Pour les tests manuels, un `WEBHOOK_SECRET` est aussi accepté (`?token=` ou header `x-webhook-secret`).

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
2. `vercel env add MEMBERPRESS_WEBHOOK_KEY` (la clé copiée depuis MemberPress) + éventuellement `WEBHOOK_SECRET`.
3. Déployer, puis `pnpm init-db` une fois contre la base de prod.
4. Dans MemberPress (**Developers → Webhooks**), pointer l'URL `https://<app>.vercel.app/api/webhook`
   (pas besoin de `?token=` : MemberPress envoie sa clé dans le header) et activer les évènements course/lesson.

## Limite connue

Le webhook ne capture que les évènements **à partir de sa mise en service**. L'historique antérieur
peut être importé séparément (export MemberPress Courses → script d'insertion dans `events`).
