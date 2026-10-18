import { agentConfigurationDoc, label, type } from "../index.js";
import { readConfiguredModel } from "./cli.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

// Copilot CLI has no model-listing command, so the catalogue is "auto" plus whatever
// the user's own Copilot config selects; any other model id can be typed in.
async function listModels() {
  const models = [{ id: "auto", label: "Auto (Copilot chooses)" }];
  const configured = readConfiguredModel();
  if (configured) models.push({ id: configured, label: `${configured} (your Copilot default)` });
  return models;
}

export function createServerAdapter() {
  return {
    type,
    label,
    execute,
    testEnvironment,
    listModels,
    models: [{ id: "auto", label: "Auto (Copilot chooses)" }],
    agentConfigurationDoc,
    supportsLocalAgentJwt: true,
    supportsInstructionsBundle: true,
    getConfigSchema: async () => ({
      fields: [
        { key: "model", label: "Model", type: "combobox", default: "auto", options: (await listModels()).map((m) => ({ value: m.id, label: m.label })), hint: "Any model id your Copilot plan offers." },
        {
          key: "reasoningEffort",
          label: "Reasoning effort",
          type: "select",
          default: "",
          options: ["", "low", "medium", "high", "xhigh"].map((v) => ({ value: v, label: v || "Default" })),
        },
        { key: "command", label: "Copilot executable", type: "text", default: "", hint: "Leave empty to auto-detect (PATH, COPILOT_CLI_PATH, WinGet)." },
        { key: "timeoutSec", label: "Timeout (seconds)", type: "number", default: 0, hint: "0 = no timeout." },
      ],
    }),
  };
}
