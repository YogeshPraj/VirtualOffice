export const type = "copilot_local";
export const label = "GitHub Copilot (local)";

export const agentConfigurationDoc = `# copilot_local configuration
Runs the agent with the GitHub Copilot CLI (\`copilot -p\`), signed in through \`copilot login\` / gh.
Use when: you want employees billed to a GitHub Copilot plan instead of another provider.
Core fields:
- model: model id, or "auto" (default) to let Copilot choose
- command: executable (default "copilot"; resolved from PATH or COPILOT_CLI_PATH)
- cwd: fallback working directory
- extraArgs: extra CLI arguments
- timeoutSec / graceSec: run limits (0 = no timeout)
- reasoningEffort: none|minimal|low|medium|high|xhigh|max
`;

export { createServerAdapter } from "./server/index.js";
