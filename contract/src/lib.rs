#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes,
    BytesN, Env, Symbol, panic_with_error,
};

const APPROVE_DECISION: Symbol = symbol_short!("APPROVE");

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
    pub expires_at: u64,
}

#[contracttype]
enum DataKey {
    Config,
    NextOrderId,
    Order(u64),
}

#[contracttype]
#[derive(Clone)]
struct Config {
    token_address: Address,
    oracle_pubkey: BytesN<32>,
}

#[contract]
pub struct PadalaEscrow;

#[contractimpl]
impl PadalaEscrow {
    pub fn initialize(env: Env, token_address: Address, oracle_pubkey: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, ContractError::AlreadyInitialized);
        }

        let config = Config {
            token_address,
            oracle_pubkey,
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
        save_order(&env, &order);
    }

    pub fn submit_release(
        env: Env,
        order_id: u64,
        decision: Symbol,
        confidence_bps: u32,
        issued_at: u64,
        expires_at: u64,
        signature: BytesN<64>,
    ) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);

        if order.status != OrderStatus::InTransit
            && order.status != OrderStatus::EvidenceSubmitted
            && order.status != OrderStatus::Approved
        {
            panic_with_error!(&env, ContractError::InvalidState);
        }

        if decision != APPROVE_DECISION {
            panic_with_error!(&env, ContractError::InvalidDecision);
        }

        if env.ledger().timestamp() > expires_at {
            panic_with_error!(&env, ContractError::AttestationExpired);
        }

        let rider = match order.rider.clone() {
            Some(rider) => rider,
            None => panic_with_error!(&env, ContractError::MissingRider),
        };
        let message =
            build_attestation_message(&env, order_id, decision, confidence_bps, issued_at, expires_at);
        env.crypto()
            .ed25519_verify(&order.oracle_pubkey, &message, &signature);

        let token = token_client(&env);
        let contract_address = env.current_contract_address();
        token.transfer(&contract_address, &order.seller, &order.item_amount);
        token.transfer(&contract_address, &rider, &order.delivery_fee);

        order.status = OrderStatus::Released;
        save_order(&env, &order);
    }

    pub fn dispute_order(env: Env, order_id: u64) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);

        match order.status {
            OrderStatus::Released | OrderStatus::Refunded => {
                panic_with_error!(&env, ContractError::InvalidState)
            }
            _ => {}
        }

        order.status = OrderStatus::Disputed;
        save_order(&env, &order);
    }

    pub fn refund_order(env: Env, order_id: u64) {
        ensure_initialized(&env);
        let mut order = get_order(&env, order_id);
        order.buyer.require_auth();

        let now = env.ledger().timestamp();
        let refundable_status = matches!(
            order.status,
            OrderStatus::Funded
                | OrderStatus::RiderAssigned
                | OrderStatus::InTransit
                | OrderStatus::Rejected
                | OrderStatus::Disputed
                | OrderStatus::Expired
        );
        let timed_out = now > order.expires_at;

        if !refundable_status || (!timed_out && order.status != OrderStatus::Rejected) {
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

fn build_attestation_message(
    env: &Env,
    order_id: u64,
    decision: Symbol,
    confidence_bps: u32,
    issued_at: u64,
    expires_at: u64,
) -> Bytes {
    let mut message = Bytes::new(env);
    append_bytes(&mut message, b"padala-vision:v1");
    message.push_back(0x1f);
    append_bytes(&mut message, &order_id.to_be_bytes());
    message.push_back(decision_to_code(decision));
    append_bytes(&mut message, &confidence_bps.to_be_bytes());
    append_bytes(&mut message, &issued_at.to_be_bytes());
    append_bytes(&mut message, &expires_at.to_be_bytes());
    message
}

fn append_bytes(bytes: &mut Bytes, data: &[u8]) {
    for value in data {
        bytes.push_back(*value);
    }
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
        client.initialize(&token_address, &oracle_pubkey);

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
        order_id: u64,
        confidence_bps: u32,
        issued_at: u64,
        expires_at: u64,
    ) -> BytesN<64> {
        let bytes = build_test_attestation_message(order_id, confidence_bps, issued_at, expires_at);
        let signature = signer.sign(&bytes);
        BytesN::from_array(env, &signature.to_bytes())
    }

    fn build_test_attestation_message(
        order_id: u64,
        confidence_bps: u32,
        issued_at: u64,
        expires_at: u64,
    ) -> [u8; 46] {
        let mut data = [0u8; 46];
        let prefix = b"padala-vision:v1";
        data[..16].copy_from_slice(prefix);
        data[16] = 0x1f;
        data[17..25].copy_from_slice(&order_id.to_be_bytes());
        data[25] = 1;
        data[26..30].copy_from_slice(&confidence_bps.to_be_bytes());
        data[30..38].copy_from_slice(&issued_at.to_be_bytes());
        data[38..46].copy_from_slice(&expires_at.to_be_bytes());
        data
    }

    #[test]
    fn releases_seller_and_rider_after_valid_attestation() {
        let (env, client, contract_id, seller, buyer, rider, token, signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.mark_in_transit(&order_id);

        let signature = sign_attestation(&env, &signer, order_id, 9_500, 1_200, 4_000);
        client.submit_release(
            &order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_200,
            &4_000,
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
        let signature = sign_attestation(&env, &signer, order_id, 9_500, 1_200, 4_000);
        client.submit_release(
            &order_id,
            &APPROVE_DECISION,
            &9_500,
            &1_200,
            &4_000,
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
        let order_id = client.create_order(&seller, &buyer, &15, &3, &1_500);

        client.fund_order(&order_id);
        env.ledger().set_timestamp(2_000);
        client.refund_order(&order_id);

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Refunded);
        assert_eq!(token.balance(&buyer), 1_000_000_000);
        assert_eq!(token.balance(&contract_id), 0);
    }

    #[test]
    fn dispute_marks_order_disputed() {
        let (_env, client, _contract_id, seller, buyer, rider, _token, _signer) = setup();
        let order_id = client.create_order(&seller, &buyer, &15, &3, &5_000);

        client.fund_order(&order_id);
        client.assign_rider(&order_id, &rider);
        client.dispute_order(&order_id);

        let order = client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Disputed);
    }
}
