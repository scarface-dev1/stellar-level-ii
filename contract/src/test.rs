#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Events as _};
use soroban_sdk::{Address, Env, Event as _};

fn memo(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

#[test]
fn test_record_payment_happy_path() {
    let env = Env::default();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    client.mock_all_auths().deposit(&from, &1_000i128);
    assert_eq!(client.get_balance(&from), 1_000i128);

    let id = client
        .mock_all_auths()
        .record_payment(&from, &to, &250i128, &memo(&env, "coffee"));

    assert_eq!(id, 0);
    assert_eq!(client.get_balance(&from), 750i128);
    assert_eq!(client.payment_count(), 1);

    let payment = client.get_payment(&id).unwrap();
    assert_eq!(payment.from, from);
    assert_eq!(payment.to, to);
    assert_eq!(payment.amount, 250i128);
    assert_eq!(payment.memo, memo(&env, "coffee"));

    let listed = client.list_payments(&from);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed.get(0).unwrap().id, 0);

    // A second payment increments the id and appends to the index.
    let id2 = client
        .mock_all_auths()
        .record_payment(&from, &to, &100i128, &memo(&env, "tip"));
    assert_eq!(id2, 1);
    assert_eq!(client.list_payments(&from).len(), 2);
    assert_eq!(client.get_balance(&from), 650i128);

    // get_payment for an unknown id returns None.
    assert_eq!(client.get_payment(&42), None);
}

#[test]
fn test_record_payment_emits_event() {
    let env = Env::default();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    client.mock_all_auths().deposit(&from, &1_000i128);
    client
        .mock_all_auths()
        .record_payment(&from, &to, &123i128, &memo(&env, "hello"));

    let expected = PaymentRecorded {
        id: 0,
        from,
        to,
        amount: 123i128,
        timestamp: 0,
    };

    assert_eq!(
        env.events().all(),
        [expected.to_xdr(&env, &contract_id)],
    );
}

#[test]
fn test_error_insufficient_balance() {
    let env = Env::default();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    client.mock_all_auths().deposit(&from, &100i128);

    let res = client
        .mock_all_auths()
        .try_record_payment(&from, &to, &101i128, &memo(&env, "too big"));
    assert_eq!(res, Err(Ok(Error::InsufficientBalance)));

    // Balance must be unchanged after a rejected payment.
    assert_eq!(client.get_balance(&from), 100i128);
}

#[test]
fn test_error_invalid_recipient_self_payment() {
    let env = Env::default();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    let from = Address::generate(&env);

    client.mock_all_auths().deposit(&from, &1_000i128);

    let res = client
        .mock_all_auths()
        .try_record_payment(&from, &from, &50i128, &memo(&env, "me"));
    assert_eq!(res, Err(Ok(Error::InvalidRecipient)));
}

#[test]
fn test_error_invalid_recipient_zero_address() {
    let env = Env::default();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    let from = Address::generate(&env);
    let zero = Address::from_str(&env, ZERO_ADDRESS);

    client.mock_all_auths().deposit(&from, &1_000i128);

    let res = client
        .mock_all_auths()
        .try_record_payment(&from, &zero, &50i128, &memo(&env, "zero"));
    assert_eq!(res, Err(Ok(Error::InvalidRecipient)));
}

#[test]
fn test_error_amount_too_small() {
    let env = Env::default();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    client.mock_all_auths().deposit(&from, &1_000i128);

    // Zero amount.
    let res = client
        .mock_all_auths()
        .try_record_payment(&from, &to, &0i128, &memo(&env, "zero"));
    assert_eq!(res, Err(Ok(Error::AmountTooSmall)));

    // Negative amount.
    let res = client
        .mock_all_auths()
        .try_record_payment(&from, &to, &-1i128, &memo(&env, "neg"));
    assert_eq!(res, Err(Ok(Error::AmountTooSmall)));
}

#[test]
fn test_deposit_rejects_non_positive_amount() {
    let env = Env::default();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    let from = Address::generate(&env);

    let res = client.mock_all_auths().try_deposit(&from, &0i128);
    assert_eq!(res, Err(Ok(Error::AmountTooSmall)));

    let res = client.mock_all_auths().try_deposit(&from, &-5i128);
    assert_eq!(res, Err(Ok(Error::AmountTooSmall)));

    assert_eq!(client.get_balance(&from), 0i128);
}
