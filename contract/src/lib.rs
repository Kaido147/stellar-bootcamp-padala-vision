#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes,
    BytesN, Env, String, Symbol, panic_with_error,
};

const ATTESTATION_V2_PREFIX: &[u8] = b"padala-vision:v2";
const FIELD_SEPARATOR: u8 = 0x1f;
const ATTESTATION_VERSION: u8 = 2;
const APPROVE_DECISION: Symbol = symbol_short!("APPROVE");
const FUNDED_UNACCEPTED_TIMEOUT_SECS: u64 = 2 * 60 * 60;
const ASSIGNED_NOT_IN_TRANSIT_TIMEOUT_SECS: u64 = 60 * 60;
const IN_TRANSIT_TIMEOUT_SECS: u64 = 8 * 60 * 60;
const DISPUTE_INACTIVITY_TIMEOUT_SECS: u64 = 24 * 60 * 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    OrderNotFound = 4,
    InvalidState = 5,
    RiderAlreadyAssigned = 6,
    Unauthorized = 7,
    AttestationExpired = 8,
    InvalidDecision = 9,
    MissingRider = 10,
    RefundNotAllowed = 11,
    NonceAlreadyConsumed = 12,
    ContractMismatch = 13,
    EnvironmentMismatch = 14,
    DisputeAlreadyOpen = 15,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrderStatus {
    Draft,
    Funded,
    RiderAssigned,
    InTransit,
    EvidenceSubmitted,
    Approved,
    Released,
    Rejected,
    Disputed,
    Refunded,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub order_id: u64,
    pub seller: Address,
    pub buyer: Address,
    pub rider: Option<Address>,
    pub item_amount: i128,
    pub delivery_fee: i128,
    pub total_amount: i128,
    pub status: OrderStatus,
    pub oracle_pubkey: BytesN<32>,
    pub created_at: u64,
    pub funded_at: Option<u64>,
    pub assigned_at: Option<u64>,
    pub in_transit_at: Option<u64>,
    pub disputed_at: Option<u64>,
    pub dispute_last_activity_at: Option<u64>,
    pub expires_at: u64,
}

#[contracttype]
enum DataKey {
    Config,
    NextOrderId,
    Order(u64),
    ConsumedReleaseNonce(u64, String),
}

#[contracttype]
#[derive(Clone)]
struct Config {
    token_address: Address,
    oracle_pubkey: BytesN<32>,
    environment: String,
}

#[contract]
pub struct PadalaEscrow;

