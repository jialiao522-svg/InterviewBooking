/**
 * The actual fs-based logic lives in instrumentation-node.ts and is imported
 * dynamically only under the Node.js runtime, so Turbopack never bundles
 * `fs` into the Edge runtime chunk (which would otherwise warn/fail).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { writeServiceAccountKeyFromEnv } = await import("./instrumentation-node");
  writeServiceAccountKeyFromEnv();
}
