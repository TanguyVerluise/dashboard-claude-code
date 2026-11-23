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
import type { TechSeriesPoint } from "@/lib/tech-course";

function formatBucket(bucket: string, granularity: "day" | "month"): string {
  const date = new Date(`${bucket}T00:00:00Z`);
  if (granularity === "month") {
    return date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export default function TechCourseChart({
  daily,
  monthly,
}: {
  daily: TechSeriesPoint[];
  monthly: TechSeriesPoint[];
}) {
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const data = (granularity === "day" ? daily : monthly).map((point) => ({
    label: formatBucket(point.bucket, granularity),
    Inscriptions: point.enrollments,
    "Module 1 terminé": point.module1,
    "Module 2 terminé": point.module2,
  }));

  return (
    <section className="rounded-xl bg-card border border-black/5 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-ink">
          Inscriptions et modules terminés dans le temps
        </h2>
        <div className="inline-flex rounded-lg border border-black/10 p-0.5 text-sm">
          {(["day", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={granularity === value}
              onClick={() => setGranularity(value)}
              className={`px-3 py-1 rounded-md transition-colors ${
                granularity === value ? "bg-brand text-white" : "text-muted hover:text-ink"
              }`}
            >
              {value === "day" ? "Jour" : "Mois"}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-[320px] flex items-center justify-center text-muted text-sm">
          Aucune inscription pour le moment.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Inscriptions" fill="#d97757" radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Bar dataKey="Module 1 terminé" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Bar dataKey="Module 2 terminé" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
