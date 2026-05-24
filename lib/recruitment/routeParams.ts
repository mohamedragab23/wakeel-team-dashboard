/** Next.js 14/15: params قد يكون Promise */
export async function resolveRouteId(
  params: Promise<{ id: string }> | { id: string }
): Promise<string> {
  const p = await Promise.resolve(params);
  return p.id;
}
