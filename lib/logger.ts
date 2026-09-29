export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  context: Record<string, string | number | boolean | undefined> = {},
) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
