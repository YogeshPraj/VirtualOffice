import { useQueries } from "@tanstack/react-query";
import { api } from "../api/client";
import { SIZES, sizeStats, useSizes } from "../lib/sizes";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { duration } from "./TaskCost";

const MAX = 40;

/** Your S / M / L guesses against the time actually worked, from finished tasks. */
export function SizeVsActual() {
  const { issues } = useOfficeData();
  const open = useOffice((s) => s.open);
  const { sizes } = useSizes();
  const sized = issues
    .filter((i) => i.status === "done" && sizes[i.id])
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
    .slice(0, MAX);
  const costs = useQueries({ queries: sized.map((i) => ({ queryKey: ["issue-cost", i.id, i.updatedAt], queryFn: () => api.issueCost(i.id), staleTime: 300_000 })) });
  const rows = sized.flatMap((i, n) => {
    const c = costs[n]?.data;
    return c && c.runCount > 0 ? [{ id: i.id, identifier: i.identifier, title: i.title, size: sizes[i.id], ms: c.runtimeMs }] : [];
  });
  const { stats, longer } = sizeStats(rows);
  const loading = costs.some((c) => c.isLoading);

  return (
    <div className="px-card" aria-label="Size vs actual">
      <h4>📏 SIZE VS ACTUAL</h4>
      {!sized.length ? (
        <div className="muted">Give tasks a size (S / M / L in their details). Once they're done, this compares your guess with the time actually worked.</div>
      ) : loading ? (
        <div className="muted">Adding up the hours…</div>
      ) : (
        <>
          {stats
            .filter((s) => s.count > 0)
            .map((s) => (
              <div key={s.size} style={{ fontSize: 17 }}>
                <b>{s.size}</b>: usually {duration(s.median)} of work <span className="muted">({s.count} task{s.count === 1 ? "" : "s"})</span>
              </div>
            ))}
          {longer.length > 0 && (
            <div style={{ fontSize: 16, marginTop: 6 }}>
              Took longer than a typical {longer[0].size === "S" ? "M" : "L"}:
              {longer.map((r) => (
                <div key={r.id}>
                  <button className="link-btn" style={{ whiteSpace: "normal", textAlign: "left" }} onClick={() => open({ kind: "issue", issueId: r.id })}>
                    {r.identifier} ({r.size}, {duration(r.ms)}) {r.title}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            From the last {rows.length} finished, sized task{rows.length === 1 ? "" : "s"}. {SIZES.filter((s) => !stats.find((x) => x.size === s)?.count).join(", ") ? `No finished ${SIZES.filter((s) => !stats.find((x) => x.size === s)?.count).join("/")} tasks yet.` : ""}
          </div>
        </>
      )}
    </div>
  );
}
