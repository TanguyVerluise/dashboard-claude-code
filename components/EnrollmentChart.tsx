"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { SeriesPoint } from "@/lib/db";

function formatBucket(bucket: string, g: "day" | "month"): string {
  const d = new Date(`${bucket}T00:00:00Z`);
  if (g === "month") {
    return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export default function EnrollmentChart({
  daily,
  monthly,
}: {
  daily: SeriesPoint[];
  monthly: SeriesPoint[];
}) {
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const data = (granularity === "day" ? daily : monthly).map((p) => ({
    label: formatBucket(p.bucket, granularity),
    Inscriptions: p.started,
    Terminées: p.completed,
  }));

  return (
    <div className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-ink">
          Inscriptions &amp; complétions dans le temps
        </h2>
        <div className="inline-flex rounded-lg border border-black/10 p-0.5 text-sm">
          {(["day", "month"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1 rounded-md transition-colors ${
                granularity === g ? "bg-brand text-white" : "text-muted hover:text-ink"
              }`}
            >
              {g === "day" ? "Jour" : "Mois"}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Inscriptions" fill="#d97757" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Terminées" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-[320px] flex items-center justify-center text-muted text-sm">
      Aucune donnée pour le moment — les évènements apparaîtront ici dès le premier webhook reçu.
    </div>
  );
}
