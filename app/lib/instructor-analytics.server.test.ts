import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, LessonProgressStatus, UserRole } from "~/db/schema";
import type { AnalyticsRange } from "./analytics";
import {
  bucketOf,
  bucketRange,
  calendarDay,
  getInstructorAnalytics,
  lastDayOfRefundWindow,
  summarizeRefundExposure,
  type InstructorAnalyticsQuery,
  type RefundExposureRow,
} from "./instructor-analytics.server";

type TestDb = ReturnType<typeof createTestDb>;

// Local noon, so calendar-day maths can't slip across midnight in any zone.
const NOW = new Date(2026, 9, 6, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

// ─── Pure helpers ───

describe("calendarDay", () => {
  it("formats a local date as YYYY-MM-DD with zero padding", () => {
    expect(calendarDay(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("lastDayOfRefundWindow", () => {
  it("is fourteen calendar days after the purchase, whatever the hour", () => {
    expect(
      lastDayOfRefundWindow(new Date(2026, 8, 22, 23, 0).toISOString())
    ).toBe("2026-10-06");
    expect(
      lastDayOfRefundWindow(new Date(2026, 8, 22, 0, 30).toISOString())
    ).toBe("2026-10-06");
  });

  it("rolls over month and year ends", () => {
    expect(
      lastDayOfRefundWindow(new Date(2026, 11, 25, 12).toISOString())
    ).toBe("2027-01-08");
  });
});

describe("bucketOf", () => {
  it("cuts an ISO timestamp to its day or month", () => {
    expect(bucketOf("2026-10-06T12:34:56.000Z", "day")).toBe("2026-10-06");
    expect(bucketOf("2026-10-06T12:34:56.000Z", "month")).toBe("2026-10");
  });
});

describe("bucketRange", () => {
  it("lists every day inclusive, across a month end", () => {
    expect(bucketRange("2026-09-29", "2026-10-02", "day")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("lists every month inclusive, across a year end", () => {
    expect(bucketRange("2025-11", "2026-02", "month")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("is a single bucket when first and last are the same", () => {
    expect(bucketRange("2026-10-06", "2026-10-06", "day")).toEqual([
      "2026-10-06",
    ]);
  });
});

describe("summarizeRefundExposure", () => {
  function row(
    courseId: number,
    amountPaid: number,
    purchasedDaysAgo: number
  ): RefundExposureRow {
    return {
      courseId,
      title: `Course ${courseId}`,
      amountPaid,
      createdAt: daysAgo(purchasedDaysAgo),
    };
  }

  it("is all zeros with no purchases", () => {
    expect(summarizeRefundExposure([], 0, NOW)).toEqual({
      grossCents: 0,
      netCents: 0,
      purchaseCount: 0,
      sharePercent: 0,
      closingTodayCount: 0,
      courses: [],
    });
  });

  it("counts a purchase made fourteen days ago as closing today", () => {
    const exposure = summarizeRefundExposure([row(1, 1000, 14)], 1000, NOW);

    expect(exposure.purchaseCount).toBe(1);
    expect(exposure.closingTodayCount).toBe(1);
    expect(exposure.courses[0].daysLeft).toBe(0);
  });

  it("ignores purchases whose window has closed", () => {
    const exposure = summarizeRefundExposure(
      [row(1, 1000, 15), row(1, 2000, 3)],
      3000,
      NOW
    );

    expect(exposure.grossCents).toBe(2000);
    expect(exposure.purchaseCount).toBe(1);
    expect(exposure.courses[0].daysLeft).toBe(11);
  });

  it("gives a purchase made today the full fourteen days", () => {
    const exposure = summarizeRefundExposure([row(1, 1000, 0)], 1000, NOW);
    expect(exposure.courses[0].daysLeft).toBe(14);
    expect(exposure.closingTodayCount).toBe(0);
  });

  it("groups by course, keeping the most urgent purchase as the headline", () => {
    const exposure = summarizeRefundExposure(
      [row(1, 1000, 2), row(1, 1000, 10), row(2, 5000, 1)],
      10000,
      NOW
    );

    expect(exposure.courses).toEqual([
      {
        courseId: 2,
        title: "Course 2",
        grossCents: 5000,
        purchaseCount: 1,
        daysLeft: 13,
      },
      {
        courseId: 1,
        title: "Course 1",
        grossCents: 2000,
        purchaseCount: 2,
        daysLeft: 4,
      },
    ]);
  });

  it("splits net from gross and states a share of total revenue", () => {
    const exposure = summarizeRefundExposure([row(1, 2500, 1)], 10000, NOW);

    expect(exposure.grossCents).toBe(2500);
    expect(exposure.netCents).toBe(2000);
    expect(exposure.sharePercent).toBe(25);
  });
});

// ─── getInstructorAnalytics ───

describe("getInstructorAnalytics", () => {
  let db: TestDb;
  let base: ReturnType<typeof seedBaseData>;

  beforeEach(() => {
    db = createTestDb();
    base = seedBaseData(db);
  });

  function analyticsFor(query: Partial<InstructorAnalyticsQuery> = {}) {
    return getInstructorAnalytics(
      db,
      {
        instructorId: base.instructor.id,
        range: "30d" as AnalyticsRange,
        requestedCourseId: null,
        includeInstructorPicker: false,
        ...query,
      },
      NOW
    );
  }

  function addUser(name: string, role = UserRole.Student) {
    return db
      .insert(schema.users)
      .values({
        name,
        email: `${name.toLowerCase().replace(/\s/g, ".")}@example.com`,
        role,
      })
      .returning()
      .get();
  }

  function addCourse(
    instructorId: number,
    title: string,
    status = CourseStatus.Published
  ) {
    return db
      .insert(schema.courses)
      .values({
        title,
        slug: title.toLowerCase().replace(/\s/g, "-"),
        description: title,
        salesCopy: title,
        instructorId,
        categoryId: base.category.id,
        status,
      })
      .returning()
      .get();
  }

  function addPurchase(
    userId: number,
    courseId: number,
    amountPaid: number,
    createdAt: string,
    country: string | null = "US"
  ) {
    return db
      .insert(schema.purchases)
      .values({ userId, courseId, amountPaid, createdAt, country })
      .returning()
      .get();
  }

  function enroll(userId: number, courseId: number, enrolledAt = daysAgo(1)) {
    db.insert(schema.enrollments)
      .values({ userId, courseId, enrolledAt })
      .run();
  }

  function addModule(courseId: number, title: string, position: number) {
    return db
      .insert(schema.modules)
      .values({ courseId, title, position })
      .returning()
      .get();
  }

  function addLesson(moduleId: number, title: string, position: number) {
    return db
      .insert(schema.lessons)
      .values({ moduleId, title, position })
      .returning()
      .get();
  }

  function complete(userId: number, lessonId: number) {
    db.insert(schema.lessonProgress)
      .values({ userId, lessonId, status: LessonProgressStatus.Completed })
      .run();
  }

  describe("with no activity", () => {
    it("reports zeros everywhere rather than nulls", () => {
      const result = analyticsFor();

      expect(result.summary).toEqual({
        grossCents: 0,
        feeCents: 0,
        netCents: 0,
        purchaseCount: 0,
      });
      expect(result.courses).toEqual([]);
      expect(result.audience).toEqual({
        buyerCount: 0,
        studentCount: 0,
        revenuePerStudentCents: null,
      });
      expect(result.buyers).toEqual([]);
      expect(result.ratings).toEqual({ average: null, count: 0 });
      expect(result.questions).toEqual({ inRange: 0, older: 0 });
      expect(result.refundExposure.purchaseCount).toBe(0);
    });

    it("still spans the whole range in the revenue series", () => {
      const { series } = analyticsFor({ range: "7d" });

      expect(series.granularity).toBe("day");
      expect(series.points).toHaveLength(8);
      expect(series.points.at(-1)?.bucket).toBe(
        bucketOf(NOW.toISOString(), "day")
      );
      expect(series.points.every((point) => point.grossCents === 0)).toBe(true);
    });

    it("has an empty series for all time", () => {
      expect(analyticsFor({ range: "all" }).series).toEqual({
        granularity: "month",
        points: [],
      });
    });
  });

  describe("revenue", () => {
    it("splits gross into the platform fee and the instructor's net", () => {
      addPurchase(base.user.id, base.course.id, 4999, daysAgo(2));
      addPurchase(base.user.id, base.course.id, 5001, daysAgo(3));

      expect(analyticsFor().summary).toEqual({
        grossCents: 10000,
        feeCents: 2000,
        netCents: 8000,
        purchaseCount: 2,
      });
    });

    it("leaves out purchases older than the range, but not for all time", () => {
      addPurchase(base.user.id, base.course.id, 1000, daysAgo(5));
      addPurchase(base.user.id, base.course.id, 2000, daysAgo(45));

      expect(analyticsFor({ range: "30d" }).summary.grossCents).toBe(1000);
      expect(analyticsFor({ range: "all" }).summary.grossCents).toBe(3000);
    });

    it("leaves out other instructors' sales, unless platform-wide", () => {
      const other = addUser("Other Instructor", UserRole.Instructor);
      const otherCourse = addCourse(other.id, "Other Course");
      addPurchase(base.user.id, base.course.id, 1000, daysAgo(1));
      addPurchase(base.user.id, otherCourse.id, 7000, daysAgo(1));

      expect(analyticsFor().summary.grossCents).toBe(1000);
      expect(analyticsFor({ instructorId: null }).summary.grossCents).toBe(
        8000
      );
    });

    it("breaks revenue down by course, biggest earner first", () => {
      const second = addCourse(base.instructor.id, "Second Course");
      addPurchase(base.user.id, base.course.id, 1000, daysAgo(1));
      addPurchase(base.user.id, second.id, 3000, daysAgo(1));
      addPurchase(base.user.id, second.id, 3000, daysAgo(2));

      expect(analyticsFor().courses).toEqual([
        {
          courseId: second.id,
          title: "Second Course",
          grossCents: 6000,
          feeCents: 1200,
          netCents: 4800,
          purchaseCount: 2,
        },
        {
          courseId: base.course.id,
          title: "Test Course",
          grossCents: 1000,
          feeCents: 200,
          netCents: 800,
          purchaseCount: 1,
        },
      ]);
    });

    it("puts each sale in its day's bucket of the series", () => {
      const purchasedAt = daysAgo(3);
      addPurchase(base.user.id, base.course.id, 2500, purchasedAt);

      const { series } = analyticsFor({ range: "7d" });
      const point = series.points.find(
        (p) => p.bucket === bucketOf(purchasedAt, "day")
      );

      expect(point).toEqual({
        bucket: bucketOf(purchasedAt, "day"),
        grossCents: 2500,
        netCents: 2000,
      });
    });

    it("buckets all time by month, starting at the first sale", () => {
      addPurchase(
        base.user.id,
        base.course.id,
        1000,
        "2026-07-15T12:00:00.000Z"
      );

      const { series } = analyticsFor({ range: "all" });

      expect(series.granularity).toBe("month");
      expect(series.points.map((p) => p.bucket)).toEqual([
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
      ]);
      expect(series.points[0].grossCents).toBe(1000);
    });
  });

  describe("refund exposure", () => {
    it("counts sales still inside their window, as of the given time", () => {
      addPurchase(base.user.id, base.course.id, 3000, daysAgo(2));
      addPurchase(base.user.id, base.course.id, 1000, daysAgo(20));

      const { refundExposure } = analyticsFor();

      expect(refundExposure).toMatchObject({
        grossCents: 3000,
        netCents: 2400,
        purchaseCount: 1,
        sharePercent: 75,
        closingTodayCount: 0,
      });
      expect(refundExposure.courses).toEqual([
        {
          courseId: base.course.id,
          title: "Test Course",
          grossCents: 3000,
          purchaseCount: 1,
          daysLeft: 12,
        },
      ]);
    });
  });

  describe("audience and top buyers", () => {
    function seedTeamPurchase() {
      const buyer = addUser("Team Buyer");
      const seatA = addUser("Seat A");
      const seatB = addUser("Seat B");
      const solo = addUser("Solo");

      const team = db.insert(schema.teams).values({}).returning().get();
      const teamPurchase = addPurchase(
        buyer.id,
        base.course.id,
        9000,
        daysAgo(3)
      );
      const coupon = (code: string, redeemedByUserId: number | null) =>
        db
          .insert(schema.coupons)
          .values({
            teamId: team.id,
            courseId: base.course.id,
            code,
            purchaseId: teamPurchase.id,
            redeemedByUserId,
            redeemedAt: redeemedByUserId === null ? null : daysAgo(2),
          })
          .run();
      coupon("SEAT-A", seatA.id);
      coupon("SEAT-B", seatB.id);
      coupon("SEAT-C", null);
      enroll(seatA.id, base.course.id);
      enroll(seatB.id, base.course.id);

      addPurchase(solo.id, base.course.id, 5000, daysAgo(1));
      enroll(solo.id, base.course.id);

      return { buyer, seatA, seatB, solo };
    }

    it("counts buyers and students separately, sharing seat cost out", () => {
      seedTeamPurchase();

      // Two people paid; three are learning. 3000 + 3000 + 5000 across three.
      expect(analyticsFor().audience).toEqual({
        buyerCount: 2,
        studentCount: 3,
        revenuePerStudentCents: 3667,
      });
    });

    it("ranks buyers by spend with their seats and enrolment", () => {
      const { buyer, solo } = seedTeamPurchase();

      expect(analyticsFor().buyers).toEqual([
        {
          userId: buyer.id,
          name: "Team Buyer",
          email: "team.buyer@example.com",
          spendCents: 9000,
          purchaseCount: 1,
          seatsBought: 3,
          seatsUnredeemed: 1,
          enrolled: false,
        },
        {
          userId: solo.id,
          name: "Solo",
          email: "solo@example.com",
          spendCents: 5000,
          purchaseCount: 1,
          seatsBought: 0,
          seatsUnredeemed: 0,
          enrolled: true,
        },
      ]);
    });
  });

  describe("ratings", () => {
    it("averages in-range ratings to one decimal place", () => {
      const rate = (rating: number, createdAt: string) => {
        const user = addUser(`Rater ${rating} ${createdAt}`);
        db.insert(schema.courseRatings)
          .values({
            userId: user.id,
            courseId: base.course.id,
            rating,
            createdAt,
          })
          .run();
      };
      rate(5, daysAgo(1));
      rate(4, daysAgo(2));
      rate(4, daysAgo(3));
      rate(1, daysAgo(60));

      expect(analyticsFor().ratings).toEqual({ average: 4.3, count: 3 });
    });
  });

  describe("unanswered questions", () => {
    it("splits unanswered student questions into in-range and older", () => {
      const module = addModule(base.course.id, "Module", 1);
      const lesson = addLesson(module.id, "Lesson", 1);
      const comment = (
        userId: number,
        createdAt: string,
        extra: Partial<typeof schema.comments.$inferInsert> = {}
      ) =>
        db
          .insert(schema.comments)
          .values({
            lessonId: lesson.id,
            userId,
            body: "?",
            createdAt,
            ...extra,
          })
          .returning()
          .get();
      const admin = addUser("Admin", UserRole.Admin);
      const peer = addUser("Peer");

      comment(base.user.id, daysAgo(1)); // unanswered, in range
      comment(base.user.id, daysAgo(60)); // unanswered, older

      const peerAnswered = comment(base.user.id, daysAgo(2));
      comment(peer.id, daysAgo(1), { parentId: peerAnswered.id }); // still counts

      const instructorAnswered = comment(base.user.id, daysAgo(2));
      comment(base.instructor.id, daysAgo(1), {
        parentId: instructorAnswered.id,
      });

      const adminAnswered = comment(base.user.id, daysAgo(2));
      comment(admin.id, daysAgo(1), { parentId: adminAnswered.id });

      const deletedReply = comment(base.user.id, daysAgo(2)); // still counts
      comment(base.instructor.id, daysAgo(1), {
        parentId: deletedReply.id,
        deletedAt: daysAgo(1),
      });

      comment(base.instructor.id, daysAgo(1)); // staff's own question
      comment(admin.id, daysAgo(1)); // staff's own question
      comment(base.user.id, daysAgo(1), { deletedAt: daysAgo(1) }); // deleted

      expect(analyticsFor().questions).toEqual({ inRange: 3, older: 1 });
      expect(analyticsFor({ range: "all" }).questions).toEqual({
        inRange: 4,
        older: 0,
      });
    });
  });

  describe("the instructor picker and empty state", () => {
    it("lists course owners only when asked to", () => {
      const other = addUser("Another Instructor", UserRole.Instructor);
      addCourse(other.id, "Another Course");
      addUser("Instructor With No Courses", UserRole.Instructor);

      expect(analyticsFor().instructors).toEqual([]);
      expect(
        analyticsFor({ includeInstructorPicker: true }).instructors
      ).toEqual([
        { id: other.id, name: "Another Instructor" },
        { id: base.instructor.id, name: "Test Instructor" },
      ]);
    });

    it("flags an instructor with nothing published", () => {
      const newcomer = addUser("Newcomer", UserRole.Instructor);
      addCourse(newcomer.id, "Draft Course", CourseStatus.Draft);

      expect(analyticsFor({ instructorId: newcomer.id }).unpublished).toBe(
        true
      );
      expect(analyticsFor().unpublished).toBe(false);
      expect(analyticsFor({ instructorId: null }).unpublished).toBe(false);
    });
  });

  describe("the selected course", () => {
    it("lists the instructor's own courses as options", () => {
      const other = addUser("Other Instructor", UserRole.Instructor);
      addCourse(other.id, "Not Mine");
      const draft = addCourse(
        base.instructor.id,
        "A Draft",
        CourseStatus.Draft
      );

      expect(analyticsFor().courseOptions).toEqual([
        { courseId: draft.id, title: "A Draft" },
        { courseId: base.course.id, title: "Test Course" },
      ]);
    });

    it("refuses another instructor's course and returns no course panels", () => {
      const other = addUser("Other Instructor", UserRole.Instructor);
      const theirs = addCourse(other.id, "Not Mine");

      const result = analyticsFor({ requestedCourseId: theirs.id });

      expect(result.selectedCourseId).toBeNull();
      expect(result.progress).toBeNull();
      expect(result.funnel).toBeNull();
      expect(result.quizzes).toBeNull();
      expect(result.countries).toBeNull();
    });

    it("lets platform-wide view open any course", () => {
      const other = addUser("Other Instructor", UserRole.Instructor);
      const theirs = addCourse(other.id, "Not Mine");

      expect(
        analyticsFor({ instructorId: null, requestedCourseId: theirs.id })
          .selectedCourseId
      ).toBe(theirs.id);
    });

    it("ignores an id that is no course at all", () => {
      expect(
        analyticsFor({ requestedCourseId: 9999 }).selectedCourseId
      ).toBeNull();
    });

    describe("progress, drop-off and quizzes", () => {
      function seedCurriculum() {
        const first = addModule(base.course.id, "First", 1);
        const second = addModule(base.course.id, "Second", 2);
        const l1 = addLesson(first.id, "L1", 1);
        const l2 = addLesson(first.id, "L2", 2);
        const l3 = addLesson(second.id, "L3", 1);

        const finisher = addUser("Finisher");
        const starter = addUser("Starter");
        const ghost = addUser("Ghost");
        const gatecrasher = addUser("Gatecrasher"); // not enrolled

        for (const user of [finisher, starter, ghost]) {
          enroll(user.id, base.course.id);
        }
        for (const lesson of [l1, l2, l3]) complete(finisher.id, lesson.id);
        complete(starter.id, l1.id);
        for (const lesson of [l1, l2, l3]) complete(gatecrasher.id, lesson.id);

        return { first, second, l1, l2, l3, finisher, starter, ghost };
      }

      it("summarises progress across enrolled students", () => {
        seedCurriculum();

        expect(
          analyticsFor({ requestedCourseId: base.course.id }).progress
        ).toEqual({
          enrolledCount: 3,
          totalLessons: 3,
          averageProgressPercent: 44,
          finishedCount: 1,
        });
      });

      it("builds the drop-off funnel by module and lesson", () => {
        const { first, second, l1, l2, l3 } = seedCurriculum();

        expect(
          analyticsFor({ requestedCourseId: base.course.id }).funnel
        ).toEqual({
          enrolledCount: 3,
          modules: [
            {
              moduleId: first.id,
              title: "First",
              reachedCount: 2,
              dropWithin: 1,
              lessons: [
                {
                  lessonId: l1.id,
                  title: "L1",
                  reachedCount: 2,
                  dropFromPrevious: 1,
                },
                {
                  lessonId: l2.id,
                  title: "L2",
                  reachedCount: 1,
                  dropFromPrevious: 1,
                },
              ],
            },
            {
              moduleId: second.id,
              title: "Second",
              reachedCount: 1,
              dropWithin: 0,
              lessons: [
                {
                  lessonId: l3.id,
                  title: "L3",
                  reachedCount: 1,
                  dropFromPrevious: 0,
                },
              ],
            },
          ],
        });
      });

      it("reports quiz pass rates from each student's best in-range attempt", () => {
        const { l1, finisher, starter, ghost } = seedCurriculum();
        const quiz = db
          .insert(schema.quizzes)
          .values({ lessonId: l1.id, title: "Quiz 1", passingScore: 0.7 })
          .returning()
          .get();
        const attempt = (userId: number, score: number, attemptedAt: string) =>
          db
            .insert(schema.quizAttempts)
            .values({
              userId,
              quizId: quiz.id,
              score,
              passed: score >= 0.7,
              attemptedAt,
            })
            .run();

        attempt(finisher.id, 0.5, daysAgo(5));
        attempt(finisher.id, 0.9, daysAgo(4));
        attempt(starter.id, 0.6, daysAgo(3));
        attempt(ghost.id, 1, daysAgo(60)); // outside the range

        expect(
          analyticsFor({ requestedCourseId: base.course.id }).quizzes
        ).toEqual([
          {
            quizId: quiz.id,
            title: "Quiz 1",
            moduleTitle: "First",
            lessonTitle: "L1",
            passingScorePercent: 70,
            studentCount: 2,
            passedCount: 1,
            passRatePercent: 50,
            averageBestScorePercent: 75,
          },
        ]);
      });
    });

    it("breaks the course's revenue down by country with PPP discounts", () => {
      addPurchase(base.user.id, base.course.id, 12000, daysAgo(1), "US");
      addPurchase(base.user.id, base.course.id, 5000, daysAgo(1), "IN");
      addPurchase(base.user.id, base.course.id, 5000, daysAgo(2), "IN");
      addPurchase(base.user.id, base.course.id, 2000, daysAgo(2), null);
      addPurchase(base.user.id, base.course.id, 99999, daysAgo(60), "IN");

      expect(
        analyticsFor({ requestedCourseId: base.course.id }).countries
      ).toEqual({
        grossCents: 24000,
        netCents: 19200,
        purchaseCount: 4,
        discountedGrossCents: 10000,
        discountedNetCents: 8000,
        discountedSharePercent: 42,
        rows: [
          {
            country: "US",
            grossCents: 12000,
            netCents: 9600,
            purchaseCount: 1,
            sharePercent: 50,
            averagePaidCents: 12000,
            discountPercent: 0,
          },
          {
            country: "IN",
            grossCents: 10000,
            netCents: 8000,
            purchaseCount: 2,
            sharePercent: 42,
            averagePaidCents: 5000,
            discountPercent: 50,
          },
          {
            country: null,
            grossCents: 2000,
            netCents: 1600,
            purchaseCount: 1,
            sharePercent: 8,
            averagePaidCents: 2000,
            discountPercent: null,
          },
        ],
      });
    });
  });
});
