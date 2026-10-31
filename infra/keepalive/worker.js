/**
 * Keeps the Render free instance and Neon compute warm.
 *
 * Render free services spin down after 15 minutes without a request. This cron
 * hits the readiness endpoint every 5 minutes; that endpoint also runs a
 * `SELECT 1`, which keeps Neon's autosuspend from idling the database.
 */
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      fetch(`${env.API_URL}/health/ready`, {
        headers: { "user-agent": "picohealth-keepalive" },
      }).catch(() => undefined),
    );
  },
  async fetch() {
    return new Response("picohealth keepalive", { status: 200 });
  },
};
