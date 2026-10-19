import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Company } from "../api/types";
import { keys } from "../api/hooks";

interface Plan {
  slug: string;
  action: string;
  plannedName: string;
}
export interface ImportPreview {
  plan?: { companyAction?: string; agentPlans?: Plan[]; projectPlans?: Plan[] };
  manifest?: { company?: { name?: string } | null; skills?: unknown[] };
  envInputs?: { key: string; requirement: string; agentSlug?: string | null }[];
  warnings?: string[];
  errors?: string[];
  error?: string;
}

/** The preview in plain words: who and what comes in, and what needs attention. */
export function importSummary(p: ImportPreview) {
  const agents = (p.plan?.agentPlans ?? []).filter((a) => a.action !== "skip").map((a) => a.plannedName);
  const projects = (p.plan?.projectPlans ?? []).filter((a) => a.action !== "skip").map((a) => a.plannedName);
  const required = (p.envInputs ?? []).filter((e) => e.requirement === "required").map((e) => e.key);
  return {
    company: p.manifest?.company?.name ?? "Your company",
    agents,
    projects,
    skills: p.manifest?.skills?.length ?? 0,
    required,
    warnings: p.warnings ?? [],
    errors: [...(p.errors ?? []), ...(p.error ? [p.error] : [])],
  };
}

const post = async (step: "preview" | "apply", name: string) => {
  const r = await fetch(`/office-admin/company-import/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d;
};

/** On a fresh office: bring the company in from the private repo's export. */
export function ImportCompany({ onImported }: { onImported: (c: Company) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const available = useQuery({ queryKey: ["company-import"], queryFn: async () => (await (await fetch("/office-admin/company-import")).json()) as { available: boolean; path: string } });
  const preview = useMutation({ mutationFn: () => post("preview", name) as Promise<ImportPreview> });
  const apply = useMutation({
    mutationFn: () => post("apply", name) as Promise<{ company: Company }>,
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: keys.companies });
      onImported(r.company);
    },
  });

  if (!available.data?.available) return null;
  const s = preview.data ? importSummary(preview.data) : null;
  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--info)", marginTop: 10 }}>
      <h4>📦 BRING YOUR COMPANY</h4>
      <div style={{ fontSize: 16 }}>
        Found a company export in <code>{available.data.path}</code>. Import its employees, projects and skills here (tasks stay behind).
      </div>
      <label className="px-label" htmlFor="import-name">NAME (OPTIONAL, KEEPS THE EXPORT'S NAME)</label>
      <input id="import-name" className="px-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={s?.company ?? "Same as the export"} />
      {!s && (
        <button className="px-btn" disabled={preview.isPending} onClick={() => preview.mutate()}>
          {preview.isPending ? "Reading the export…" : "👀 Preview the import"}
        </button>
      )}
      {preview.error && <p style={{ color: "var(--bad)" }}>{(preview.error as Error).message}</p>}
      {s && (
        <div className="import-preview" aria-label="Import preview" style={{ fontSize: 16 }}>
          <div>
            🏢 <b>{name.trim() || s.company}</b>
          </div>
          <div>🧑‍💻 {s.agents.length} employees: {s.agents.join(", ") || "none"}</div>
          <div>📁 {s.projects.length} projects: {s.projects.join(", ") || "none"}</div>
          <div>🧩 {s.skills} skills</div>
          {s.required.length > 0 && <div style={{ color: "var(--bad)" }}>🔑 Needs values for: {s.required.join(", ")} (add them in the vault afterwards).</div>}
          {s.warnings.map((w, i) => (
            <div key={i} className="muted">⚠ {w}</div>
          ))}
          {s.errors.map((e, i) => (
            <div key={i} style={{ color: "var(--bad)" }}>✖ {e}</div>
          ))}
          <div className="muted" style={{ fontSize: 14 }}>Secrets were never exported: enter them again in the vault. Employees sign in with this machine's Claude / Copilot.</div>
          <div className="row">
            <button className="px-btn primary" disabled={apply.isPending || s.errors.length > 0} onClick={() => apply.mutate()}>
              {apply.isPending ? "Moving in…" : "📦 Import and open"}
            </button>
            <button className="px-btn" disabled={apply.isPending} onClick={() => preview.reset()}>Back</button>
          </div>
          {apply.error && <p style={{ color: "var(--bad)" }}>{(apply.error as Error).message}</p>}
        </div>
      )}
    </div>
  );
}
