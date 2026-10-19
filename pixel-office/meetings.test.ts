import { describe, expect, it } from "vitest";
import { advance, draftPrompt, itemDescription, parseProposal, turnBrief } from "./meetings";
import { defaultAttendees } from "./src/panels/MeetingCard";

const feature = { identifier: "YOG-50", title: "Dark mode", description: "Add a dark-mode toggle." };

describe("team planning meetings", () => {
  it("goes round the room, then a second round, then hands over to the CEO", () => {
    const m = { attendees: ["a", "b", "c"], rounds: 2, round: 1, turn: 0 };
    expect(advance(m)).toEqual({ turn: 1, round: 1, done: false });
    expect(advance({ ...m, turn: 2 })).toEqual({ turn: 0, round: 2, done: false });
    expect(advance({ ...m, turn: 2, round: 2 })).toEqual({ turn: 0, round: 2, done: true });
  });

  it("gives each speaker the brief and the meeting so far, and asks round 2 to respond", () => {
    const first = turnBrief({ feature, speaker: "Ada", others: ["QA"], round: 1, rounds: 2, transcript: [] });
    expect(first).toMatch(/your turn, Ada/);
    expect(first).toMatch(/In the room: Ada, QA and the CEO/);
    expect(first).toMatch(/You speak first/);
    expect(first).toMatch(/Risks and what not to do/);
    expect(first).toMatch(/do \*\*not\*\* change files, write code/);
    const second = turnBrief({
      feature,
      speaker: "QA",
      others: ["Ada"],
      round: 2,
      rounds: 2,
      transcript: [
        { who: "a", name: "Ada", round: 1, body: "Use CSS variables.", at: "" },
        { who: null, name: "CEO", round: 1, body: "Follow the OS setting.", at: "" },
      ],
    });
    expect(second).toMatch(/\*\*Ada · round 1:\*\*\nUse CSS variables\./);
    expect(second).toMatch(/\*\*CEO \(CEO\) · round 1:\*\*\nFollow the OS setting\./);
    expect(second).toMatch(/agree\*\* and where you \*\*disagree/);
  });

  it("drafts from the meeting only, CEO first", () => {
    const p = draftPrompt(feature, [{ who: null, name: "CEO", round: 1, body: "No new libraries.", at: "" }], [{ id: "a", name: "Ada", title: "Engineer", status: "idle" }]);
    expect(p).toMatch(/Follow the CEO's input/);
    expect(p).toMatch(/EMPLOYEES: Ada \(Engineer\)/);
    expect(p).toMatch(/--- CEO \(CEO\), round 1:\nNo new libraries\./);
  });

  it("reads the work items back, matching owners and refusing loops", () => {
    const text = 'Here you go:\n```json\n[{"title":"Build the toggle","owner":"ada","after":[],"doneWhen":["Toggle works","Persisted"],"notes":"CSS variables"},{"title":"Verify","owner":"QA","after":[0,1,5],"doneWhen":["Checked"],"notes":""},{"title":""}]\n```';
    const items = parseProposal(text, [
      { id: "a", name: "Ada" },
      { id: "q", name: "QA" },
    ]);
    expect(items).toEqual([
      { title: "Build the toggle", owner: "a", after: [], doneWhen: ["Toggle works", "Persisted"], notes: "CSS variables" },
      { title: "Verify", owner: "q", after: [0], doneWhen: ["Checked"], notes: "" },
    ]);
    expect(() => parseProposal("Sorry, no.", [])).toThrow(/list of work items/);
  });

  it("writes each work item with its approach and checklist", () => {
    const d = itemDescription({ title: "Build", owner: null, after: [], doneWhen: ["Toggle works"], notes: "Use CSS variables; no theme library." }, feature);
    expect(d).toMatch(/Part of \*\*YOG-50 Dark mode\*\*/);
    expect(d).toMatch(/document\)\.\n\n### Approach\nUse CSS variables; no theme library\.\n\n## Done when/);
    expect(d).toMatch(/## Done when\n- \[ \] Toggle works/);
  });

  it("invites the planned owner, a manager and QA by default", () => {
    const staff = [
      { id: "m", name: "Manager", role: "pm", title: "Engineering Manager", status: "idle" },
      { id: "a", name: "Ada", role: "engineer", title: "Software Engineer", status: "idle" },
      { id: "f", name: "Fullstack1", role: "engineer", title: ".NET", status: "idle" },
      { id: "q", name: "QA", role: "qa", title: "QA Engineer", status: "idle" },
      { id: "x", name: "Gone", role: "engineer", title: "", status: "terminated" },
    ];
    expect(defaultAttendees(staff, "a")).toEqual(["m", "a", "q"]);
    expect(defaultAttendees(staff, null)).toEqual(["m", "q"]);
  });
});
