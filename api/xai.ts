/**
 * Containment endpoint. Do not forward requests or read credentials here.
 * Hosted xAI access must stay disabled until authenticated, budget-limited
 * server-side access is implemented and separately reviewed.
 */
export const config = { runtime: 'edge' };

export default async function handler(_req: Request): Promise<Response> {
  return Response.json(
    { error: 'Hosted xAI features are temporarily disabled.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
