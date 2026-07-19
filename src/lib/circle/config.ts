// Circle Smart Contract Platform — shared constants (server-only consumers)
// Docs: https://developers.circle.com/contracts

/** Default demo/test chain. Require explicit confirmation before mainnet. */
export const DEFAULT_SCP_BLOCKCHAIN = 'ARC-TESTNET' as const;

/** SCP-supported blockchain identifiers */
export const SCP_BLOCKCHAINS = [
  'ARB',
  'ARB-SEPOLIA',
  'ARC-TESTNET',
  'AVAX',
  'AVAX-FUJI',
  'BASE',
  'BASE-SEPOLIA',
  'ETH',
  'ETH-SEPOLIA',
  'MONAD',
  'MONAD-TESTNET',
  'OP',
  'OP-SEPOLIA',
  'MATIC',
  'MATIC-AMOY',
  'UNI',
  'UNI-SEPOLIA',
] as const;

export type ScpBlockchain = (typeof SCP_BLOCKCHAINS)[number];

/** Audited Circle contract templates */
export const CONTRACT_TEMPLATES = {
  /** ERC-20 fungible token */
  ERC20: 'a1b74add-23e0-4712-88d1-6b3009e85a86',
  /** ERC-721 NFT */
  ERC721: '76b83278-50e2-4006-8b63-5b1a2a814533',
  /** ERC-1155 multi-token */
  ERC1155: 'aea21da6-0aa2-4971-9a1a-5098842b1248',
  /** Bulk airdrop helper */
  AIRDROP: '13e322f2-18dc-4f57-8eed-4bddfc50f85e',
} as const;

export type ContractTemplateKey = keyof typeof CONTRACT_TEMPLATES;

/** Nested fee shape required by Circle wallet / SCP write APIs */
export const DEFAULT_FEE = {
  type: 'level' as const,
  config: { feeLevel: 'MEDIUM' as const },
};

export function isScpBlockchain(value: string): value is ScpBlockchain {
  return (SCP_BLOCKCHAINS as readonly string[]).includes(value);
}

export function resolveScpBlockchain(override?: string): ScpBlockchain {
  const fromEnv = process.env.CIRCLE_SCP_BLOCKCHAIN?.trim();
  const candidate = (override || fromEnv || DEFAULT_SCP_BLOCKCHAIN).toUpperCase();
  if (!isScpBlockchain(candidate)) {
    throw new Error(
      `Unsupported SCP blockchain "${candidate}". ` +
        `Use one of: ${SCP_BLOCKCHAINS.join(', ')}`,
    );
  }
  return candidate;
}
