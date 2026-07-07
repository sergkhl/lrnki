export const OPERATION_HEARTBEAT_STALE_AFTER_MS = 2 * 60 * 1000;

export function operationStaleBefore(now: number | Date = Date.now()): Date {
  const at = now instanceof Date ? now.getTime() : now;
  return new Date(at - OPERATION_HEARTBEAT_STALE_AFTER_MS);
}

export function isStaleOperation(
  status: string,
  lastProgressAt: string | Date | null | undefined,
  now: number | Date = Date.now()
): boolean {
  if (status !== "running" || lastProgressAt === null || lastProgressAt === undefined) return false;
  const progressAt = lastProgressAt instanceof Date ? lastProgressAt.getTime() : new Date(lastProgressAt).getTime();
  if (Number.isNaN(progressAt)) return false;
  const at = now instanceof Date ? now.getTime() : now;
  return at - progressAt > OPERATION_HEARTBEAT_STALE_AFTER_MS;
}
