import { useEffect, useRef, useState } from "react";
import type { Agent, AttentionItem, Issue } from "../api/types";
import { useOffice, type Panel } from "../state/officeStore";

const PREF_KEY = "pixel-office:notify";

function readPref(): { on: boolean; sound: boolean } {
  try {
    return { on: false, sound: true, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") };
  } catch {
    return { on: false, sound: true };
  }
}

function savePref(p: { on: boolean; sound: boolean }) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the preference just won't persist */
  }
}

/** A short two-note pixel chime (no audio files). */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1318].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.12);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* audio unavailable */
  }
}

export function useNotificationPref() {
  const [pref, setPref] = useState(readPref);
  const supported = typeof Notification !== "undefined";
  const permission = supported ? Notification.permission : "denied";
  const toggle = async () => {
    if (!supported) return;
    let on = !pref.on;
    // Permission can only be asked from a click, which this is.
    if (on && Notification.permission === "default") on = (await Notification.requestPermission()) === "granted";
    if (on && Notification.permission !== "granted") on = false;
    const next = { ...pref, on };
    setPref(next);
    savePref(next);
    window.dispatchEvent(new Event("pixel-office:notify-pref"));
  };
  const toggleSound = () => {
    const next = { ...pref, sound: !pref.sound };
    setPref(next);
    savePref(next);
    window.dispatchEvent(new Event("pixel-office:notify-pref"));
  };
  return { ...pref, supported, permission, toggle, toggleSound };
}

/**
 * Watches the company and raises a desktop notification when something new needs the CEO.
 * Items already present when the office opens never notify; only changes do.
 */
export function useOfficeNotifications(attention: AttentionItem[], agents: Agent[], issues: Issue[], ready: boolean) {
  const open = useOffice((s) => s.open);
  const [pref, setPref] = useState(readPref);
  useEffect(() => {
    const onChange = () => setPref(readPref());
    window.addEventListener("pixel-office:notify-pref", onChange);
    return () => window.removeEventListener("pixel-office:notify-pref", onChange);
  }, []);

  const seen = useRef<{ attention: Set<string>; errored: Set<string>; review: Set<string> } | null>(null);

  // The tab title always carries the waiting count, even with notifications off.
  useEffect(() => {
    document.title = attention.length ? `(${attention.length}) Pixel Office` : "Pixel Office";
  }, [attention.length]);

  useEffect(() => {
    if (!ready) return;
    const attentionIds = new Set(attention.map((a) => `${a.sourceKind}:${a.subject.id}`));
    const errored = new Set(agents.filter((a) => a.status === "error").map((a) => a.id));
    const review = new Set(issues.filter((i) => i.status === "in_review").map((i) => i.id));
    if (!seen.current) {
      seen.current = { attention: attentionIds, errored, review };
      return;
    }
    const prev = seen.current;
    const fresh: { title: string; body: string; panel: Panel; tag: string }[] = [];
    for (const a of attention) {
      const id = `${a.sourceKind}:${a.subject.id}`;
      if (prev.attention.has(id)) continue;
      const who = agents.find((x) => x.id === a.subject.metadata?.createdByAgentId)?.name;
      fresh.push({
        title: who ? `${who} needs you` : "Someone needs you",
        body: a.subject.title,
        panel: { kind: "room", room: "ceo" },
        tag: id,
      });
    }
    for (const agent of agents) {
      if (agent.status === "error" && !prev.errored.has(agent.id)) {
        fresh.push({ title: `${agent.name} hit a problem`, body: agent.errorReason ?? "Open the repair kit.", panel: { kind: "agent", agentId: agent.id }, tag: `err:${agent.id}` });
      }
    }
    for (const i of issues) {
      if (i.status === "in_review" && !prev.review.has(i.id)) {
        fresh.push({ title: `${i.identifier} is ready for review`, body: i.title, panel: { kind: "issue", issueId: i.id }, tag: `rev:${i.id}` });
      }
    }
    seen.current = { attention: attentionIds, errored, review };
    if (!pref.on || typeof Notification === "undefined" || Notification.permission !== "granted" || fresh.length === 0) return;
    for (const f of fresh.slice(0, 3)) {
      const n = new Notification(f.title, { body: f.body, tag: f.tag, icon: "/favicon.svg" });
      n.onclick = () => {
        window.focus();
        open(f.panel);
        n.close();
      };
    }
    if (fresh.length > 3) new Notification(`+${fresh.length - 3} more in the office`, { tag: "more", icon: "/favicon.svg" });
    if (pref.sound) chime();
  }, [attention, agents, issues, ready, pref, open]);
}
