import { describe, expect, it } from "vitest";
import { MAX_FOCUS, toggled } from "./focus";

describe("focus list", () => {
  it("pins, unpins and stops at the limit", () => {
    expect(toggled([], "a")).toEqual(["a"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
    const full = Array.from({ length: MAX_FOCUS }, (_, i) => String(i));
    expect(toggled(full, "x")).toBeNull();
    expect(toggled(full, "0")).toHaveLength(MAX_FOCUS - 1);
  });
});
