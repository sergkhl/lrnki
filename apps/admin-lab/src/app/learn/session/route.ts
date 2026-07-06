import { NextResponse } from "next/server";
import {
  LEARNER_REF_COOKIE,
  LEARNER_REF_COOKIE_OPTIONS,
  compactLearnerRef
} from "@/lib/learnerSession";

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const learnerStateRef = compactLearnerRef(String(formData.get("learnerStateRef") ?? ""));
  const response = new NextResponse(null, { status: 303, headers: { Location: "/learn" } });
  if (learnerStateRef) {
    response.cookies.set(LEARNER_REF_COOKIE, learnerStateRef, LEARNER_REF_COOKIE_OPTIONS);
  }
  return response;
}
