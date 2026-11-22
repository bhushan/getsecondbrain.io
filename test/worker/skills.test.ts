import { describe, expect, it } from "vitest";
import { assignSlugs, composeSkill, isSkillPath, parseSkill, parseSkillText, skillNotePath } from "../../src/worker/lib/skills";

describe("isSkillPath", () => {
  it("is true for the Skills folder and anything under it, in any letter case", () => {
    for (const path of ["Skills/Code review", "skills/Writing/Blog post", "SKILLS/x/SKILL"]) expect(isSkillPath(path), path).toBe(true);
  });

  it("is false for other notes, including ones that only start with the same letters", () => {
    for (const path of ["Skills", "Skillset/Notes", "Notes/Skills/x", "Projects/Launch"]) expect(isSkillPath(path), path).toBe(false);
  });
});

describe("parseSkill", () => {
  it("reads name, description and instructions from SKILL.md style frontmatter", () => {
    const skill = parseSkill("Skills/Code review", "---\nname: Review code\ndescription: Review a diff for bugs.\n---\n1. Read the diff.\n");
    expect(skill).toEqual({
      path: "Skills/Code review",
      name: "Review code",
      description: "Review a diff for bugs.",
      bundle: null,
      instructions: "1. Read the diff.",
    });
  });

  it("joins a description wrapped over several indented lines, and folded or quoted values", () => {
    const wrapped = "---\nname: Review\ndescription: Review a diff for bugs,\n  security and naming. Use when the\n  user asks for a review.\n---\nBody";
    expect(parseSkill("Skills/Review", wrapped).description).toBe("Review a diff for bugs, security and naming. Use when the user asks for a review.");
    expect(parseSkill("Skills/Review", "---\ndescription: >\n  Folded\n  text\n---\nBody").description).toBe("Folded text");
    expect(parseSkill("Skills/Review", "---\ndescription: \"Quoted: yes\"\n---\nBody").description).toBe("Quoted: yes");
  });

  it("falls back to the note title and the first line of the instructions when frontmatter is missing", () => {
    const skill = parseSkill("Skills/Tweet thread", "# Tweet thread\n\nTurn a post into a thread of short tweets.\n\nMore detail.");
    expect(skill.name).toBe("Tweet thread");
    expect(skill.description).toBe("Turn a post into a thread of short tweets.");
    expect(skill.instructions).toBe("# Tweet thread\n\nTurn a post into a thread of short tweets.\n\nMore detail.");
  });

  it("takes the bundle from the folder under Skills", () => {
    expect(parseSkill("Skills/Writing/Blog post", "x").bundle).toBe("Writing");
    expect(parseSkill("Skills/Writing/Social/Thread", "x").bundle).toBe("Writing/Social");
  });

  it("treats an imported skill folder (Skills/name/SKILL) as one skill named after its folder", () => {
    const skill = parseSkill("Skills/Writing/pdf-tools/SKILL", "Fill PDF forms.");
    expect(skill.name).toBe("pdf-tools");
    expect(skill.bundle).toBe("Writing");
    expect(parseSkill("Skills/pdf-tools/SKILL", "x").bundle).toBeNull();
  });

  it("caps very long names and descriptions", () => {
    const skill = parseSkill("Skills/x", `---\nname: ${"n".repeat(500)}\ndescription: ${"d".repeat(5000)}\n---\nBody`);
    expect(skill.name.length).toBeLessThanOrEqual(100);
    expect(skill.description.length).toBeLessThanOrEqual(1024);
  });
});

describe("parseSkillText", () => {
  it("reads a pasted SKILL.md into the fields of the skill form", () => {
    expect(parseSkillText("---\nname: Blog post\ndescription: Write a blog post.\n---\n\nStart with the point.\n")).toEqual({
      name: "Blog post",
      description: "Write a blog post.",
      instructions: "Start with the point.",
    });
  });

  it("keeps plain pasted text as the instructions", () => {
    expect(parseSkillText("Just do the thing.")).toEqual({ name: "", description: "", instructions: "Just do the thing." });
  });
});

describe("composeSkill", () => {
  it("writes frontmatter that parseSkill reads back, quoting values that need it", () => {
    const body = composeSkill({ name: "Review: code", description: "Find bugs.\nAnd naming.", instructions: "Step 1\n" });
    expect(body).toBe('---\nname: "Review: code"\ndescription: "Find bugs. And naming."\n---\n\nStep 1\n');
    const skill = parseSkill("Skills/Review", body);
    expect(skill.name).toBe("Review: code");
    expect(skill.description).toBe("Find bugs. And naming.");
    expect(skill.instructions).toBe("Step 1");
  });
});

describe("assignSlugs", () => {
  it("gives every skill a stable, unique, prompt-safe name", () => {
    const skills = [
      parseSkill("Skills/Writing/Blog post", "x"),
      parseSkill("Skills/Code review", "x"),
      parseSkill("Skills/Other/Code review", "---\nname: Code review\n---\nx"),
      parseSkill("Skills/Code-review!", "x"),
    ];
    expect(assignSlugs(skills).map((skill) => skill.slug)).toEqual(["writing-blog-post", "code-review", "other-code-review", "code-review-2"]);
  });
});

describe("skillNotePath", () => {
  it("puts a skill in the Skills folder, inside its bundle when it has one", () => {
    expect(skillNotePath({ name: "Blog post", bundle: "" })).toBe("Skills/Blog post");
    expect(skillNotePath({ name: "Blog post", bundle: " Writing / Social " })).toBe("Skills/Writing/Social/Blog post");
  });

  it("turns characters a note path cannot hold into spaces, and a slash in the name into a dash", () => {
    expect(skillNotePath({ name: "PR #12 [draft] | a/b ^x", bundle: "" })).toBe("Skills/PR 12 draft a-b x");
  });

  it("is null when the name is empty after cleaning", () => {
    expect(skillNotePath({ name: " #[] ", bundle: "Writing" })).toBeNull();
  });
});
