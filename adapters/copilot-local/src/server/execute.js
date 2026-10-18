import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  buildRuntimeToolsEnv,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  ensureAbsoluteDirectory,
  ensurePathInEnv,
  isPaperclipSkillSourceMissing,
  joinPromptSections,
  parseObject,
  readPaperclipRuntimeSkillEntries,
  refreshPaperclipWorkspaceEnvForExecution,
  renderTemplate,
  resolveLegacyPaperclipDesiredSkillNames,
  runChildProcess,
  selectInitialCommunicationGuidance,
  selectPaperclipPromptSections,
} from "@paperclipai/adapter-utils/server-utils";
import { resolveCopilotCommand } from "./cli.js";
import { detectAuthRequired, detectQuota, detectUnknownSession, parseCopilotJsonl } from "./parse.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const nonEmpty = (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

// Copilot discovers skills under <add-dir>/.github/skills, so Paperclip's skills are
// linked into a throwaway directory that is passed with --add-dir.
async function stageSkills(config, onLog) {
  let root = null;
  try {
    const entries = await readPaperclipRuntimeSkillEntries(config, moduleDir);
    const desired = new Set(resolveLegacyPaperclipDesiredSkillNames(config, entries));
    const chosen = entries.filter((e) => desired.has(e.key) && !isPaperclipSkillSourceMissing(e));
    if (chosen.length === 0) return null;
    root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-copilot-skills-"));
    const skillsDir = path.join(root, ".github", "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    for (const entry of chosen) {
      await fs.symlink(entry.source, path.join(skillsDir, entry.runtimeName), "junction");
    }
    return root;
  } catch (err) {
    await onLog("stderr", `[paperclip] Could not stage skills for Copilot: ${err instanceof Error ? err.message : err}\n`);
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    return null;
  }
}

