import { describe, expect, it } from "vitest";
import { guessFromUrl } from "./WorkProducts";

describe("guessFromUrl", () => {
  it("recognises GitHub and Azure DevOps links", () => {
    expect(guessFromUrl("https://github.com/o/r/pull/12")).toMatchObject({ type: "pull_request", title: "o/r#12" });
    expect(guessFromUrl("https://github.com/o/r/tree/feature%2Fx")).toMatchObject({ type: "branch", externalId: "feature/x" });
    expect(guessFromUrl("https://github.com/o/r/commit/57ccc573321f")).toMatchObject({ type: "commit", title: "o/r@57ccc57" });
    expect(guessFromUrl("https://dev.azure.com/org/proj/_git/repo/pullrequest/7")).toMatchObject({ type: "pull_request", provider: "azure_devops" });
    expect(guessFromUrl("https://example.com/build/1")).toMatchObject({ type: "artifact" });
    expect(guessFromUrl("not a link")).toBeNull();
  });
});
