"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  Bar as RBar, BarChart, PieChart, Pie, Cell,
} from "recharts";
import { api } from "@/lib/client";
import { Select, Skeleton } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { tooltipStyle } from "../dashboard/manager-dashboard";

const REPORTS = [
  { key: "overview", label: "Overview" },
  { key: "workload", label: "Workload by employee" },
  { key: "created-completed", label: "Created vs completed" },
  { key: "aging", label: "Aging report" },
];

export default function ReportsPage() {
  const [type, setType] = useState("overview");
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const d = await api<{ rows: Record<string, unknown>[] }>(`/api/reports?type=${type}&days=${days}`);
      setRows(d.rows);
    } catch {
      setRows([]);
    }
  }, [type, days]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = () => {
    window.location.href = `/api/reports?type=${type}&days=${days}&export=csv`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight"><BarChart3 className="h-5 w-5 text-primary" /> Reports</h1>
        <div className="ml-auto flex items-center gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-56" aria-label="Report type">
            {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-36" aria-label="Period">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
          <Button variant="secondary" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
        </div>
      </div>

      {!rows ? (
        <Skeleton className="h-80" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No data for this period.</p>
      ) : type === "created-completed" ? (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Created vs completed - last {days} days</h2>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={26} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="created" name="Created" stroke="#3f3f46" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completed" name="Completed" stroke="#a1a1aa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      ) : type === "overview" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {rows.filter((r) => String(r.metric).startsWith("Status:")).map((r) => <MiniStat key={String(r.metric)} label={String(r.metric).replace("Status: ", "")} value={Number(r.count)} />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Tickets by employee</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={rows.filter((r) => String(r.metric).startsWith("Assignee:")).map((r) => ({ name: String(r.metric).replace("Assignee: ", ""), count: Number(r.count) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-20} height={44} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={26} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <RBar dataKey="count" fill="#3f3f46" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Priority split (all tickets)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={rows.filter((r) => String(r.metric).startsWith("Priority:")).map((r) => ({ name: String(r.metric).replace("Priority: ", ""), count: Number(r.count), fill: ["#b91c1c", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488"].find((_, i, arr) => true) ?? "#64748b" }))} dataKey="count" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} strokeWidth={0}
                    // colors per priority
                  >
                    {(rows.filter((r) => String(r.metric).startsWith("Priority:"))).map((r, i) => (
                      <Cell key={i} fill={["#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#64748b"][i % 6]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </section>
            <SummaryTable rows={rows.filter((r) => ["Total tickets", "Completion rate %", "Reopened tickets"].includes(String(r.metric)))} />
          </div>
        </>
      ) : (
        <section className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                {Object.keys(rows[0]).map((k) => <th key={k} className="px-4 py-2.5 font-medium capitalize">{k.replace(/([A-Z])/g, " $1")}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-muted/50">
                  {Object.values(r).map((v, j) => <td key={j} className={"px-4 py-2.5 " + (typeof v === "number" ? "tabular-nums" : "")}>{v === null || v === "" || v === undefined ? "-" : String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SummaryTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm md:col-span-2 lg:col-span-2">
      <table className="w-full text-left text-sm">
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={String(r.metric)}>
              <td className="px-4 py-3 font-medium">{String(r.metric)}</td>
              <td className="px-4 py-3 text-right text-lg font-bold tabular-nums">{String(r.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
