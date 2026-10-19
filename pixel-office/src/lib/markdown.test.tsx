import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown";

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} links={{ issue: () => true, agent: () => {} }} />);

describe("Markdown", () => {
  it("renders blocks and inline marks", () => {
    const out = html("# Plan\n\n- [x] **ship** it\n- read `a.ts`\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).toContain("<h3>Plan</h3>");
    expect(out).toContain("<li>☑ <b>ship</b> it</li>");
    expect(out).toContain("<code>a.ts</code>");
    expect(out).toContain("<td>1</td>");
  });

  it("never passes raw HTML or unsafe links through", () => {
    const out = html('<img src=x onerror="alert(1)"> [x](javascript:alert(1))');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("javascript:");
  });

  it("turns Paperclip task and agent links into in-office links", () => {
    const out = html("See [YOG-7](/YOG/issues/YOG-7) and [@QA](agent://abc)");
    expect(out).toContain('<a href="#">YOG-7</a>');
    expect(out).toContain('<a href="#">@QA</a>');
  });
});

describe("Markdown images", () => {
  it("shows the office's own attachment images inline, never remote ones", () => {
    const own = html("![shot](/api/attachments/0e47f572-3f95-42f4-8e54-9c53bc725370/content)");
    expect(own).toContain('<img class="md-img" src="/api/attachments/0e47f572-3f95-42f4-8e54-9c53bc725370/content"');
    const remote = html("![pixel](https://tracker.example.com/p.gif)");
    expect(remote).not.toContain("<img");
    expect(remote).toContain("🖼 pixel");
  });
});
