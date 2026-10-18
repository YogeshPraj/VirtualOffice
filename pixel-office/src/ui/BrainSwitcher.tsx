import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, useAdapters } from "../api/hooks";
import { buildSwitchConfig, isLimitReason, isProvider, providerLabel, rememberTemplates } from "../api/providers";
import { useOfficeData } from "../state/officeData";

/** One place to see and change which AI provider powers the whole office. */
export function BrainSwitcher() {
  const { company, agents, toast } = useOfficeData();
  const qc = useQueryClient();
  const adapters = useAdapters();
  const [openMenu, setOpenMenu] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const staff = useMemo(() => agents.filter((a) => a.status !== "terminated"), [agents]);
  const providers = useMemo(() => (adapters.data ?? []).filter(isProvider), [adapters.data]);
  const label = (type: string) => {
    const info = adapters.data?.find((a) => a.type === type);
    return providerLabel(info ?? { type, label: type });
  };

  useEffect(() => rememberTemplates(staff), [staff]);
  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  const counts = new Map<string, number>();
  for (const a of staff) counts.set(a.adapterType, (counts.get(a.adapterType) ?? 0) + 1);
  const limited = new Map<string, number>();
  for (const a of staff) if (a.status === "error" && isLimitReason(a.errorReason)) limited.set(a.adapterType, (limited.get(a.adapterType) ?? 0) + 1);

  const move = useMutation({
    mutationFn: async ({ to, onlyLimited }: { to: string; onlyLimited: boolean }) => {
      const schema = await api.adapterSchema(to);
      const movers = staff.filter((a) => a.adapterType !== to && (!onlyLimited || (a.status === "error" && isLimitReason(a.errorReason))));
      const results = await Promise.allSettled(
        movers.map(async (a) => {
          const { adapterConfig, runtimeConfig } = buildSwitchConfig(a, to, agents, schema.fields);
          await api.switchAgentProvider(a.id, to, adapterConfig, runtimeConfig);
          if (a.status === "error") await api.clearAgentError(a.id);
        }),
      );
      return { to, moved: results.filter((r) => r.status === "fulfilled").length, failed: results.filter((r) => r.status === "rejected").length };
    },
    onSuccess: ({ to, moved, failed }) => {
      toast(`${moved} employee${moved === 1 ? "" : "s"} now run on ${label(to)}.${failed ? ` ${failed} could not be moved.` : ""}`);
      qc.invalidateQueries({ queryKey: keys.agents(company.id) });
      qc.invalidateQueries({ queryKey: ["models", company.id] });
      setOpenMenu(false);
    },
    onError: (e: Error) => toast(e.message),
  });

  if (staff.length === 0 || providers.length === 0) return null;

  const limitedTypes = [...limited.keys()];
  const mix = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const summary = mix.length === 1 ? label(mix[0][0]) : mix.map(([t, n]) => `${label(t)} ×${n}`).join(" · ");
  const alternatives = (from: string[]) => providers.filter((p) => !from.includes(p.type));

  return (
    <span ref={ref} style={{ position: "relative" }}>
      <button
        className={`px-btn small ${limitedTypes.length ? "bad" : ""}`}
        onClick={() => setOpenMenu((v) => !v)}
        title="Choose which AI provider powers the office"
      >
        {limitedTypes.length ? `⚠ ${limitedTypes.map(label).join(", ")} LIMIT` : `🧠 ${summary}`} ▾
      </button>
      {openMenu && (
        <div className="brain-menu" role="menu">
          {limitedTypes.length > 0 && (
            <div className="brain-limit">
              <strong>{limitedTypes.map(label).join(", ")} has hit its limit</strong> for {[...limited.values()].reduce((a, b) => a + b, 0)} employee(s).
              {alternatives(limitedTypes).map((p) => (
                <button key={p.type} className="px-btn small good" disabled={move.isPending} onClick={() => move.mutate({ to: p.type, onlyLimited: true })}>
                  Move them to {providerLabel(p)}
                </button>
              ))}
            </div>
          )}
          <div className="px-label">RUN THE WHOLE OFFICE ON</div>
          {providers.map((p) => {
            const here = counts.get(p.type) ?? 0;
            const all = here === staff.length;
            return (
              <button
                key={p.type}
                className="rpg-option"
                style={{ color: "var(--ink)" }}
                disabled={all || move.isPending}
                onClick={() => move.mutate({ to: p.type, onlyLimited: false })}
              >
                {all ? "✔ " : ""}{providerLabel(p)} <small style={{ color: "var(--muted)" }}>{here}/{staff.length} on it</small>
              </button>
            );
          })}
          <div className="muted" style={{ fontSize: 15 }}>Instructions and skills are kept; current conversations restart.</div>
        </div>
      )}
    </span>
  );
}
