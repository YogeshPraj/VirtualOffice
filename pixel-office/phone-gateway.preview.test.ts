import { it } from "vitest";
import { createHash } from "node:crypto";
import { startGateway } from "./phone-gateway";
it("preview", async () => {
  const s = await startGateway("127.0.0.1", 5199, {
    tokenHash: () => createHash("sha256").update("preview").digest("hex"),
    handle: async (method, path) => {
      if (path === "/m/home") return { status: 200, body: { company: "Yogesh AI Lab", review: [{ id: "00000000-0000-0000-0000-000000000001", identifier: "YOG-50", title: "Add retry to the ADO sync", who: "Ada", priority: "high" }], waiting: [{ id: null, identifier: "YOG-51", title: "Approve the Q4 plan" }] } };
      return { status: 200, body: { identifier: "YOG-50", title: "Add retry to the ADO sync", status: "in_review", who: "Ada", description: "", comments: [{ who: "Ada", at: new Date().toISOString(), body: "Done: retries with backoff, tests added. Ready for review." }] } };
    },
  });
  await new Promise((r) => setTimeout(r, 90_000));
  s.close();
}, 100_000);
