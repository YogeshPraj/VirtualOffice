import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Interaction } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useToolConnections } from "../api/hooks";
import { CLASSIC_UI } from "../ui/Window";
import { logDecision } from "../api/brain";

/** An agent's multiple-choice question, shown as an RPG dialogue box. */
export function InteractionDialog({ interaction }: { interaction: Interaction }) {
  const { agentById, toast, company, issues } = useOfficeData();
  const qc = useQueryClient();
  const questions = interaction.payload.questions ?? [];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const speaker = agentById(interaction.createdByAgentId)?.name ?? "Agent";

  const submit = useMutation({
    mutationFn: () =>
      api.respond(
        interaction.issueId,
        interaction.id,
        questions.map((q) => ({
          questionId: q.id,
          optionIds: picked[q.id] ?? [],
          otherText: other[q.id]?.trim() || null,
        })),
      ),
    onSuccess: () => {
      toast(`${speaker} got your answer.`);
      const lines = questions.map((q) => {
        const labels = q.options.filter((o) => picked[q.id]?.includes(o.id)).map((o) => o.label);
        const extra = other[q.id]?.trim();
        return `Q: ${q.prompt} A: ${[...labels, ...(extra ? [extra] : [])].join("; ") || "(no answer)"}`;
      });
      const where = issueLabel(issues, interaction.issueId);
      logDecision(`CEO answered ${speaker}'s questions on ${where}. ${lines.join(" | ")}`, where, `CEO office, ${where}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast(e.message),
  });

  if (interaction.kind === "connection_intent") {
    return <ConnectionIntentDialog interaction={interaction} speaker={speaker} />;
  }

  if (interaction.kind === "request_confirmation" || interaction.kind === "request_checkbox_confirmation") {
    return <ConfirmationDialog interaction={interaction} speaker={speaker} />;
  }

  if (interaction.kind !== "ask_user_questions" || questions.length === 0) {
    return (
      <div className="rpg-box">
        <div className="speaker">{speaker}</div>
        <div style={{ marginBottom: 8 }}>{interaction.title ?? interaction.summary ?? "I need your input on this task."}</div>
        <a
          className="px-btn primary small"
          href={`${CLASSIC_UI}/${company.issuePrefix}/issues/${interaction.issueId}#interaction-${interaction.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Answer on the classic screen ↗
        </a>
      </div>
    );
  }

  const ready = questions.every((q) => !q.required || (picked[q.id]?.length ?? 0) > 0);

  return (
    <div className="rpg-box">
      <div className="speaker">{speaker}</div>
      {questions.map((q) => (
        <div key={q.id} style={{ marginBottom: 10 }}>
          <div style={{ marginBottom: 6 }}>{q.prompt}</div>
          {q.helpText && <div className="muted" style={{ color: "#bbb" }}>{q.helpText}</div>}
          {q.options.map((o) => {
            const sel = picked[q.id]?.includes(o.id) ?? false;
            return (
              <div key={o.id}>
                <button
                  className={`rpg-option ${sel ? "selected" : ""}`}
                  onClick={() =>
                    setPicked((p) => {
                      const cur = p[q.id] ?? [];
                      if (q.selectionMode === "multiple") {
                        return { ...p, [q.id]: sel ? cur.filter((x) => x !== o.id) : [...cur, o.id] };
                      }
                      return { ...p, [q.id]: [o.id] };
                    })
                  }
                >
                  {o.label}
                  {o.description && <small>{o.description}</small>}
                </button>
                {o.freeText && sel && (
                  <textarea
                    className="px-textarea"
                    placeholder="Tell them more…"
                    value={other[q.id] ?? ""}
                    onChange={(e) => setOther((s) => ({ ...s, [q.id]: e.target.value }))}
                    style={{ color: "#1e1a24" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
      <button className="px-btn primary" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
        {submit.isPending ? "..." : (interaction.payload.submitLabel ?? "Answer")} ▶
      </button>
    </div>
  );
}

interface ConfirmationPayload {
  prompt?: string;
  detailsMarkdown?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  rejectRequiresReason?: boolean;
  rejectReasonLabel?: string;
  options?: { id: string; label: string; description?: string | null }[];
  defaultSelectedOptionIds?: string[];
  minSelected?: number;
}

/** Text written by agents sometimes arrives double-encoded (UTF-8 read as Latin-1): "â€”" for "—". */
function repairMojibake(text: string): string {
  if (!/[âÃ][-ÿ]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from([...text].map((ch) => ch.charCodeAt(0) & 0xff));
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return fixed;
  } catch {
    return text.replace(/â€”/g, "—").replace(/â€“/g, "–").replace(/â€™/g, "’").replace(/â€œ|â€/g, '"');
  }
}

/** Yes/no (optionally with a checklist) decision from an agent: "Accept the report?", "Which work starts now?" */
function ConfirmationDialog({ interaction, speaker }: { interaction: Interaction; speaker: string }) {
  const { toast, issues } = useOfficeData();
  const qc = useQueryClient();
  const p = interaction.payload as ConfirmationPayload;
  const where = issueLabel(issues, interaction.issueId);
  const prompt = repairMojibake(p.prompt ?? interaction.title ?? "a request");
  const options = p.options ?? [];
  const [selected, setSelected] = useState<string[]>(p.defaultSelectedOptionIds ?? []);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const minSelected = options.length ? Math.max(p.minSelected ?? 0, 0) : 0;

  const done = (msg: string) => {
    toast(msg);
    qc.invalidateQueries();
  };
  const accept = useMutation({
    mutationFn: () => api.acceptInteraction(interaction.issueId, interaction.id, options.length ? selected : undefined),
    onSuccess: () => {
      done(`${speaker}: on it.`);
      const chosen = options.filter((o) => selected.includes(o.id)).map((o) => repairMojibake(o.label));
      const skipped = options.filter((o) => !selected.includes(o.id)).map((o) => repairMojibake(o.label));
      logDecision(
        `CEO approved "${prompt}" on ${where}` +
          (chosen.length ? `. Chosen: ${chosen.join("; ")}` : "") +
          (skipped.length ? `. Not now: ${skipped.join("; ")}` : ""),
        where,
        `CEO office, ${where}`,
      );
    },
    onError: (e: Error) => toast(e.message),
  });
  const reject = useMutation({
    mutationFn: () => api.rejectInteraction(interaction.issueId, interaction.id, reason.trim() || undefined),
    onSuccess: () => {
      done(`${speaker} will rework it.`);
      logDecision(`CEO rejected "${prompt}" on ${where}${reason.trim() ? `. Reason: ${reason.trim()}` : ""}`, where, `CEO office, ${where}`);
    },
    onError: (e: Error) => toast(e.message),
  });
  const busy = accept.isPending || reject.isPending;

  return (
    <div className="rpg-box">
      <div className="speaker">{speaker}</div>
      <div style={{ marginBottom: 8 }}>{repairMojibake(p.prompt ?? interaction.title ?? "Please confirm.")}</div>
      {p.detailsMarkdown && (
        <div style={{ color: "#cfcfe0", fontSize: 18, whiteSpace: "pre-wrap", marginBottom: 10 }}>
          {repairMojibake(p.detailsMarkdown).replace(/`/g, "")}
        </div>
      )}
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <label key={o.id} className={`rpg-option ${on ? "selected" : ""}`} style={{ display: "flex", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={on}
              disabled={busy}
              onChange={() => setSelected((s) => (on ? s.filter((x) => x !== o.id) : [...s, o.id]))}
              style={{ marginTop: 6 }}
            />
            <span>
              {repairMojibake(o.label)}
              {o.description && <small>{repairMojibake(o.description)}</small>}
            </span>
          </label>
        );
      })}
      {rejecting && (
        <textarea
          className="px-textarea"
          style={{ color: "#1e1a24" }}
          aria-label={p.rejectReasonLabel ?? "Reason"}
          placeholder={p.rejectReasonLabel ?? "What should change?"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      <div className="row" style={{ marginTop: 8 }}>
        {!rejecting ? (
          <>
            <button className="px-btn good" disabled={busy || selected.length < minSelected} onClick={() => accept.mutate()}>
              ✔ {p.acceptLabel ?? "Accept"}
              {options.length ? ` (${selected.length})` : ""}
            </button>
            <button className="px-btn" disabled={busy} onClick={() => setRejecting(true)}>
              ✖ {p.rejectLabel ?? "Reject"}
            </button>
          </>
        ) : (
          <>
            <button
              className="px-btn bad"
              disabled={busy || (p.rejectRequiresReason === true && !reason.trim())}
              onClick={() => reject.mutate()}
            >
              Send: {p.rejectLabel ?? "Reject"}
            </button>
            <button className="px-btn" disabled={busy} onClick={() => setRejecting(false)}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface ConnectionIntentPayload {
  purpose?: string;
  serviceSlug?: string;
  serviceName?: string;
  requestingAgentId?: string;
  phase?: string;
}

/** "Connect Anthropic": an agent needs a connection. Hand it one you already have.
 *  Paperclip decides which action fits (same rules as its classic card):
 *  - the agent's binding needs adopting  → adopt that connection
 *  - the agent is bound, the account just needed a fresh sign-in → complete with the repaired one
 *  - otherwise → complete with an existing healthy connection */
function ConnectionIntentDialog({ interaction, speaker }: { interaction: Interaction; speaker: string }) {
  const { company, toast } = useOfficeData();
  const qc = useQueryClient();
  const p = interaction.payload as ConnectionIntentPayload;
  const service = p.serviceName ?? p.serviceSlug ?? "a service";
  const { data: conns } = useToolConnections(company.id);
  const options = useQuery({
    queryKey: ["connection-intent", interaction.id],
    queryFn: () => api.connectionIntentOptions(interaction.id),
  });

  const adoption = options.data?.aiConnectionRequiresAdoption;
  const adoptId = typeof adoption === "string" ? adoption : adoption?.connectionId;
  const repairId = options.data?.aiRepair?.connection?.id;
  const healthy = (conns ?? []).filter(
    (c) => c.enabled && c.healthStatus === "ok" && (!p.purpose || c.connectionPurpose === p.purpose),
  );
  // Offer the connection Paperclip itself would pick first, then any other healthy one.
  const preferred = adoptId ?? repairId;
  const choices = [
    ...healthy.filter((c) => c.id === preferred),
    ...healthy.filter((c) => c.id !== preferred),
  ];

  const done = (msg: string) => {
    toast(msg);
    qc.invalidateQueries();
  };
  const use = useMutation({
    mutationFn: (connectionId: string) =>
      p.purpose === "ai" && p.requestingAgentId && adoptId === connectionId
        ? api.adoptAiConnection(company.id, p.requestingAgentId, interaction.id, connectionId)
        : api.completeConnectionIntent(interaction.id, connectionId),
    onSuccess: () => done(`${speaker} is plugged in. Back to work.`),
    onError: () => options.refetch(),
  });
  const decline = useMutation({
    mutationFn: () => api.declineConnectionIntent(interaction.id),
    onSuccess: () => done(`Told ${speaker} no.`),
  });
  const busy = use.isPending || decline.isPending || options.isLoading;
  const error = (use.error ?? decline.error) as Error | null;

  return (
    <div className="rpg-box">
      <div className="speaker">{speaker}</div>
      <div style={{ marginBottom: 8 }}>I need a connection to {service} before I can keep working.</div>
      {choices.length === 0 ? (
        <div style={{ color: "#cfcfe0", fontSize: 18, marginBottom: 8 }}>
          You don't have a healthy {service} connection yet. Set one up on the classic screen, then come back.
        </div>
      ) : (
        choices.map((c) => (
          <button key={c.id} className="px-btn good" disabled={busy} onClick={() => use.mutate(c.id)}>
            {use.isPending && use.variables === c.id ? "Connecting…" : `🔌 Use ${c.name}`}
          </button>
        ))
      )}
      {error && (
        <div role="alert" style={{ color: "#ffb0b0", fontSize: 18, margin: "8px 0" }}>
          ⚠ {error.message}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        {(choices.length === 0 || error) && (
          <a className="px-btn small" href={`${CLASSIC_UI}/${company.issuePrefix}/apps/connections`} target="_blank" rel="noreferrer">
            {choices.length === 0 ? `Set up ${service}` : "Open connections"} ↗
          </a>
        )}
        <button className="px-btn small" disabled={busy} onClick={() => decline.mutate()}>
          ✖ Decline
        </button>
      </div>
    </div>
  );
}

/** "YOG-4 (Trusted build baseline)" for decision records; falls back to the raw id. */
function issueLabel(issues: { id: string; identifier: string; title: string }[], issueId: string): string {
  const i = issues.find((x) => x.id === issueId);
  return i ? `${i.identifier} (${i.title.slice(0, 60)})` : `task ${issueId.slice(0, 8)}`;
}
