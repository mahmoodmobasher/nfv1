export async function securePost<T>(path: string, body: unknown): Promise<{ response: Response; data: T }> {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!csrfResponse.ok) throw new Error("csrf_unavailable");
  const { token } = await csrfResponse.json() as { token: string };
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
  return { response, data: await response.json() as T };
}
