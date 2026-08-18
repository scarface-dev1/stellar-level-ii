/**
 * The numeric codes assigned by the contract's `#[contracterror]` enum.
 * These values are stable across deployments because they are set explicitly
 * in `contract/src/lib.rs`.
 */
export const ContractErrorCode = {
  InsufficientBalance: 1,
  InvalidRecipient: 2,
  AmountTooSmall: 3,
} as const;

export type ContractErrorCode =
  (typeof ContractErrorCode)[keyof typeof ContractErrorCode];

/**
 * Map a raw contract error code to a distinct, user-facing message.
 * Returns a generic message when the code is unknown or missing.
 */
export function mapErrorCodeToMessage(code: number | null | undefined): string {
  switch (code) {
    case ContractErrorCode.InsufficientBalance:
      return "Insufficient balance — top up your recorded balance before sending.";
    case ContractErrorCode.InvalidRecipient:
      return "Invalid recipient — you can't pay yourself or the zero address.";
    case ContractErrorCode.AmountTooSmall:
      return "Amount is too small — it must be greater than zero.";
    default:
      return "The transaction failed. Please check the details and try again.";
  }
}
