import {
  Account,
  BASE_FEE,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL, STROOPS_PER_XLM } from "./constants";

export const server = new Server(RPC_URL);

export class ContractCallError extends Error {
  constructor(
    public readonly code: number | null,
    message?: string,
  ) {
    super(message ?? "Contract call failed");
    this.name = "ContractCallError";
  }
}

export interface PaymentRecord {
  id: number;
  from: string;
  to: string;
  amount: bigint; // stroops
  memo: string;
  timestamp: bigint;
}

export interface FeedEvent {
  id: string;
  paymentId: number;
  from: string;
  to: string;
  amount: bigint; // stroops
  timestamp: bigint;
  txHash: string;
  ledger: number;
}

// ---------------------------------------------------------------------------
// Unit conversion (1 XLM = 10^7 stroops)
// ---------------------------------------------------------------------------

export function xlmToStroops(xlm: string): bigint {
  const trimmed = xlm.trim();
  const [whole, fracRaw = ""] = trimmed.split(".");
  if (!/^\d+$/.test(whole)) throw new Error("Amount must be a positive number");
  if (!/^\d{0,7}$/.test(fracRaw)) {
    throw new Error("Amount supports at most 7 decimal places");
  }
  const frac = (fracRaw + "0000000").slice(0, 7);
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(frac);
}

export function stroopsToXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_XLM;
  const frac = (abs % STROOPS_PER_XLM).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

// ---------------------------------------------------------------------------
// Error decoding
// ---------------------------------------------------------------------------

/**
 * Extract the numeric code from a failed simulation's `error` XDR.
 * The SDK's `scValToNative` turns an `SCV_ERROR` into `{ type: "contract",
 * code: N }` for contract errors (and `{ type: "system", ... }` otherwise).
 */
export function decodeContractErrorCode(errorXdr: string | undefined): number | null {
  if (!errorXdr) return null;
  try {
    const decoded = scValToNative(xdr.ScVal.fromXDR(errorXdr, "base64"));
    if (decoded && typeof decoded === "object" && (decoded as any).type === "contract") {
      return (decoded as any).code as number;
    }
  } catch {
    // ignore — the caller falls back to a generic message
  }
  return null;
}

// ---------------------------------------------------------------------------
// Read-only contract calls (via simulation)
// ---------------------------------------------------------------------------

async function readContract(
  source: string,
  fn: string,
  args: xdr.ScVal[],
): Promise<unknown> {
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: fn,
        args,
      }),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    throw new ContractCallError(decodeContractErrorCode(sim.error));
  }
  return scValToNative(sim.result!.retval);
}

function toPaymentRecord(raw: unknown): PaymentRecord {
  const p = raw as {
    id: number;
    from: string;
    to: string;
    amount: bigint;
    memo: string;
    timestamp: bigint;
  };
  return {
    id: p.id,
    from: p.from,
    to: p.to,
    amount: BigInt(p.amount),
    memo: p.memo,
    timestamp: BigInt(p.timestamp),
  };
}

export async function getPayment(
  id: number,
  source: string,
): Promise<PaymentRecord | null> {
  const raw = await readContract(source, "get_payment", [
    nativeToScVal(id, { type: "u32" }),
  ]);
  if (raw == null) return null;
  return toPaymentRecord(raw);
}

export async function listPayments(
  address: string,
  source: string,
): Promise<PaymentRecord[]> {
  const raw = await readContract(source, "list_payments", [
    nativeToScVal(address, { type: "address" }),
  ]);
  return (raw as unknown[]).map(toPaymentRecord);
}

export async function getBalance(address: string, source: string): Promise<bigint> {
  const raw = await readContract(source, "get_balance", [
    nativeToScVal(address, { type: "address" }),
  ]);
  return BigInt(raw as bigint);
}

// ---------------------------------------------------------------------------
// Write: record_payment
// ---------------------------------------------------------------------------

export async function recordPayment(params: {
  from: string;
  to: string;
  amountStroops: bigint;
  memo: string;
  signTransaction: (xdr: string) => Promise<string>;
}): Promise<{ hash: string }> {
  const { from, to, amountStroops, memo, signTransaction } = params;

  const account = await server.getAccount(from);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: "record_payment",
        args: [
          nativeToScVal(from, { type: "address" }),
          nativeToScVal(to, { type: "address" }),
          nativeToScVal(amountStroops, { type: "i128" }),
          nativeToScVal(memo, { type: "string" }),
        ],
      }),
    )
    .setTimeout(30)
    .build();

  // Simulate first so contract errors surface before we ask for a signature.
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    throw new ContractCallError(decodeContractErrorCode(sim.error));
  }

  const assembled = assembleTransaction(tx, sim).build();
  const signedXdr = await signTransaction(assembled.toXDR());
  const signedTx = new Transaction(signedXdr, NETWORK_PASSPHRASE);

  const res = await server.sendTransaction(signedTx);
  if (res.status === "ERROR") {
    throw new ContractCallError(null, "The network rejected the transaction.");
  }
  return { hash: res.hash };
}

// ---------------------------------------------------------------------------
// Transaction status polling (Soroban RPC getTransaction)
// ---------------------------------------------------------------------------

export type TxOutcome = "success" | "failed";

async function getTxStatus(hash: string): Promise<string> {
  try {
    const res = await server.getTransaction(hash);
    return res.status;
  } catch {
    return "NOT_FOUND";
  }
}

export async function waitForTransaction(
  hash: string,
  onStatus?: (status: string) => void,
): Promise<{ outcome: TxOutcome; hash: string }> {
  for (let i = 0; i < 40; i += 1) {
    const status = await getTxStatus(hash);
    onStatus?.(status);
    if (status === "SUCCESS") return { outcome: "success", hash };
    if (status === "FAILED") return { outcome: "failed", hash };
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new ContractCallError(null, "Transaction confirmation timed out.");
}

// ---------------------------------------------------------------------------
// Live activity feed (Soroban RPC getEvents)
// ---------------------------------------------------------------------------

function decodeScVal(v: unknown): unknown {
  if (v instanceof xdr.ScVal) return scValToNative(v);
  if (typeof v === "string") return scValToNative(xdr.ScVal.fromXDR(v, "base64"));
  return v;
}

export async function fetchPaymentEvents(windowLedgers = 3000): Promise<FeedEvent[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - windowLedgers);

  const res = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
    limit: 100,
  });

  const out: FeedEvent[] = [];
  for (const event of res.events) {
    const topics = (event.topic as unknown[]).map(decodeScVal);
    if (topics[0] !== "payment_recorded") continue;

    const data = decodeScVal(event.value) as unknown[];
    out.push({
      id: event.id,
      paymentId: Number(topics[1]),
      from: String(data[0]),
      to: String(data[1]),
      amount: BigInt(data[2] as bigint),
      timestamp: BigInt(data[3] as bigint),
      txHash: event.txHash,
      ledger: event.ledger,
    });
  }

  // Newest first.
  return out.sort((a, b) => b.ledger - a.ledger || b.paymentId - a.paymentId);
}
