// Circle dual-client init — SERVER ONLY (API routes / server actions / scripts).
// Never import this module from client components.
//
// SCP client  → deploy, import, read queries, event monitors
// Wallets client → write txs (createContractExecutionTransaction), gas wallets
//
// Env (set in .env.local / host env — never commit real values):
//   CIRCLE_API_KEY   TEST_API_KEY:... or LIVE_API_KEY:...
//   ENTITY_SECRET    32-byte hex entity secret (registered in Circle console)

import { initiateSmartContractPlatformClient } from '@circle-fin/smart-contract-platform';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

export type ScpClient = ReturnType<typeof initiateSmartContractPlatformClient>;
export type WalletsClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>;

export type CircleClients = {
  scp: ScpClient;
  wallets: WalletsClient;
};

function requireCircleEnv(): { apiKey: string; entitySecret: string } {
  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  const entitySecret = process.env.ENTITY_SECRET?.trim();

  if (!apiKey) {
    throw new Error(
      '[circle] CIRCLE_API_KEY is not set. ' +
        'Create a key at https://console.circle.com and put it in .env.local',
    );
  }
  if (!entitySecret) {
    throw new Error(
      '[circle] ENTITY_SECRET is not set. ' +
        'Register an entity secret first: ' +
        'https://developers.circle.com/wallets/dev-controlled/register-entity-secret',
    );
  }

  return { apiKey, entitySecret };
}

/** True when both Circle credentials are present (no network call). */
export function isCircleConfigured(): boolean {
  return Boolean(process.env.CIRCLE_API_KEY?.trim() && process.env.ENTITY_SECRET?.trim());
}

let cached: CircleClients | null = null;

/**
 * Lazy singleton for SCP + developer-controlled wallets clients.
 * Throws if credentials are missing — call isCircleConfigured() first for soft checks.
 */
export function getCircleClients(): CircleClients {
  if (cached) return cached;

  const { apiKey, entitySecret } = requireCircleEnv();

  cached = {
    scp: initiateSmartContractPlatformClient({ apiKey, entitySecret }),
    wallets: initiateDeveloperControlledWalletsClient({ apiKey, entitySecret }),
  };

  return cached;
}

/** Reset cached clients (tests / credential rotation). */
export function resetCircleClients(): void {
  cached = null;
}
