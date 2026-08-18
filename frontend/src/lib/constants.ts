/**
 * Network + contract constants.
 *
 * CONTRACT_ID is the live testnet deployment created by `contract/deploy.sh`.
 * It is verifiable on-chain (see README for the transaction hash).
 */
export const CONTRACT_ID =
  "CBK6NMEYPKVYHIIIRGFBMVE2BF55IYABU7FDDMEMTBOO3ONSBFIYEH7B";

export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

export const RPC_URL = "https://soroban-testnet.stellar.org";

/** 1 XLM = 10^7 stroops. */
export const STROOPS_PER_XLM = 10_000_000n;

export const explorerTxUrl = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;

export const explorerContractUrl = (id: string = CONTRACT_ID) =>
  `https://stellar.expert/explorer/testnet/contract/${id}`;

export const shortAddr = (a: string) =>
  a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
