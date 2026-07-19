// Thin helpers around Circle SCP + wallet write paths.
// Writes ALWAYS go through walletsClient — never the SCP client.

import { randomUUID } from 'crypto';
import { getCircleClients } from './clients';
import { DEFAULT_FEE, resolveScpBlockchain, type ScpBlockchain } from './config';

const TX_TERMINAL = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED']);

export type TxTerminalState = 'COMPLETE' | 'FAILED' | 'DENIED' | 'CANCELLED';

export function newIdempotencyKey(): string {
  return randomUUID();
}

/** Poll a wallet transaction until terminal or timeout. Prefer webhooks in production. */
export async function waitForTransaction(
  transactionId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ state: string; transaction: unknown }> {
  const intervalMs = opts.intervalMs ?? 2_000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const { wallets } = getCircleClients();
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await wallets.getTransaction({ id: transactionId });
    const tx = res.data?.transaction;
    const state = tx?.state ?? 'UNKNOWN';
    if (TX_TERMINAL.has(state)) {
      return { state, transaction: tx };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `[circle] Transaction ${transactionId} did not reach a terminal state within ${timeoutMs}ms`,
  );
}

/** Poll SCP contract deploymentStatus until COMPLETE / FAILED or timeout. */
export async function waitForContractDeployment(
  contractId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ deploymentStatus: string; contract: unknown }> {
  const intervalMs = opts.intervalMs ?? 3_000;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const { scp } = getCircleClients();
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await scp.getContract({ id: contractId });
    const contract = res.data?.contract;
    const status = (contract as { deploymentStatus?: string } | undefined)?.deploymentStatus ?? 'UNKNOWN';
    if (status === 'COMPLETE' || status === 'FAILED') {
      return { deploymentStatus: status, contract };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `[circle] Contract ${contractId} deployment still pending after ${timeoutMs}ms`,
  );
}

/** view/pure read — no gas wallet required */
export async function queryContract(params: {
  address: string;
  blockchain?: string;
  abiFunctionSignature: string;
  abiParameters?: string[];
}) {
  const { scp } = getCircleClients();
  const blockchain = resolveScpBlockchain(params.blockchain);
  return scp.queryContract({
    address: params.address,
    blockchain,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters ?? [],
  });
}

/**
 * nonpayable/payable write — requires a funded developer-controlled wallet.
 * Confirm destination / amount / network with the user before mainnet calls.
 */
export async function executeContract(params: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters?: string[];
  amount?: string;
  feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  idempotencyKey?: string;
}) {
  const { wallets } = getCircleClients();
  const fee =
    params.feeLevel && params.feeLevel !== 'MEDIUM'
      ? { type: 'level' as const, config: { feeLevel: params.feeLevel } }
      : DEFAULT_FEE;

  return wallets.createContractExecutionTransaction({
    idempotencyKey: params.idempotencyKey ?? newIdempotencyKey(),
    walletId: params.walletId,
    contractAddress: params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters ?? [],
    ...(params.amount ? { amount: params.amount } : {}),
    fee,
  });
}

export async function importContract(params: {
  name: string;
  address: string;
  blockchain?: string;
  idempotencyKey?: string;
}) {
  // Name must be alphanumeric only (no colons/parentheses) for some deploy paths;
  // import is more flexible but keep names simple.
  const { scp } = getCircleClients();
  const blockchain = resolveScpBlockchain(params.blockchain);
  return scp.importContract({
    name: params.name,
    address: params.address,
    blockchain,
    idempotencyKey: params.idempotencyKey ?? newIdempotencyKey(),
  });
}

export type { ScpBlockchain };
