import { describe, expect, it } from "vitest";
import { RosterStatus } from "~/db/schema";
import {
  DEFAULT_ROSTER_VIEW,
  applyRosterView,
  filterRoster,
  parseRosterView,
  sortRoster,
  type RosterStudent,
} from "../index";

// Noon UTC keeps each date on the same calendar day in every timezone a test
// might run in.
function student(
  name: string,
  overrides: Partial<RosterStudent> = {}
): RosterStudent {
  return {
    key: name,
    enrollmentId: 1,
    userId: 1,
    name,
    email: `${name.toLowerCase()}@example.com`,
    enrolledAt: "2026-01-10T12:00:00.000Z",
    progress: 0,
    status: RosterStatus.NotStarted,
    quizScores: [],
    ...overrides,
  };
}

function quizzes(...scores: (number | null)[]) {
  return scores.map((bestScore, index) => ({
    quizId: index,
    quizTitle: `Quiz ${index}`,
    lessonTitle: `Lesson ${index}`,
    bestScore,
    passed: bestScore === null ? null : bestScore >= 0.7,
  }));
}

const names = (students: RosterStudent[]) => students.map((s) => s.name);

describe("parseRosterView", () => {
  it("defaults to every Student, newest Enrollment first", () => {
    expect(parseRosterView(new URLSearchParams())).toEqual({
      q: "",
      from: "",
      to: "",
      sort: "enrolled",
      dir: "desc",
    });
  });

  it("reads each param", () => {
    const params = new URLSearchParams(
      "q=ada&from=2026-01-01&to=2026-02-01&sort=name&dir=asc"
    );

    expect(parseRosterView(params)).toEqual({
      q: "ada",
      from: "2026-01-01",
      to: "2026-02-01",
      sort: "name",
      dir: "asc",
    });
  });

  it("rejects a date with anything around it", () => {
    const params = new URLSearchParams("from=x2026-01-01&to=2026-01-01x");

    expect(parseRosterView(params)).toMatchObject({ from: "", to: "" });
  });

  it("falls back to the default for a param it cannot use", () => {
    const params = new URLSearchParams(
      "from=yesterday&to=2026-13&sort=shoe-size&dir=sideways"
    );

    expect(parseRosterView(params)).toEqual(DEFAULT_ROSTER_VIEW);
  });
});

describe("filterRoster", () => {
  const roster = [
    student("Ada Lovelace", { email: "countess@analytical.org" }),
    student("Alan Turing", { email: "alan@bletchley.uk" }),
    student("Grace Hopper", { email: "grace@navy.mil" }),
  ];
  const noDates = { from: "", to: "" };

  it("keeps everyone when the search is empty or blank", () => {
    expect(filterRoster(roster, { q: "  ", ...noDates })).toHaveLength(3);
  });

  it("matches the name, ignoring case", () => {
    expect(names(filterRoster(roster, { q: "LOVE", ...noDates }))).toEqual([
      "Ada Lovelace",
    ]);
  });

  it("matches the email", () => {
    expect(names(filterRoster(roster, { q: "bletchley", ...noDates }))).toEqual(
      ["Alan Turing"]
    );
  });

  it("finds no one for a search nobody matches", () => {
    expect(filterRoster(roster, { q: "zzz", ...noDates })).toEqual([]);
  });

  describe("by enrolled date", () => {
    const dated = [
      student("January", { enrolledAt: "2026-01-10T12:00:00.000Z" }),
      student("February", { enrolledAt: "2026-02-10T12:00:00.000Z" }),
      student("March", { enrolledAt: "2026-03-10T12:00:00.000Z" }),
    ];

    it("keeps Students enrolled on or after `from`", () => {
      expect(
        names(filterRoster(dated, { q: "", from: "2026-02-10", to: "" }))
      ).toEqual(["February", "March"]);
    });

    it("keeps Students enrolled on or before `to`", () => {
      expect(
        names(filterRoster(dated, { q: "", from: "", to: "2026-02-10" }))
      ).toEqual(["January", "February"]);
    });

    it("compares whole days, including single-digit ones", () => {
      const early = [
        student("Fifth", { enrolledAt: "2026-01-05T12:00:00.000Z" }),
        student("Twelfth", { enrolledAt: "2026-01-12T12:00:00.000Z" }),
      ];

      expect(
        names(filterRoster(early, { q: "", from: "2026-01-10", to: "" }))
      ).toEqual(["Twelfth"]);
    });

    it("applies both bounds and the search together", () => {
      const view = { q: "ma", from: "2026-01-11", to: "2026-03-10" };

      expect(names(filterRoster(dated, view))).toEqual(["March"]);
    });
  });
});

