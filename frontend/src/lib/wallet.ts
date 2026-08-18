import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import {
  KitEventType,
  SwkAppDarkTheme,
} from "@creit.tech/stellar-wallets-kit/types";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { NETWORK_PASSPHRASE } from "./constants";

let initialized = false;

/** The wallets this dApp supports (shown in the connect UI). */
export const SUPPORTED_WALLETS = [
  { id: "freighter", name: "Freighter", description: "Browser extension & mobile" },
  { id: "xbull", name: "xBull", description: "Browser extension" },
  { id: "albedo", name: "Albedo", description: "Web wallet, no extension needed" },
] as const;

/**
 * Initialize the kit exactly once with the three wallet modules. Multiple
 * modules = multi-wallet support, not a single hardcoded provider.
 */
export function initWalletKit(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    theme: SwkAppDarkTheme,
    modules: [new FreighterModule(), new xBullModule(), new AlbedoModule()],
  });
  initialized = true;
}

/** Open the kit's wallet-selection modal and return the chosen address. */
export async function connectWallet(): Promise<string | undefined> {
  initWalletKit();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

/** Return the currently connected address (or undefined). */
export async function getConnectedAddress(): Promise<string | undefined> {
  initWalletKit();
  const { address } = await StellarWalletsKit.getAddress();
  return address;
}

export function disconnectWallet(): void {
  initWalletKit();
  StellarWalletsKit.disconnect();
}

/** Sign a transaction XDR with the connected wallet. */
export async function signTransaction(
  xdr: string,
  address: string,
): Promise<string> {
  initWalletKit();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  return signedTxXdr;
}

/**
 * Subscribe to wallet state changes. Returns an unsubscribe function.
 */
export function onWalletStateChanged(
  cb: (address: string | undefined) => void,
): () => void {
  initWalletKit();
  return StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
    cb(event.payload.address);
  });
}
