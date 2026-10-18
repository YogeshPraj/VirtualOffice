/** Parse `copilot -p --output-format json` JSONL output. */
export function parseCopilotJsonl(stdout) {
  let sessionId = null;
  let model = null;
  let summary = "";
  let result = null;
  const errors = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    let ev;
    try {
      ev = JSON.parse(text);
    } catch {
      continue;
    }
    if (ev.type === "assistant.message" && ev.data) {
      if (typeof ev.data.model === "string") model = ev.data.model;
      if (typeof ev.data.content === "string" && ev.data.content && (ev.data.phase === "final_answer" || !summary)) {
        summary = ev.data.content;
      }
    } else if (ev.type === "result") {
      result = ev;
      if (typeof ev.sessionId === "string") sessionId = ev.sessionId;
    } else if (typeof ev.type === "string" && /error/i.test(ev.type)) {
      const msg = ev.data?.message ?? ev.data?.error;
      if (typeof msg === "string") errors.push(msg);
    }
  }
  return {
    sessionId,
    model,
    summary: summary.trim(),
    result,
    premiumRequests: Number(result?.usage?.premiumRequests ?? 0) || 0,
    errorMessage: errors.length ? errors[errors.length - 1] : null,
  };
}

export function detectAuthRequired(text) {
  return /not (logged|signed) in|copilot login|authenticat|no valid (github )?(token|credentials)|unauthorized/i.test(text);
}

export function detectQuota(text) {
  return /quota|rate limit|usage limit|premium requests? (limit|exhausted)|credits? (limit|exhausted)/i.test(text);
}

export function detectUnknownSession(text) {
  return /session .{0,60}(not found|does not exist|no such)|could not (find|resume) session/i.test(text);
}
