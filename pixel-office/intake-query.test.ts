import { describe, expect, it } from "vitest";
import { parseAdoProject, parseGithubSearch, searchWords } from "./intake-bridge";

describe("query intake parsing", () => {
  it("reads ADO project and saved query links", () => {
    expect(parseAdoProject("https://dev.azure.com/contoso/Web%20App/_queries/query/0f7e1c3a-1b2c-4d5e-8f90-123456789abc/")).toEqual({
      org: "contoso",
      orgUrl: "https://dev.azure.com/contoso",
      project: "Web App",
      queryId: "0f7e1c3a-1b2c-4d5e-8f90-123456789abc",
    });
    expect(parseAdoProject("https://contoso.visualstudio.com/Ops/_boards/board")).toMatchObject({ orgUrl: "https://contoso.visualstudio.com", project: "Ops" });
    expect(parseAdoProject("https://dev.azure.com/contoso/_settings")).toBeNull();
    expect(parseAdoProject("https://dev.azure.com/con;toso/x")).toBeNull();
  });

  it("reads GitHub search links", () => {
    expect(parseGithubSearch("https://github.com/o/r/issues?q=is%3Aopen+label%3Abug")).toEqual({ repo: "o/r", kind: "issue", q: "is:open label:bug" });
    expect(parseGithubSearch("https://github.com/o/r/pulls")).toEqual({ repo: "o/r", kind: "pr", q: "is:open" });
    expect(parseGithubSearch("https://github.com/issues?q=assignee%3A%40me")).toEqual({ kind: "issue", q: "assignee:@me" });
    expect(parseGithubSearch("https://github.com/o/r/issues/12")).toBeNull();
    expect(searchWords('repo:o/r is:open label:"needs triage"')).toEqual(["repo:o/r", "is:open", 'label:"needs triage"']);
  });
});
