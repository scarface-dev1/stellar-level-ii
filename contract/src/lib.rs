//! Multi-Wallet Payment Tracker — Soroban smart contract.
//!
//! Tracks payments sent between addresses using an internal credit ledger.
//! Users call [`PaymentTracker::deposit`] to top up their recorded balance,
//! then [`PaymentTracker::record_payment`] to send a payment to one or more
//! recipients. Every successful payment emits a structured [`PaymentRecorded`]
//! event that powers the frontend's real-time activity feed.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String, Vec,
};

/// Custom contract errors. The `#[contracterror]` macro exposes these as a
/// typed error enum in the contract's spec, so clients (and the frontend)
/// can map the numeric code back to a human-readable reason.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `from` does not have enough recorded balance to cover `amount`.
    InsufficientBalance = 1,
    /// `to` is invalid: it is the zero address or the same as `from`.
    InvalidRecipient = 2,
    /// `amount` must be strictly greater than zero (stroops).
    AmountTooSmall = 3,
}

/// A single recorded payment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payment {
    pub id: u32,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub memo: String,
    pub timestamp: u64,
}

/// Structured event emitted on every successful payment.
///
/// With `data_format = "vec"`, the event is published as:
///   topics: ["payment_recorded", id]
///   data:   Vec [from, to, amount, timestamp]
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecorded {
    #[topic]
    pub id: u32,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// Storage keys. A `#[contracttype]` enum is the idiomatic way to namespace
/// ledger entries so balance, index and payment records never collide.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageKey {
    /// The next payment id to assign (u32), stored in instance storage.
    NextId,
    /// An address's recorded credit balance (i128).
    Balance(Address),
    /// An address's payment-id index (Vec<u32>).
    Payments(Address),
    /// A single payment record (Payment), keyed by id.
    Payment(u32),
}

/// The canonical Stellar "zero" account (an all-zero Ed25519 public key).
pub const ZERO_ADDRESS: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

#[contract]
pub struct PaymentTracker;

#[contractimpl]
impl PaymentTracker {
    /// Credit `amount` stroops to `from`'s recorded balance.
    ///
    /// `from` must authorize this invocation. The balance is a bookkeeping
    /// credit inside this contract — it does not move real XLM or tokens.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();

        if amount <= 0 {
            return Err(Error::AmountTooSmall);
        }

        let key = StorageKey::Balance(from.clone());
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(current + amount));

        Ok(())
    }

    /// Record a payment from `from` to `to` of `amount` stroops with `memo`.
    ///
    /// Returns the new payment's id. Emits [`PaymentRecorded`] on success.
    pub fn record_payment(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
        memo: String,
    ) -> Result<u32, Error> {
        // The sender must authorize this invocation.
        from.require_auth();

        // --- Custom error: AmountTooSmall ---
        if amount <= 0 {
            return Err(Error::AmountTooSmall);
        }

        // --- Custom error: InvalidRecipient ---
        if to == from || Self::is_zero_address(&env, &to) {
            return Err(Error::InvalidRecipient);
        }

        // --- Custom error: InsufficientBalance ---
        let balance = Self::read_balance(&env, &from);
        if amount > balance {
            return Err(Error::InsufficientBalance);
        }

        // Debit the sender's recorded balance.
        env.storage()
            .persistent()
            .set(&StorageKey::Balance(from.clone()), &(balance - amount));

        // Allocate the next id.
        let id = Self::next_id(&env);
        env.storage()
            .instance()
            .set(&StorageKey::NextId, &(id + 1));

        let timestamp = env.ledger().timestamp();

        // Persist the payment record.
        let payment = Payment {
            id,
            from: from.clone(),
            to: to.clone(),
            amount,
            memo,
            timestamp,
        };
        env.storage()
            .persistent()
            .set(&StorageKey::Payment(id), &payment);

        // Append the id to the sender's index.
        let mut ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&StorageKey::Payments(from.clone()))
            .unwrap_or(Vec::new(&env));
        ids.push_back(id);
        env.storage()
            .persistent()
            .set(&StorageKey::Payments(from.clone()), &ids);

        // Emit the structured event that powers the live feed.
        PaymentRecorded {
            id,
            from,
            to,
            amount,
            timestamp,
        }
        .publish(&env);

        Ok(id)
    }

    /// Return a single payment by id, or `None` if it does not exist.
    pub fn get_payment(env: Env, id: u32) -> Option<Payment> {
        env.storage().persistent().get(&StorageKey::Payment(id))
    }

    /// Return every payment recorded by `address`, in insertion order.
    pub fn list_payments(env: Env, address: Address) -> Vec<Payment> {
        let ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&StorageKey::Payments(address))
            .unwrap_or(Vec::new(&env));

        let mut out = Vec::new(&env);
        for id in ids.iter() {
            if let Some(payment) = env.storage().persistent().get(&StorageKey::Payment(id)) {
                out.push_back(payment);
            }
        }
        out
    }

    /// Return an address's current recorded balance.
    pub fn get_balance(env: Env, address: Address) -> i128 {
        Self::read_balance(&env, &address)
    }

    /// Return the number of payments recorded so far (next unused id).
    pub fn payment_count(env: Env) -> u32 {
        Self::next_id(&env)
    }
}

impl PaymentTracker {
    fn read_balance(env: &Env, address: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::Balance(address.clone()))
            .unwrap_or(0)
    }

    fn next_id(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::NextId)
            .unwrap_or(0)
    }

    fn is_zero_address(env: &Env, address: &Address) -> bool {
        address == &Address::from_str(env, ZERO_ADDRESS)
    }
}

mod test;