export async function execute(ctx) {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;

  const command = resolveCopilotCommand(asString(config.command, ""), process.env.PATH);
  if (!command) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "copilot_cli_missing",
      errorMessage: "GitHub Copilot CLI was not found. Install it (winget install GitHub.Copilot) or set the command / COPILOT_CLI_PATH.",
      resultJson: { executionRecovery: { kind: "bootstrap", providerWorkStarted: false } },
    };
  }

  const model = asString(config.model, "auto").trim() || "auto";
  const reasoningEffort = asString(config.reasoningEffort, "").trim();
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 20);
  const extraArgs = asStringArray(config.extraArgs);

  const workspace = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspace.cwd, "");
  const configuredCwd = asString(config.cwd, "");
  const useConfigured = asString(workspace.source, "") === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfigured ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const env = { ...buildPaperclipEnv(agent, ctx.agentIdentity), ...buildRuntimeToolsEnv(ctx.runtimeTools) };
  env.PAPERCLIP_RUN_ID = runId;
  const taskId = nonEmpty(context.taskId) ?? nonEmpty(context.issueId);
  const wakeReason = nonEmpty(context.wakeReason);
  const wakeCommentId = nonEmpty(context.wakeCommentId) ?? nonEmpty(context.commentId);
  const approvalId = nonEmpty(context.approvalId);
  const approvalStatus = nonEmpty(context.approvalStatus);
  if (taskId) env.PAPERCLIP_TASK_ID = taskId;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (Array.isArray(context.issueIds) && context.issueIds.length > 0) {
    env.PAPERCLIP_LINKED_ISSUE_IDS = context.issueIds.filter((v) => typeof v === "string").join(",");
  }
  refreshPaperclipWorkspaceEnvForExecution({
    env,
    envConfig: parseObject(config.env),
    workspaceCwd: effectiveWorkspaceCwd,
    workspaceSource: asString(workspace.source, ""),
    workspaceId: asString(workspace.workspaceId, ""),
    workspaceRepoUrl: asString(workspace.repoUrl, ""),
    workspaceRepoRef: asString(workspace.repoRef, ""),
    workspaceHints: Array.isArray(context.paperclipWorkspaces) ? context.paperclipWorkspaces : [],
    agentHome: asString(workspace.agentHome, ""),
    executionTargetIsRemote: false,
    executionCwd: cwd,
  });
  if (authToken) env.PAPERCLIP_API_KEY = authToken;
  for (const [k, v] of Object.entries(parseObject(config.env))) {
    if (typeof v === "string") env[k] = v;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  const childEnv = Object.fromEntries(Object.entries(runtimeEnv).filter(([, v]) => typeof v === "string"));
  childEnv.NO_COLOR = "1";

  const sessionParams = parseObject(runtime.sessionParams);
  const savedSessionId = asString(sessionParams.sessionId, runtime.sessionId ?? "");
  const savedCwd = asString(sessionParams.cwd, "");
  const canResume = savedSessionId.length > 0 && (!savedCwd || path.resolve(savedCwd) === path.resolve(cwd));

  let instructions = "";
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  if (instructionsFilePath) {
    try {
      const body = await fs.readFile(instructionsFilePath, "utf8");
      instructions =
        `${body}\n\nThe above agent instructions were loaded from ${instructionsFilePath}. ` +
        `Resolve any relative file references from ${path.dirname(instructionsFilePath)}${path.sep}.\n\n`;
    } catch (err) {
      await onLog("stdout", `[paperclip] Warning: could not read instructions file "${instructionsFilePath}": ${err instanceof Error ? err.message : err}\n`);
    }
  }

  const apiNote =
    env.PAPERCLIP_API_URL && env.PAPERCLIP_API_KEY
      ? [
          "Paperclip API access note:",
          "Call the Paperclip API from the shell. PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_RUN_ID are set in your environment.",
          'Send the header "Authorization: Bearer $PAPERCLIP_API_KEY" and, on writes, "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID".',
          "Use a real issue id from your context; never send a placeholder such as {id}.",
          "",
        ].join("\n")
      : "";

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };

  const buildPrompt = (resumed) => {
    const { taskContextNote, wakePrompt } = selectPaperclipPromptSections(context, {
      resumedSession: resumed,
      includeCommunicationGuidance: false,
    });
    const rendered = resumed && wakePrompt.length > 0 ? "" : renderTemplate(promptTemplate, templateData);
    return joinPromptSections([
      selectInitialCommunicationGuidance(context, { resumedSession: resumed }),
      instructions,
      wakePrompt,
      taskContextNote,
      nonEmpty(context.paperclipSessionHandoffMarkdown) ?? "",
      apiNote,
      rendered,
    ]);
  };

  const skillsRoot = await stageSkills(config, onLog);
  let promptDir = null;

  // Windows caps a whole command line near 32k characters (8k when the CLI is a .cmd shim),
  // and long agent instructions plus task context exceed it ("spawn ENAMETOOLONG"). Long
  // prompts therefore go into a file the agent is told to read first; short ones stay inline.
  const MAX_INLINE_PROMPT = 6000;
  const promptArg = async (prompt) => {
    if (prompt.length <= MAX_INLINE_PROMPT) return prompt;
    promptDir ??= await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-copilot-prompt-"));
    const file = path.join(promptDir, `run-${runId}.md`);
    await fs.writeFile(file, prompt, "utf8");
    return (
      `Your complete instructions and task context for this run are in the file ${file} ` +
      `(${prompt.length} characters). Before doing anything else, read that whole file with your file tools, ` +
      `then follow it exactly as if it were this prompt.`
    );
  };

  const runAttempt = async (resumeId) => {
    const fullPrompt = buildPrompt(Boolean(resumeId));
    const prompt = await promptArg(fullPrompt);
    const args = ["-p", prompt, "--output-format", "json", "--allow-all", "--no-ask-user"];
    if (resumeId) args.push(`--resume=${resumeId}`);
    args.push("--model", model);
    if (reasoningEffort) args.push("--reasoning-effort", reasoningEffort);
    if (skillsRoot) args.push("--add-dir", skillsRoot);
    if (promptDir) args.push("--add-dir", promptDir);
    args.push(...extraArgs);

    await onMeta?.({
      adapterType: "copilot_local",
      command,
      cwd,
      commandNotes: [
        prompt === fullPrompt
          ? "Prompt is passed with -p; --allow-all grants unattended permissions (shell, files, URLs)."
          : `Prompt (${fullPrompt.length} chars) is too long for a Windows command line; it is written to a file the agent reads first.`,
      ],
      commandArgs: args.map((a) => (a === prompt ? `<prompt ${prompt.length} chars>` : a)),
      prompt: fullPrompt,
      context,
    });

    const proc = await runChildProcess(runId, command, args, {
      cwd,
      env: childEnv,
      timeoutSec,
      graceSec,
      onSpawn,
      onLog: async (stream, chunk) => {
        await onLog(stream, chunk);
      },
    });
    return { proc, parsed: parseCopilotJsonl(proc.stdout) };
  };

  const toResult = (attempt, clearSession) => {
    const { proc, parsed } = attempt;
    const text = `${proc.stdout}\n${proc.stderr}`;
    const authRequired = detectAuthRequired(proc.stderr) || (proc.exitCode !== 0 && detectAuthRequired(text));
    const quota = proc.exitCode !== 0 && detectQuota(text);
    const resultExit = parsed.result?.exitCode;
    const failed = proc.timedOut || (proc.exitCode ?? 0) !== 0 || (typeof resultExit === "number" && resultExit !== 0);
    const stderrLine = proc.stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    const sessionId = parsed.sessionId ?? ((clearSession ? null : savedSessionId) || null);
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: proc.timedOut,
      errorMessage: proc.timedOut
        ? `Timed out after ${timeoutSec}s`
        : failed
          ? parsed.errorMessage || stderrLine || `Copilot CLI exited with code ${proc.exitCode}`
          : null,
      errorCode: authRequired ? "copilot_auth_required" : quota ? "copilot_quota" : null,
      usage: { inputTokens: 0, outputTokens: 0 },
      usageBasis: "per_run",
      provider: "github",
      biller: "github",
      billingType: "subscription",
      model: parsed.model ?? (model === "auto" ? null : model),
      costUsd: null,
      sessionParams: sessionId ? { sessionId, cwd } : null,
      sessionDisplayId: sessionId,
      clearSession: Boolean(clearSession && !sessionId),
      summary: parsed.summary || null,
      resultJson: { premiumRequests: parsed.premiumRequests, result: parsed.result },
    };
  };

  try {
    const resumeId = canResume ? savedSessionId : null;
    const first = await runAttempt(resumeId);
    if (
      resumeId &&
      (first.proc.exitCode ?? 0) !== 0 &&
      !first.proc.timedOut &&
      detectUnknownSession(`${first.proc.stdout}\n${first.proc.stderr}`)
    ) {
      await onLog("stdout", `[paperclip] Copilot session "${resumeId}" is unavailable; retrying with a fresh session.\n`);
      return toResult(await runAttempt(null), true);
    }
    return toResult(first, false);
  } finally {
    if (skillsRoot) await fs.rm(skillsRoot, { recursive: true, force: true }).catch(() => {});
    if (promptDir) await fs.rm(promptDir, { recursive: true, force: true }).catch(() => {});
  }
}
