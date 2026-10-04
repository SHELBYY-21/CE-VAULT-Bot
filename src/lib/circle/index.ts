// Public server-side entry for Circle Smart Contract Platform scaffolding.
// Import only from API routes, server actions, or Node scripts.

export {
  getCircleClients,
  isCircleConfigured,
  resetCircleClients,
  type CircleClients,
  type ScpClient,
  type WalletsClient,
} from './clients';

export {
  CONTRACT_TEMPLATES,
  DEFAULT_FEE,
  DEFAULT_SCP_BLOCKCHAIN,
  SCP_BLOCKCHAINS,
  isScpBlockchain,
  resolveScpBlockchain,
  type ContractTemplateKey,
  type ScpBlockchain,
} from './config';

export {
  executeContract,
  importContract,
  newIdempotencyKey,
  queryContract,
  waitForContractDeployment,
  waitForTransaction,
  type TxTerminalState,
} from './helpers';
