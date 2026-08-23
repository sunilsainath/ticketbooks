"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import ManagerDashboard from "./manager-dashboard";
import EmployeeDashboard from "./employee-dashboard";

export default function DashboardPage() {
  const [view, setView] = useState<"manager" | "employee" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ view: "manager" | "employee" }>("/api/dashboard")
      .then((d) => setView(d.view))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!view) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  return view === "manager" ? <ManagerDashboard /> : <EmployeeDashboard />;
}
