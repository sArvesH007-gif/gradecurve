import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDemoStudyPartnerRecommendations } from "@/lib/neo4j/recommendations";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to view study-partner suggestions." },
      { status: 401 },
    );
  if (user.role !== "STUDENT")
    return NextResponse.json(
      { error: "Student access is required." },
      { status: 403 },
    );

  try {
    const recommendations = await getDemoStudyPartnerRecommendations();
    return NextResponse.json({ syntheticDemo: true, recommendations });
  } catch {
    return NextResponse.json(
      {
        error:
          "Graph recommendations are unavailable. Check the Neo4j service and connection settings.",
      },
      { status: 503 },
    );
  }
}
