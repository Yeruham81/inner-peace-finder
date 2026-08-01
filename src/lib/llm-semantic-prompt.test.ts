import { describe, expect, it } from "bun:test";
import {
  LLM_SEMANTIC_PROMPT_VERSION,
  buildLlmSemanticPrompt,
  formatProblemCatalog,
} from "./llm-semantic-prompt";
import type { CanonicalProblemEntry } from "./llm-semantic-contract";

const CATALOG: CanonicalProblemEntry[] = [
  { slug: "depression", name: "דיכאון", aliases: ["מצב רוח ירוד", "עצבות"] },
  { slug: "anxiety", name: "חרדה", aliases: ["פחדים"] },
  { slug: "trauma", name: "טראומה", aliases: [] },
];

describe("prompt builder", () => {
  it("exposes a stable prompt version", () => {
    expect(LLM_SEMANTIC_PROMPT_VERSION).toBe("q2-semantic-v1");
  });

  it("formats the catalog compactly and deterministically", () => {
    expect(formatProblemCatalog(CATALOG)).toBe(
      ["anxiety|חרדה|פחדים", "depression|דיכאון|מצב רוח ירוד, עצבות", "trauma|טראומה"].join("\n"),
    );
  });

  it("is unaffected by catalog row order", () => {
    const a = buildLlmSemanticPrompt({ semanticRemainder: "לחץ", allowedProblems: CATALOG });
    const b = buildLlmSemanticPrompt({
      semanticRemainder: "לחץ",
      allowedProblems: [...CATALOG].reverse(),
    });
    expect(a).toEqual(b);
  });

  it("instructs slug-only output, abstention and no structured extraction", () => {
    const { system, promptVersion } = buildLlmSemanticPrompt({
      semanticRemainder: "לחץ",
      allowedProblems: CATALOG,
    });
    expect(promptVersion).toBe(LLM_SEMANTIC_PROMPT_VERSION);
    expect(system).toContain("Never invent");
    expect(system).toContain("Prefer abstention over speculation");
    expect(system).toContain("at most 3 matches");
    expect(system).toContain("Do NOT extract cities");
    expect(system).toContain("Do NOT recommend treatment");
    expect(system).toContain("Do NOT write prose");
    expect(system).toContain('"abstained"');
  });

  it("sends only the remainder as query content", () => {
    const { user } = buildLlmSemanticPrompt({
      semanticRemainder: "  קשיים בזוגיות  ",
      allowedProblems: CATALOG,
    });
    expect(user).toContain("REMAINDER:\nקשיים בזוגיות");
    expect(user.includes("therapist")).toBe(false);
  });
});