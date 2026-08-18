import { SUPPORTED_WALLETS } from "../lib/wallet";
import { shortAddr } from "../lib/constants";

export function WalletConnect({
  address,
  onConnect,
  onDisconnect,
}: {
  address: string | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="card">
      <h2>Connect wallet</h2>
      {!address ? (
        <>
          <p className="muted">
            Connect with any of these wallets — you are not limited to a single
            provider:
          </p>
          {SUPPORTED_WALLETS.map((w) => (
            <div key={w.id} className="wallet-option">
              <span>{w.name}</span>
              <span className="muted">{w.description}</span>
            </div>
          ))}
          <button className="primary" onClick={onConnect}>
            Connect wallet
          </button>
        </>
      ) : (
        <>
          <p className="muted">Connected account:</p>
          <p className="mono">{shortAddr(address)}</p>
          <p className="mono muted" style={{ wordBreak: "break-all" }}>
            {address}
          </p>
          <button onClick={onDisconnect}>Disconnect</button>
        </>
      )}
    </div>
  );
}
