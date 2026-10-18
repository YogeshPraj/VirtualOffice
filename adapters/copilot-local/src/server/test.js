import { copilotVersion, resolveCopilotCommand } from "./cli.js";
import { asString } from "@paperclipai/adapter-utils/server-utils";
import { spawnSync } from "node:child_process";

export async function testEnvironment(ctx) {
  const checks = [];
  const config = ctx.config ?? {};
  const command = resolveCopilotCommand(asString(config.command, ""), process.env.PATH);

  if (!command) {
    checks.push({
      code: "copilot_cli_missing",
      level: "error",
      message: "GitHub Copilot CLI was not found.",
      hint: "Install it with `winget install GitHub.Copilot`, or set the command / COPILOT_CLI_PATH.",
    });
  } else {
    const version = copilotVersion(command);
    checks.push(
      version
        ? { code: "copilot_cli_found", level: "info", message: `${version} at ${command}` }
        : { code: "copilot_cli_unrunnable", level: "error", message: `Found ${command} but it did not run.` },
    );

    // A one-word prompt proves login, plan access and the chosen model in one go.
    const model = asString(config.model, "auto").trim() || "auto";
    const res = spawnSync(command, ["-p", "Reply with the single word: ok", "-s", "--model", model, "--no-ask-user"], {
      encoding: "utf8",
      timeout: 90000,
    });
    const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
    if (res.status === 0) {
      checks.push({ code: "copilot_probe_ok", level: "info", message: `Copilot answered using model "${model}".` });
    } else if (/not (logged|signed) in|login|authenticat/i.test(out)) {
      checks.push({
        code: "copilot_auth_required",
        level: "error",
        message: "Copilot CLI is not signed in.",
        hint: 'Run "copilot login" in a terminal.',
      });
    } else if (/not available/i.test(out)) {
      checks.push({
        code: "copilot_model_unavailable",
        level: "error",
        message: `Model "${model}" is not available on this Copilot plan.`,
        hint: 'Pick another model, or use "auto".',
      });
    } else {
      checks.push({
        code: "copilot_probe_failed",
        level: "error",
        message: (out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "Copilot probe failed.").slice(0, 300),
      });
    }
  }

  return {
    adapterType: ctx.adapterType ?? "copilot_local",
    status: checks.some((c) => c.level === "error") ? "fail" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
