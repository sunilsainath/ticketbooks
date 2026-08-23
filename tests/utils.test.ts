import { describe, it, expect } from "vitest";
import { cn, initials, stripHtml, excerpt, dueLabel, toCsv, colorFor } from "@/lib/utils";

describe("utils", () => {
  it("initials", () => {
    expect(initials("Sunil", "Vootkuri")).toBe("SV");
    expect(initials(null, null)).toBe("?");
  });

  it("stripHtml removes tags and collapses whitespace", () => {
    expect(stripHtml("<h1>Title</h1><p>Hello <b>world</b></p>")).toBe("Title Hello world");
  });

  it("excerpt truncates with ellipsis", () => {
    expect(excerpt("abcdefghij" , 5)).toBe("abcde...");
    expect(excerpt("ab", 5)).toBe("ab");
  });

  it("dueLabel classifies overdue / today / soon / normal", () => {
    const yesterday = new Date(Date.now() - 86400000 * 2);
    expect(dueLabel(yesterday).tone).toBe("overdue");
    const today = new Date();
    expect(dueLabel(today).tone).toBe("today");
    const in2days = new Date(Date.now() + 86400000 * 2);
    expect(dueLabel(in2days).tone).toBe("soon");
    const in30days = new Date(Date.now() + 86400000 * 30);
    expect(dueLabel(in30days).tone).toBe("normal");
    expect(dueLabel(null).tone).toBe("none");
  });

  it("toCsv escapes commas and quotes", () => {
    const csv = toCsv([{ a: 'say "hi"', b: "x,y" }], ["a", "b"]);
    expect(csv).toBe('a,b\n"say ""hi""","x,y"');
  });

  it("colorFor is deterministic per key", () => {
    expect(colorFor("WEB")).toBe(colorFor("WEB"));
    expect(colorFor("WEB")).not.toBe(colorFor("OPS"));
  });

  it("cn joins classes", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
