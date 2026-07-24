// Scheduled: 22:00 Thailand (15:00 UTC) — calls Next.js /api/cron/day-cut
import type { Config } from "@netlify/functions";

export default async () => {
  const base =
    process.env.APP_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL;

  if (!base) {
    console.error("day-cut-cron: APP_URL / URL not set");
    return;
  }

  const secret = process.env.API_SECRET;
  const url = new URL("/api/cron/day-cut", base);
  if (secret) url.searchParams.set("secret", secret);

  const res = await fetch(url.toString(), {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });

  const body = await res.text();
  console.log("day-cut-cron:", res.status, body);
};

export const config: Config = {
  schedule: "0 15 * * *",
};
