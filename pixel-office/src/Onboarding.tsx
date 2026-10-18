import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Company } from "./api/types";
import { keys } from "./api/hooks";
import { PxWindow } from "./ui/Window";

/** First run: an empty building waiting for a name on its sign. */
export function Onboarding({ onCreated }: { onCreated: (c: Company) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const create = useMutation({
    mutationFn: () => api.createCompany({ name: name.trim(), description: mission.trim() || undefined }),
    onSuccess: async (company) => {
      if (mission.trim()) {
        await api.createGoal(company.id, { title: mission.trim(), level: "company", status: "active" }).catch(() => undefined);
      }
      await qc.invalidateQueries({ queryKey: keys.companies });
      onCreated(company);
    },
  });
  const sign = name.trim() || "YOUR COMPANY";

  return (
    <div className="exterior">
      <PxWindow title="FOUND YOUR COMPANY">
        <svg viewBox="0 0 320 170" shapeRendering="crispEdges" aria-hidden>
          <rect width={320} height={170} fill="#7ec8f0" />
          <rect x={20} y={20} width={30} height={10} fill="#fff" />
          <rect x={250} y={30} width={40} height={10} fill="#fff" />
          <rect y={140} width={320} height={30} fill="#5aa04a" />
          <rect x={70} y={40} width={180} height={110} fill="#c9a27a" />
          <rect x={60} y={34} width={200} height={10} fill="#7a4a2a" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x={84 + i * 42} y={80} width={26} height={20} fill="#9fd4f0" />
              <rect x={84 + i * 42 + 12} y={80} width={2} height={20} fill="#7a4a2a" />
            </g>
          ))}
          <rect x={145} y={112} width={30} height={38} fill="#5a3a22" />
          <rect x={170} y={130} width={3} height={3} fill="#F5C542" />
          <rect x={86} y={50} width={148} height={20} fill="#2a2a3a" />
          <text x={160} y={64} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={7} fill="#F5C542">
            {sign.toUpperCase().slice(0, 20)}
          </text>
          {create.isSuccess && (
            <g>
              <rect x={135} y={118} width={50} height={3} fill="#E24B4A" />
            </g>
          )}
        </svg>
        <p>Every company starts with an empty building. Put a name on the sign, then go to HR and hire your first employee.</p>
        <label className="px-label" htmlFor="co-name">COMPANY NAME</label>
        <input id="co-name" className="px-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northwind Labs" />
        <label className="px-label" htmlFor="co-mission">MISSION (OPTIONAL)</label>
        <input id="co-mission" className="px-input" value={mission} onChange={(e) => setMission(e.target.value)} placeholder="e.g. Build the best note-taking app" />
        {create.error && <p style={{ color: "var(--bad)" }}>{(create.error as Error).message}</p>}
        <button className="px-btn primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          ✂ Cut the ribbon
        </button>
      </PxWindow>
    </div>
  );
}
