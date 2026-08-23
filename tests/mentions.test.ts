import { describe, it, expect } from "vitest";
import { extractMentions } from "@/lib/tickets/service";

const USERS = [
  { id: "u-rahul", firstName: "Rahul", lastName: "Verma", email: "rahul@strike.io" },
  { id: "u-priya", firstName: "Priya", lastName: "Iyer", email: "priya.iyer@strike.io" },
  { id: "u-sunil", firstName: "Sunil", lastName: "Vootkuri", email: "sunil.v@corp.io" },
];

describe("@mention extraction", () => {
  it("matches first name mentions", () => {
    const ids = extractMentions("<p>@Rahul please finish the API validation</p>", USERS);
    expect(ids).toEqual(["u-rahul"]);
  });

  it("is case-insensitive", () => {
    const ids = extractMentions("<p>cc @RAHUL and @priya</p>", USERS);
    expect(ids.sort()).toEqual(["u-priya", "u-rahul"]);
  });

  it("matches email local-part mentions", () => {
    const ids = extractMentions("<p>@sunil.v can you review?</p>", USERS);
    expect(ids).toEqual(["u-sunil"]);
  });

  it("ignores unknown handles", () => {
    const ids = extractMentions("<p>@nobody @Rahul</p>", USERS);
    expect(ids).toEqual(["u-rahul"]);
  });

  it("deduplicates repeated mentions", () => {
    const ids = extractMentions("<p>@Rahul @rahul @Rahul please see this</p>", USERS);
    expect(ids).toEqual(["u-rahul"]);
  });
});