#[contractimpl]
impl PadalaEscrow {
    pub fn initialize(env: Env, token_address: Address, oracle_pubkey: BytesN<32>, environment: String) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, ContractError::AlreadyInitialized);
        }

        let config = Config {
            token_address,
            oracle_pubkey,
            environment,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::NextOrderId, &1_u64);
    }

    pub fn create_order(
        env: Env,
        seller: Address,
        buyer: Address,
        item_amount: i128,
        delivery_fee: i128,
        expires_at: u64,
    ) -> u64 {
        ensure_initialized(&env);
        seller.require_auth();

        if item_amount <= 0 || delivery_fee < 0 {
            panic_with_error!(&env, ContractError::InvalidAmount);
        }

        let total_amount = item_amount + delivery_fee;
        if total_amount <= 0 {
            panic_with_error!(&env, ContractError::InvalidAmount);
        }

        let order_id = next_order_id(&env);
        let config = get_config(&env);
        let order = Order {
            order_id,
            seller,
            buyer,
            rider: None,
            item_amount,
            delivery_fee,
            total_amount,
            status: OrderStatus::Draft,
            oracle_pubkey: config.oracle_pubkey,
            created_at: env.ledger().timestamp(),
            funded_at: None,
            assigned_at: None,
            in_transit_at: None,
            disputed_at: None,
            dispute_last_activity_at: None,
            expires_at,
        };

        save_order(&env, &order);
        increment_next_order_id(&env, order_id);
        order_id
    }

    pub fn fund_order(env: Env, order_id: u64) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);

        if order.status != OrderStatus::Draft {
            panic_with_error!(&env, ContractError::InvalidState);
        }

        order.buyer.require_auth();
        token_client(&env).transfer(
            &order.buyer,
            &env.current_contract_address(),
            &order.total_amount,
        );

        order.status = OrderStatus::Funded;
        order.funded_at = Some(env.ledger().timestamp());
        save_order(&env, &order);
    }

    pub fn assign_rider(env: Env, order_id: u64, rider: Address) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);

        if order.status != OrderStatus::Funded {
            panic_with_error!(&env, ContractError::InvalidState);
        }
        if order.rider.is_some() {
            panic_with_error!(&env, ContractError::RiderAlreadyAssigned);
        }

        rider.require_auth();
        order.rider = Some(rider);
        order.status = OrderStatus::RiderAssigned;
        order.assigned_at = Some(env.ledger().timestamp());
        save_order(&env, &order);
    }

    pub fn mark_in_transit(env: Env, order_id: u64) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);

        if order.status != OrderStatus::RiderAssigned {
            panic_with_error!(&env, ContractError::InvalidState);
        }

        let rider = match order.rider.clone() {
            Some(rider) => rider,
            None => panic_with_error!(&env, ContractError::MissingRider),
        };
        rider.require_auth();

        order.status = OrderStatus::InTransit;
        order.in_transit_at = Some(env.ledger().timestamp());
        save_order(&env, &order);
    }

    pub fn submit_release(
        env: Env,
        order_id: u64,
        decision: Symbol,
        confidence_bps: u32,
        issued_at_secs: u64,
        expires_at_secs: u64,
        nonce: String,
        contract_id: String,
        environment: String,
        signature: BytesN<64>,
    ) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);
        let config = get_config(&env);

        if order.status != OrderStatus::InTransit
            && order.status != OrderStatus::EvidenceSubmitted
            && order.status != OrderStatus::Approved
        {
            panic_with_error!(&env, ContractError::InvalidState);
        }

        if decision != APPROVE_DECISION {
            panic_with_error!(&env, ContractError::InvalidDecision);
        }

        if env.ledger().timestamp() > expires_at_secs {
            panic_with_error!(&env, ContractError::AttestationExpired);
        }

        let expected_contract_id = env.current_contract_address().to_string();
        if contract_id != expected_contract_id {
            panic_with_error!(&env, ContractError::ContractMismatch);
        }
        if environment != config.environment {
            panic_with_error!(&env, ContractError::EnvironmentMismatch);
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::ConsumedReleaseNonce(order_id, nonce.clone()))
        {
            panic_with_error!(&env, ContractError::NonceAlreadyConsumed);
        }

        let rider = match order.rider.clone() {
            Some(rider) => rider,
            None => panic_with_error!(&env, ContractError::MissingRider),
        };
        let message = build_attestation_message(
            &env,
            order_id,
            decision,
            confidence_bps,
            issued_at_secs,
            expires_at_secs,
            &nonce,
            &contract_id,
            &environment,
        );
        env.crypto()
            .ed25519_verify(&order.oracle_pubkey, &message, &signature);
        env.storage()
            .persistent()
            .set(&DataKey::ConsumedReleaseNonce(order_id, nonce), &true);

        let token = token_client(&env);
        let contract_address = env.current_contract_address();
        token.transfer(&contract_address, &order.seller, &order.item_amount);
        token.transfer(&contract_address, &rider, &order.delivery_fee);

        order.status = OrderStatus::Released;
        save_order(&env, &order);
    }

    pub fn dispute_order(env: Env, order_id: u64, caller: Address) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);

        match order.status {
            OrderStatus::Released | OrderStatus::Refunded => {
                panic_with_error!(&env, ContractError::InvalidState)
            }
            OrderStatus::Disputed => panic_with_error!(&env, ContractError::DisputeAlreadyOpen),
            _ => {}
        }

        require_participant_auth(&env, &order, &caller);

        order.status = OrderStatus::Disputed;
        let now = env.ledger().timestamp();
        order.disputed_at = Some(now);
        order.dispute_last_activity_at = Some(now);
        save_order(&env, &order);
    }

    pub fn refund_order(env: Env, order_id: u64) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);
        order.buyer.require_auth();

        let now = env.ledger().timestamp();
        let refund_allowed = match order.status {
            OrderStatus::Funded => order
                .funded_at
                .map(|funded_at| now >= funded_at + FUNDED_UNACCEPTED_TIMEOUT_SECS)
                .unwrap_or(false),
            OrderStatus::RiderAssigned => order
                .assigned_at
                .map(|assigned_at| now >= assigned_at + ASSIGNED_NOT_IN_TRANSIT_TIMEOUT_SECS)
                .unwrap_or(false),
            OrderStatus::InTransit => order
                .in_transit_at
                .map(|in_transit_at| now >= in_transit_at + IN_TRANSIT_TIMEOUT_SECS)
                .unwrap_or(false),
            OrderStatus::Disputed => order
                .dispute_last_activity_at
                .map(|last_activity_at| now >= last_activity_at + DISPUTE_INACTIVITY_TIMEOUT_SECS)
                .unwrap_or(false),
            _ => false,
        };

        if !refund_allowed {
            panic_with_error!(&env, ContractError::RefundNotAllowed);
        }

        let token = token_client(&env);
        token.transfer(
            &env.current_contract_address(),
            &order.buyer,
            &order.total_amount,
        );

        order.status = OrderStatus::Refunded;
        save_order(&env, &order);
    }

    pub fn get_order(env: Env, order_id: u64) -> Order {
        ensure_initialized(&env);
        get_order(&env, order_id)
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Config) {
        panic_with_error!(env, ContractError::NotInitialized);
    }
}