describe("sortRoster", () => {
  it("sorts by name, ignoring case", () => {
    const roster = [student("bob"), student("Alice"), student("Carol")];

    expect(names(sortRoster(roster, { sort: "name", dir: "asc" }))).toEqual([
      "Alice",
      "bob",
      "Carol",
    ]);
    expect(names(sortRoster(roster, { sort: "name", dir: "desc" }))).toEqual([
      "Carol",
      "bob",
      "Alice",
    ]);
  });

  it("sorts by enrolled date", () => {
    const roster = [
      student("Feb", { enrolledAt: "2026-02-01T00:00:00.000Z" }),
      student("Jan", { enrolledAt: "2026-01-01T00:00:00.000Z" }),
      student("Mar", { enrolledAt: "2026-03-01T00:00:00.000Z" }),
    ];

    expect(
      names(sortRoster(roster, { sort: "enrolled", dir: "desc" }))
    ).toEqual(["Mar", "Feb", "Jan"]);
    expect(names(sortRoster(roster, { sort: "enrolled", dir: "asc" }))).toEqual(
      ["Jan", "Feb", "Mar"]
    );
  });

  it("sorts by progress", () => {
    const roster = [
      student("Half", { progress: 50 }),
      student("None", { progress: 0 }),
      student("All", { progress: 100 }),
    ];

    expect(names(sortRoster(roster, { sort: "progress", dir: "asc" }))).toEqual(
      ["None", "Half", "All"]
    );
  });

  it("sorts status as Not Started, In Progress, Completed, then Lapsed", () => {
    const roster = [
      student("Lapsed", { status: RosterStatus.Lapsed }),
      student("Completed", { status: RosterStatus.Completed }),
      student("Not Started", { status: RosterStatus.NotStarted }),
      student("In Progress", { status: RosterStatus.InProgress }),
    ];

    expect(names(sortRoster(roster, { sort: "status", dir: "asc" }))).toEqual([
      "Not Started",
      "In Progress",
      "Completed",
      "Lapsed",
    ]);
  });

  describe("by quiz score", () => {
    const roster = [
      student("Aaron Never", { quizScores: quizzes(null, null) }),
      student("Average 0.6", { quizScores: quizzes(0.4, 0.8) }),
      student("Only 0.9", { quizScores: quizzes(0.9, null) }),
      student("Average 0.5", { quizScores: quizzes(0.5, 0.5) }),
    ];

    it("averages the best scores the Student has, lowest first", () => {
      expect(names(sortRoster(roster, { sort: "quiz", dir: "asc" }))).toEqual([
        "Average 0.5",
        "Average 0.6",
        "Only 0.9",
        "Aaron Never",
      ]);
    });

    it("puts Students with no attempt last when sorting highest first too", () => {
      expect(names(sortRoster(roster, { sort: "quiz", dir: "desc" }))).toEqual([
        "Only 0.9",
        "Average 0.6",
        "Average 0.5",
        "Aaron Never",
      ]);
    });
  });

  it("breaks ties by name", () => {
    const roster = [
      student("Zed", { progress: 10 }),
      student("Amy", { progress: 10 }),
    ];

    expect(
      names(sortRoster(roster, { sort: "progress", dir: "desc" }))
    ).toEqual(["Amy", "Zed"]);
  });

  it("leaves the input in its original order", () => {
    const roster = [student("B"), student("A")];

    sortRoster(roster, { sort: "name", dir: "asc" });

    expect(names(roster)).toEqual(["B", "A"]);
  });
});

describe("applyRosterView", () => {
  it("filters, then sorts", () => {
    const roster = [
      student("Ada", { progress: 10 }),
      student("Alan", { progress: 90 }),
      student("Grace", { progress: 50 }),
      student("Bob", { progress: 70, enrolledAt: "2025-12-01T12:00:00.000Z" }),
    ];
    const view = {
      ...DEFAULT_ROSTER_VIEW,
      from: "2026-01-01",
      sort: "progress" as const,
    };

    expect(names(applyRosterView(roster, view))).toEqual([
      "Alan",
      "Grace",
      "Ada",
    ]);
  });
});
