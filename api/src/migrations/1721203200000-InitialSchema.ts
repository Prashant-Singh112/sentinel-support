import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1721203200000 implements MigrationInterface {
  name = "InitialSchema1721203200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE customers (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        email_masked text NOT NULL,
        kyc_level text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE accounts (
        id uuid PRIMARY KEY,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        balance_cents bigint NOT NULL,
        currency text NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE cards (
        id uuid PRIMARY KEY,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        last4 text NOT NULL,
        network text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY,
        txn_id text NOT NULL,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        card_id uuid NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
        mcc text NOT NULL,
        merchant text NOT NULL,
        amount_cents bigint NOT NULL,
        currency text NOT NULL,
        ts timestamptz NOT NULL,
        device_id text NOT NULL,
        country text NOT NULL,
        city text NOT NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_transactions_customer_txn ON transactions(customer_id, txn_id)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_customer_ts ON transactions(customer_id, ts DESC)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_merchant ON transactions(merchant)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_mcc ON transactions(mcc)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_customer_merchant ON transactions(customer_id, merchant)`);

    await queryRunner.query(`
      CREATE TABLE alerts (
        id uuid PRIMARY KEY,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        suspect_txn_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        risk text NOT NULL,
        status text NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE cases (
        id uuid PRIMARY KEY,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        txn_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
        type text NOT NULL,
        status text NOT NULL,
        reason_code text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE case_events (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        ts timestamptz NOT NULL DEFAULT now(),
        actor text NOT NULL,
        action text NOT NULL,
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);

    await queryRunner.query(`
      CREATE TABLE triage_runs (
        id uuid PRIMARY KEY,
        alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
        started_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz,
        risk text NOT NULL,
        reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
        fallback_used boolean NOT NULL DEFAULT false,
        latency_ms integer
      )
    `);

    await queryRunner.query(`
      CREATE TABLE agent_traces (
        run_id uuid NOT NULL REFERENCES triage_runs(id) ON DELETE CASCADE,
        seq integer NOT NULL,
        step text NOT NULL,
        ok boolean NOT NULL,
        duration_ms integer NOT NULL,
        detail_json jsonb NOT NULL,
        PRIMARY KEY (run_id, seq)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb_docs (
        id uuid PRIMARY KEY,
        title text NOT NULL,
        anchor text NOT NULL,
        content_text text NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE policies (
        id uuid PRIMARY KEY,
        code text NOT NULL UNIQUE,
        title text NOT NULL,
        content_text text NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE chargebacks (
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        txn_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        status text NOT NULL,
        opened_at timestamptz NOT NULL,
        PRIMARY KEY (customer_id, txn_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE devices (
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        device_id text NOT NULL,
        last_seen timestamptz NOT NULL,
        PRIMARY KEY (customer_id, device_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS devices`);
    await queryRunner.query(`DROP TABLE IF EXISTS chargebacks`);
    await queryRunner.query(`DROP TABLE IF EXISTS policies`);
    await queryRunner.query(`DROP TABLE IF EXISTS kb_docs`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_traces`);
    await queryRunner.query(`DROP TABLE IF EXISTS triage_runs`);
    await queryRunner.query(`DROP TABLE IF EXISTS case_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS cases`);
    await queryRunner.query(`DROP TABLE IF EXISTS alerts`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_customer_merchant`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_mcc`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_merchant`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_customer_ts`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_customer_txn`);
    await queryRunner.query(`DROP TABLE IF EXISTS transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS cards`);
    await queryRunner.query(`DROP TABLE IF EXISTS accounts`);
    await queryRunner.query(`DROP TABLE IF EXISTS customers`);
  }
}

