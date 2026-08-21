export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ status: "live" }, { headers: { "cache-control": "no-store" } });
}
