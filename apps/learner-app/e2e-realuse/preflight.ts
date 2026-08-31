import type { LearnerReadDto } from "@lrnki/learner-api/client";

export type SelectedCandidate = Readonly<{
  expeditionKey: string;
  title: string;
  declaredDomain: string;
  sessionCookie: string;
}>;

function sessionCookie(response: Response): string {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

export async function selectCandidate(input: Readonly<{
  apiBase: string;
  probeEmail: string;
  password: string;
}>): Promise<SelectedCandidate> {
  const signUp = await fetch(`${input.apiBase}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: input.apiBase },
    body: JSON.stringify({
      email: input.probeEmail,
      password: input.password,
      name: input.probeEmail.split("@")[0],
      profileComplete: true
    })
  });
  if (!signUp.ok) {
    throw new Error(`[preflight] probe registration returned ${signUp.status}; is the authored learner API available at ${input.apiBase}?`);
  }
  const cookie = sessionCookie(signUp);
  if (!cookie) throw new Error("[preflight] probe registration issued no session cookie");

  const response = await fetch(`${input.apiBase}/catalog`, { headers: { cookie } });
  const body = await response.json() as LearnerReadDto;
  if (!response.ok || body.status !== "ok" || body.view.kind !== "catalog") {
    throw new Error(`[preflight] authenticated catalog read returned ${response.status}/${body.status}`);
  }
  const candidate = body.view.expeditions[0];
  if (!candidate) throw new Error("[preflight] the qualified authored catalog is empty");
  return {
    expeditionKey: candidate.expeditionKey,
    title: candidate.title,
    declaredDomain: candidate.declaredDomain,
    sessionCookie: cookie
  };
}