fn get_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
}

fn next_order_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::NextOrderId)
        .unwrap_or(1_u64)
}

fn increment_next_order_id(env: &Env, current: u64) {
    env.storage()
        .instance()
        .set(&DataKey::NextOrderId, &(current + 1));
}

fn get_order(env: &Env, order_id: u64) -> Order {
    env.storage()
        .persistent()
        .get(&DataKey::Order(order_id))
        .unwrap_or_else(|| panic_with_error!(env, ContractError::OrderNotFound))
}

fn save_order(env: &Env, order: &Order) {
    env.storage()
        .persistent()
        .set(&DataKey::Order(order.order_id), order);
}

fn token_client(env: &Env) -> token::TokenClient<'_> {
    let config = get_config(env);
    token::TokenClient::new(env, &config.token_address)
}

fn require_participant_auth(env: &Env, order: &Order, caller: &Address) {
    let is_participant = order.buyer == *caller
        || order.seller == *caller
        || order.rider.clone().map(|rider| rider == *caller).unwrap_or(false);
    if !is_participant {
        panic_with_error!(env, ContractError::Unauthorized);
    }

    caller.require_auth();
}

fn build_attestation_message(
    env: &Env,
    order_id: u64,
    decision: Symbol,
    confidence_bps: u32,
    issued_at_secs: u64,
    expires_at_secs: u64,
    nonce: &String,
    contract_id: &String,
    environment: &String,
) -> Bytes {
    let mut message = Bytes::new(env);
    append_bytes(&mut message, ATTESTATION_V2_PREFIX);
    message.push_back(FIELD_SEPARATOR);
    message.push_back(ATTESTATION_VERSION);
    append_bytes(&mut message, &order_id.to_be_bytes());
    message.push_back(decision_to_code(decision));
    append_bytes(&mut message, &confidence_bps.to_be_bytes());
    append_bytes(&mut message, &issued_at_secs.to_be_bytes());
    append_bytes(&mut message, &expires_at_secs.to_be_bytes());
    append_length_prefixed_string(&mut message, nonce);
    append_length_prefixed_string(&mut message, contract_id);
    append_length_prefixed_string(&mut message, environment);
    message
}

