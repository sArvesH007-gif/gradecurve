import { beforeEach, describe, expect, test, vi } from "vitest";

const { getCurrentUser, getDemoStudyPartnerRecommendations } = vi.hoisted(
  () => ({
    getCurrentUser: vi.fn(),
    getDemoStudyPartnerRecommendations: vi.fn(),
  }),
);
vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/neo4j/recommendations", () => ({
  getDemoStudyPartnerRecommendations,
}));

import { GET } from "@/app/api/student/study-partners/route";

describe("study partner API authorization and errors", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    getDemoStudyPartnerRecommendations.mockReset();
  });

  test("rejects unauthenticated requests", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getDemoStudyPartnerRecommendations).not.toHaveBeenCalled();
  });

  test("rejects teacher sessions", async () => {
    getCurrentUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(getDemoStudyPartnerRecommendations).not.toHaveBeenCalled();
  });

  test("returns graph matches for a student session", async () => {
    const matches = [
      {
        partnerId: "demo-student-002",
        partnerLabel: "Demo Learner B",
        courseCode: "CS301",
        courseName: "Data Structures and Databases",
        topics: ["Algorithms"],
      },
    ];
    getCurrentUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    getDemoStudyPartnerRecommendations.mockResolvedValue(matches);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      syntheticDemo: true,
      recommendations: matches,
    });
  });

  test("returns a safe service error when Neo4j is unavailable", async () => {
    getCurrentUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    getDemoStudyPartnerRecommendations.mockRejectedValue(
      new Error("internal connection detail"),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        "Graph recommendations are unavailable. Check the Neo4j service and connection settings.",
    });
  });
});
