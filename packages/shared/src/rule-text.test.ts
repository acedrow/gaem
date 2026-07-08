import { describe, expect, it } from "vitest";

import { formatRuleText, parseRuleText, resolveRuleTermTooltip } from "./rule-text.js";

describe("resolveRuleTermTooltip", () => {
  it("resolves stacked weapon effects", () => {
    const tooltip = resolveRuleTermTooltip("Push:3");
    expect(tooltip?.title).toBe("Push");
    expect(tooltip?.description).toContain("Move the target away");
  });

  it("resolves literal aliases", () => {
    expect(resolveRuleTermTooltip("Breaker tag")?.title).toBe("Breaker");
    expect(resolveRuleTermTooltip("Swarm trait")?.title).toBe("Swarm");
  });

  it("resolves game terms", () => {
    expect(resolveRuleTermTooltip("Swarm")?.title).toBe("Swarm");
  });

  it("resolves range modifiers", () => {
    expect(resolveRuleTermTooltip("Range:4")?.title).toBe("Range");
  });
});

describe("parseRuleText", () => {
  it("splits text into plain and term segments", () => {
    const segments = parseRuleText("Deal Push:3 and Break a Swarm.");
    expect(segments).toEqual([
      { kind: "text", text: "Deal " },
      {
        kind: "term",
        text: "Push:3",
        tooltip: resolveRuleTermTooltip("Push:3"),
      },
      { kind: "text", text: " and Break a " },
      {
        kind: "term",
        text: "Swarm",
        tooltip: resolveRuleTermTooltip("Swarm"),
      },
      { kind: "text", text: "." },
    ]);
  });

  it("prefers longer literal matches over shorter terms", () => {
    const segments = parseRuleText("Units with the Swarm trait may swarm.");
    const terms = segments.filter((segment) => segment.kind === "term").map((segment) => segment.text);
    expect(terms).toContain("Swarm trait");
    expect(terms).not.toContain("Swarm");
  });
});

describe("formatRuleText", () => {
  it("wraps defined terms with a defined class", () => {
    expect(formatRuleText("Push:3")).toContain('class="rule-term rule-term--defined"');
    expect(formatRuleText("HP")).toContain('class="rule-term"');
    expect(formatRuleText("HP")).not.toContain("rule-term--defined");
  });
});