fn append_bytes(bytes: &mut Bytes, data: &[u8]) {
    for value in data {
        bytes.push_back(*value);
    }
}

fn append_soroban_bytes(bytes: &mut Bytes, data: &Bytes) {
    for index in 0..data.len() {
        bytes.push_back(data.get_unchecked(index));
    }
}

fn append_length_prefixed_string(bytes: &mut Bytes, value: &String) {
    let len = value.len();
    if len > u16::MAX as u32 {
        panic!("attestation field exceeds maximum length");
    }

    append_bytes(bytes, &(len as u16).to_be_bytes());
    append_soroban_bytes(bytes, &value.to_bytes());
}

fn decision_to_code(decision: Symbol) -> u8 {
    if decision == APPROVE_DECISION {
        1
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    extern crate std;

    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use rand::rngs::OsRng;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::StellarAssetClient;
    use std::vec;
    use std::vec::Vec;

    fn setup() -> (
        Env,
        PadalaEscrowClient<'static>,
        Address,
        Address,
        Address,
        Address,
        token::TokenClient<'static>,
        SigningKey,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000);

        let issuer = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let rider = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(issuer);
        let token_address = sac.address();
        let token_admin = StellarAssetClient::new(&env, &token_address);
        let token = token::TokenClient::new(&env, &token_address);
        token_admin.mint(&buyer, &1_000_000_000);

        let oracle_signing_key = SigningKey::generate(&mut OsRng);
        let oracle_pubkey = BytesN::from_array(&env, &oracle_signing_key.verifying_key().to_bytes());

        let contract_id = env.register(PadalaEscrow, ());
        let client = PadalaEscrowClient::new(&env, &contract_id);
        let environment = String::from_str(&env, "staging");
        client.initialize(&token_address, &oracle_pubkey, &environment);

        (
            env,
            client,
            contract_id,
            seller,
            buyer,
            rider,
            token,
            oracle_signing_key,
        )
    }

    fn sign_attestation(
        env: &Env,
        signer: &SigningKey,
        contract_id: &Address,
        order_id: u64,
        confidence_bps: u32,
        issued_at_secs: u64,
        expires_at_secs: u64,
        nonce: &str,
        environment: &str,
    ) -> BytesN<64> {
        let nonce = String::from_str(env, nonce);
        let contract_id = contract_id.to_string();
        let environment = String::from_str(env, environment);
        let bytes = build_attestation_message(
            env,
            order_id,
            APPROVE_DECISION,
            confidence_bps,
            issued_at_secs,
            expires_at_secs,
            &nonce,
            &contract_id,
            &environment,
        );
        let signature = signer.sign(&bytes_to_vec(&bytes));
        BytesN::from_array(env, &signature.to_bytes())
    }

    fn bytes_to_vec(bytes: &Bytes) -> Vec<u8> {
        let mut out = vec![0u8; bytes.len() as usize];
        bytes.copy_into_slice(&mut out);
        out
    }

    #[test]
    fn releases_seller_and_rider_after_valid_attestation() {
        let (env, client, contract_id, seller, buyer, rider, token, signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.mark_in_transit(&order_id);

        let signature = sign_attestation(
            &env,
            &signer,
            &contract_id,
            order_id,
            9_500,
            1_200,
            4_000,
            "a".repeat(64).as_str(),
            "staging",
        );
        let nonce = String::from_str(&env, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        let contract_id_str = contract_id.to_string();
        let environment = String::from_str(&env, "staging");
        client.submit_release(
            &order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_200,
            &4_000,
            &nonce,
            &contract_id_str,
            &environment,
            &signature,
        );

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Released);
        assert_eq!(token.balance(&seller), 15);
        assert_eq!(token.balance(&rider), 3);
        assert_eq!(token.balance(&buyer), 1_000_000_000 - 18);
        assert_eq!(token.balance(&contract_id), 0);
    }

    #[test]
    #[should_panic]
    fn rejects_release_with_expired_attestation() {
        let (env, client, _contract_id, seller, buyer, rider, _token, signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.mark_in_transit(&order_id);

        env.ledger().set_timestamp(9_999);
        let signature = sign_attestation(
            &env,
            &signer,
            &_contract_id,
            order_id,
            9_500,
            1_200,
            4_000,
            "b".repeat(64).as_str(),
            "staging",
        );
        let nonce = String::from_str(&env, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
        let contract_id_str = _contract_id.to_string();
        let environment = String::from_str(&env, "staging");
        client.submit_release(
            &order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_200,
            &4_000,
            &nonce,
            &contract_id_str,
            &environment,
            &signature,
        );
    }

    #[test]
    #[should_panic]
    fn rejects_invalid_state_transition() {
        let (_env, client, _contract_id, seller, buyer, rider, _token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);

        client.assign_rider(&order_id, &rider);
    }

    #[test]
    fn refunds_buyer_after_timeout() {
        let (env, client, contract_id, seller, buyer, _rider, token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        env.ledger().set_timestamp(1_000 + FUNDED_UNACCEPTED_TIMEOUT_SECS);
        client.refund_order(&order_id);

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Refunded);
        assert_eq!(token.balance(&buyer), 1_000_000_000);
        assert_eq!(token.balance(&contract_id), 0);
    }

    #[test]
    fn dispute_marks_order_disputed() {
        let (env, client, _contract_id, seller, buyer, rider, _token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.dispute_order(&order_id, &buyer);

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Disputed);
        assert_eq!(order.disputed_at, Some(env.ledger().timestamp()));
        assert_eq!(order.dispute_last_activity_at, Some(env.ledger().timestamp()));
    }

    #[test]
    #[should_panic]
    fn rejects_release_when_nonce_already_consumed_for_order() {
        let (env, client, contract_id, seller, buyer, rider, _token, signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.mark_in_transit(&order_id);

        let nonce = String::from_str(&env, "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
        env.storage()
            .persistent()
            .set(&DataKey::ConsumedReleaseNonce(order_id, nonce.clone()), &true);

        let signature = sign_attestation(
            &env,
            &signer,
            &contract_id,
            order_id,
            9_500,
            1_200,
            4_000,
            "c".repeat(64).as_str(),
            "staging",
        );
        let contract_id_str = contract_id.to_string();
        let environment = String::from_str(&env, "staging");
        client.submit_release(
            &order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_200,
            &4_000,
            &nonce,
            &contract_id_str,
            &environment,
            &signature,
        );
    }

    #[test]
    fn allows_same_nonce_on_different_orders() {
        let (env, client, contract_id, seller, buyer, rider, token, signer) = setup();
        let first_order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);
        let second_order_id = client.create_order(&seller, &buyer, &20, &4, &5_000);

        client.fund_order(&first_order_id);
        client.assign_rider(&first_order_id, &rider);
        client.mark_in_transit(&first_order_id);

        client.fund_order(&second_order_id);
        client.assign_rider(&second_order_id, &rider);
        client.mark_in_transit(&second_order_id);

        let shared_nonce = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
        let first_signature = sign_attestation(
            &env,
            &signer,
            &contract_id,
            first_order_id,
            9_500,
            1_200,
            4_000,
            shared_nonce,
            "staging",
        );
        let second_signature = sign_attestation(
            &env,
            &signer,
            &contract_id,
            second_order_id,
            9_500,
            1_300,
            4_100,
            shared_nonce,
            "staging",
        );
        let nonce = String::from_str(&env, shared_nonce);
        let contract_id_str = contract_id.to_string();
        let environment = String::from_str(&env, "staging");

        client.submit_release(
            &first_order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_200,
            &4_000,
            &nonce,
            &contract_id_str,
            &environment,
            &first_signature,
        );
        client.submit_release(
            &second_order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_300,
            &4_100,
            &nonce,
            &contract_id_str,
            &environment,
            &second_signature,
        );

        assert_eq!(client.get_order(&second_order_id).status, OrderStatus::Released);
        assert_eq!(token.balance(&seller), 35);
        assert_eq!(token.balance(&rider), 7);
    }

    #[test]
    fn records_transition_timestamps_for_assignment_and_transit() {
        let (env, client, _contract_id, seller, buyer, rider, _token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        env.ledger().set_timestamp(1_100);
        client.assign_rider(&order_id, &rider);
        env.ledger().set_timestamp(1_250);
        client.mark_in_transit(&order_id);

        let order = client.get_order(&order_id);
        assert_eq!(order.assigned_at, Some(1_100));
        assert_eq!(order.in_transit_at, Some(1_250));
    }

    #[test]
    #[should_panic]
    fn rejects_refund_before_funded_timeout_window() {
        let (env, client, _contract_id, seller, buyer, _rider, _token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        env.ledger().set_timestamp(1_000 + FUNDED_UNACCEPTED_TIMEOUT_SECS - 1);
        client.refund_order(&order_id);
    }

    #[test]
    fn refunds_buyer_after_assigned_timeout_window() {
        let (env, client, contract_id, seller, buyer, rider, token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        env.ledger().set_timestamp(1_100);
        client.assign_rider(&order_id, &rider);
        env.ledger().set_timestamp(1_100 + ASSIGNED_NOT_IN_TRANSIT_TIMEOUT_SECS);
        client.refund_order(&order_id);

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Refunded);
        assert_eq!(token.balance(&buyer), 1_000_000_000);
        assert_eq!(token.balance(&contract_id), 0);
    }

    #[test]
    fn refunds_buyer_after_in_transit_timeout_window() {
        let (env, client, contract_id, seller, buyer, rider, token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        env.ledger().set_timestamp(1_100);
        client.assign_rider(&order_id, &rider);
        env.ledger().set_timestamp(1_200);
        client.mark_in_transit(&order_id);
        env.ledger().set_timestamp(1_200 + IN_TRANSIT_TIMEOUT_SECS);
        client.refund_order(&order_id);

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Refunded);
        assert_eq!(token.balance(&buyer), 1_000_000_000);
        assert_eq!(token.balance(&contract_id), 0);
    }

    #[test]
    fn refunds_buyer_after_dispute_inactivity_timeout_window() {
        let (env, client, contract_id, seller, buyer, rider, token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        env.ledger().set_timestamp(1_500);
        client.dispute_order(&order_id, &seller);
        env.ledger().set_timestamp(1_500 + DISPUTE_INACTIVITY_TIMEOUT_SECS);
        client.refund_order(&order_id);

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Refunded);
        assert_eq!(token.balance(&buyer), 1_000_000_000);
        assert_eq!(token.balance(&contract_id), 0);
    }

    #[test]
    #[should_panic]
    fn rejects_duplicate_dispute_opening() {
        let (_env, client, _contract_id, seller, buyer, rider, _token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.dispute_order(&order_id, &buyer);
        client.dispute_order(&order_id, &seller);
    }

    #[test]
    #[should_panic]
    fn rejects_dispute_from_non_participant() {
        let (env, client, _contract_id, seller, buyer, rider, _token, _signer) = setup();
        let outsider = Address::generate(&env);
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.dispute_order(&order_id, &outsider);
    }

    #[test]
    #[should_panic]
    fn rejects_release_while_disputed() {
        let (env, client, contract_id, seller, buyer, rider, _token, signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &20_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.mark_in_transit(&order_id);
        client.dispute_order(&order_id, &buyer);

        let signature = sign_attestation(
            &env,
            &signer,
            &contract_id,
            order_id,
            9_500,
            1_200,
            4_000,
            "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            "staging",
        );
        let nonce = String::from_str(&env, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
        let contract_id_str = contract_id.to_string();
        let environment = String::from_str(&env, "staging");

        client.submit_release(
            &order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_200,
            &4_000,
            &nonce,
            &contract_id_str,
            &environment,
            &signature,
        );
    }
}
