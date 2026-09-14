// Next.js's documented `register()` hook, run once when the server process
// starts. Wires node-cron to run the hourly alert check inside this one
// long-running `next start` process (CLAUDE.md §2: single Docker container,
// no Redis/BullMQ/queue — see docs/ARCHITECTURE.md §5.4 for the exact
// pattern this follows).
//
// Owned by Dev1.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const cron = await import("node-cron");
    cron.schedule("0 * * * *", async () => {
      const { runHourlyAlertCheck } = await import("@/lib/alerts");
      await runHourlyAlertCheck();
    });
  }
}
