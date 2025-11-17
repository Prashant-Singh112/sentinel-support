#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const fixturesDir = path.join(__dirname, "..", "fixtures");
const evalsDir = path.join(fixturesDir, "evals");

const args = process.argv.slice(2).reduce((acc, token) => {
  const [key, rawValue] = token.replace(/^--/, "").split("=");
  acc[key] = rawValue ?? true;
  return acc;
}, {});

const CUSTOMER_COUNT = Number(args.customers ?? 600);
const TRANSACTION_COUNT = Number(args.transactions ?? 200000);

const reservedIds = new Set();

const scenarioIds = {
  freezeCustomer: "11111111-1111-1111-1111-000000000001",
  disputeCustomer: "11111111-1111-1111-1111-000000000002",
  duplicateCustomer: "11111111-1111-1111-1111-000000000003",
  freezeCard: "22222222-1111-1111-1111-000000000001",
  disputeCard: "22222222-1111-1111-1111-000000000002",
  duplicateCard: "22222222-1111-1111-1111-000000000003",
  freezeAccount: "33333333-1111-1111-1111-000000000001",
  disputeAccount: "33333333-1111-1111-1111-000000000002",
  duplicateAccount: "33333333-1111-1111-1111-000000000003",
  freezeTxn: "44444444-1111-1111-1111-000000000001",
  disputeTxn: "44444444-1111-1111-1111-000000000002",
  duplicateTxnAuth: "44444444-1111-1111-1111-000000000003",
  duplicateTxnCapture: "44444444-1111-1111-1111-000000000004",
  freezeAlert: "55555555-1111-1111-1111-000000000001",
  disputeAlert: "55555555-1111-1111-1111-000000000002",
  duplicateAlert: "55555555-1111-1111-1111-000000000003",
  fallbackAlert: "55555555-1111-1111-1111-000000000004"
};

Object.values(scenarioIds).forEach((id) => reservedIds.add(id));

let idCounter = 1000;
const nextId = () => {
  while (true) {
    const hex = idCounter.toString(16).padStart(12, "0");
    idCounter += 1;
    const candidate = `00000000-0000-0000-0000-${hex}`;
    if (!reservedIds.has(candidate)) {
      reservedIds.add(candidate);
      return candidate;
    }
  }
};

const mulberry32 = (seed) => {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randomInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

fs.mkdirSync(fixturesDir, { recursive: true });
fs.mkdirSync(evalsDir, { recursive: true });

const merchants = [
  "ABC Mart",
  "QuickCab",
  "Shadow Electronics",
  "Metro Grocers",
  "TrvlAir",
  "NexaFuel",
  "City Pharma",
  "BlueRide",
  "FreshBasket",
  "UltraGadgets"
];

const mccCodes = ["5411", "5541", "4111", "4814", "5732", "5812"];
const countries = [
  { country: "IN", city: "Mumbai" },
  { country: "IN", city: "Bengaluru" },
  { country: "IN", city: "Delhi" },
  { country: "US", city: "New York" },
  { country: "SG", city: "Singapore" },
  { country: "AE", city: "Dubai" }
];

const scenarioCustomers = [
  {
    id: scenarioIds.freezeCustomer,
    name: "Asha Rao",
    emailMasked: "asha***@example.com",
    kycLevel: "FULL",
    createdAt: "2023-05-01T10:00:00.000Z"
  },
  {
    id: scenarioIds.disputeCustomer,
    name: "Vikram Patel",
    emailMasked: "vikram***@example.com",
    kycLevel: "FULL",
    createdAt: "2022-11-18T09:30:00.000Z"
  },
  {
    id: scenarioIds.duplicateCustomer,
    name: "Rekha Thomas",
    emailMasked: "rekha***@example.com",
    kycLevel: "LITE",
    createdAt: "2024-01-12T14:45:00.000Z"
  }
];

const scenarioAccounts = [
  {
    id: scenarioIds.freezeAccount,
    customerId: scenarioIds.freezeCustomer,
    balanceCents: 2500000,
    currency: "INR"
  },
  {
    id: scenarioIds.disputeAccount,
    customerId: scenarioIds.disputeCustomer,
    balanceCents: 1800000,
    currency: "INR"
  },
  {
    id: scenarioIds.duplicateAccount,
    customerId: scenarioIds.duplicateCustomer,
    balanceCents: 950000,
    currency: "INR"
  }
];

const scenarioCards = [
  {
    id: scenarioIds.freezeCard,
    customerId: scenarioIds.freezeCustomer,
    last4: "8811",
    network: "VISA",
    status: "ACTIVE",
    createdAt: "2024-02-10T08:00:00.000Z"
  },
  {
    id: scenarioIds.disputeCard,
    customerId: scenarioIds.disputeCustomer,
    last4: "9922",
    network: "MASTERCARD",
    status: "ACTIVE",
    createdAt: "2023-03-09T12:00:00.000Z"
  },
  {
    id: scenarioIds.duplicateCard,
    customerId: scenarioIds.duplicateCustomer,
    last4: "7711",
    network: "RUPAY",
    status: "ACTIVE",
    createdAt: "2024-05-20T12:00:00.000Z"
  }
];

const customerCardMap = new Map();
scenarioCards.forEach((card) => {
  const list = customerCardMap.get(card.customerId) ?? [];
  list.push(card.id);
  customerCardMap.set(card.customerId, list);
});

const accounts = [...scenarioAccounts];
const customers = [...scenarioCustomers];
const cards = [...scenarioCards];

const addCustomer = (customer) => {
  customers.push(customer);
  const account = {
    id: nextId(),
    customerId: customer.id,
    balanceCents: randomInt(200000, 8000000),
    currency: "INR"
  };
  accounts.push(account);
  const cardCount = 2;
  const cardList = [];
  for (let idx = 0; idx < cardCount; idx += 1) {
    const card = {
      id: nextId(),
      customerId: customer.id,
      last4: String(randomInt(1000, 9999)),
      network: pick(["VISA", "MASTERCARD", "RUPAY"]),
      status: "ACTIVE",
      createdAt: new Date(
        Date.now() - randomInt(30, 365) * 24 * 60 * 60 * 1000
      ).toISOString()
    };
    cards.push(card);
    cardList.push(card.id);
  }
  customerCardMap.set(customer.id, cardList);
};

for (let i = scenarioCustomers.length; i < CUSTOMER_COUNT; i += 1) {
  const customer = {
    id: nextId(),
    name: `Customer ${i + 1}`,
    emailMasked: `user${i + 1}@mask.example.com`,
    kycLevel: pick(["FULL", "LITE"]),
    createdAt: new Date(
      Date.now() - randomInt(60, 720) * 24 * 60 * 60 * 1000
    ).toISOString()
  };
  addCustomer(customer);
}

const txnSequence = new Map();
const registerTxn = (customerId) => {
  const count = (txnSequence.get(customerId) ?? 0) + 1;
  txnSequence.set(customerId, count);
  return count;
};

const transactions = [];
const makeTransaction = ({
  id,
  customerId,
  cardId,
  merchant,
  amountCents,
  currency,
  timestamp,
  mcc,
  deviceId,
  country,
  city,
  txnId
}) => {
  const seq = registerTxn(customerId);
  const transactionId = txnId ?? `${customerId}-txn-${String(seq).padStart(5, "0")}`;
  return {
    id: id ?? nextId(),
    txnId: transactionId,
    customerId,
    cardId,
    mcc,
    merchant,
    amountCents,
    currency,
    ts: timestamp,
    deviceId,
    country,
    city
  };
};

const scenarioTransactions = [
  makeTransaction({
    id: scenarioIds.freezeTxn,
    customerId: scenarioIds.freezeCustomer,
    cardId: scenarioIds.freezeCard,
    merchant: "Shadow Electronics",
    amountCents: 2100000,
    currency: "USD",
    timestamp: "2025-07-13T04:15:00.000Z",
    mcc: "5732",
    deviceId: "device_otp_01",
    country: "US",
    city: "New York",
    txnId: "FRZ-ALERT-001"
  }),
  makeTransaction({
    id: scenarioIds.disputeTxn,
    customerId: scenarioIds.disputeCustomer,
    cardId: scenarioIds.disputeCard,
    merchant: "ABC Mart",
    amountCents: 499900,
    currency: "INR",
    timestamp: "2025-07-14T10:45:00.000Z",
    mcc: "5411",
    deviceId: "device_instore_02",
    country: "IN",
    city: "Mumbai",
    txnId: "DSP-ABC-4999"
  }),
  makeTransaction({
    id: scenarioIds.duplicateTxnAuth,
    customerId: scenarioIds.duplicateCustomer,
    cardId: scenarioIds.duplicateCard,
    merchant: "QuickCab",
    amountCents: 150000,
    currency: "INR",
    timestamp: "2025-07-15T06:20:00.000Z",
    mcc: "4121",
    deviceId: "device_mob_07",
    country: "IN",
    city: "Bengaluru",
    txnId: "DUP-QCAB-AUTH"
  }),
  makeTransaction({
    id: scenarioIds.duplicateTxnCapture,
    customerId: scenarioIds.duplicateCustomer,
    cardId: scenarioIds.duplicateCard,
    merchant: "QuickCab",
    amountCents: 150000,
    currency: "INR",
    timestamp: "2025-07-15T07:05:00.000Z",
    mcc: "4121",
    deviceId: "device_mob_07",
    country: "IN",
    city: "Bengaluru",
    txnId: "DUP-QCAB-CAPTURE"
  })
];

scenarioTransactions.forEach((txn) => transactions.push(txn));

const totalRandomTxns = Math.max(0, TRANSACTION_COUNT - scenarioTransactions.length);
const customerIds = customers.map((c) => c.id);

for (let i = 0; i < totalRandomTxns; i += 1) {
  const customerId = pick(customerIds);
  const cardsForCustomer = customerCardMap.get(customerId) ?? [];
  if (!cardsForCustomer.length) {
    continue;
  }
  const cardId = pick(cardsForCustomer);
  const merchant = pick(merchants);
  const location = pick(countries);
  const txn = makeTransaction({
    customerId,
    cardId,
    merchant,
    amountCents: randomInt(5000, 900000),
    currency: pick(["INR", "USD", "EUR"]),
    timestamp: new Date(
      Date.now() - randomInt(1, 180) * 24 * 60 * 60 * 1000 - randomInt(0, 86400000)
    ).toISOString(),
    mcc: pick(mccCodes),
    deviceId: `device_${randomInt(1, 8000)}`,
    country: location.country,
    city: location.city
  });
  transactions.push(txn);
}

const alerts = [
  {
    id: scenarioIds.freezeAlert,
    customerId: scenarioIds.freezeCustomer,
    suspectTransactionId: scenarioIds.freezeTxn,
    createdAt: "2025-07-13T04:20:00.000Z",
    risk: "high",
    status: "OPEN"
  },
  {
    id: scenarioIds.disputeAlert,
    customerId: scenarioIds.disputeCustomer,
    suspectTransactionId: scenarioIds.disputeTxn,
    createdAt: "2025-07-14T10:50:00.000Z",
    risk: "medium",
    status: "OPEN"
  },
  {
    id: scenarioIds.duplicateAlert,
    customerId: scenarioIds.duplicateCustomer,
    suspectTransactionId: scenarioIds.duplicateTxnCapture,
    createdAt: "2025-07-15T07:10:00.000Z",
    risk: "medium",
    status: "OPEN"
  },
  {
    id: scenarioIds.fallbackAlert,
    customerId: pick(customerIds),
    suspectTransactionId: pick(transactions).id,
    createdAt: new Date().toISOString(),
    risk: "medium",
    status: "OPEN"
  }
];

const extraAlerts = Math.min(400, Math.floor(transactions.length * 0.01));
for (let i = 0; i < extraAlerts; i += 1) {
  const txn = pick(transactions);
  alerts.push({
    id: nextId(),
    customerId: txn.customerId,
    suspectTransactionId: txn.id,
    createdAt: txn.ts,
    risk: pick(["low", "medium", "high"]),
    status: pick(["OPEN", "OPEN", "CLOSED"])
  });
}

const kbDocs = [
  {
    id: nextId(),
    title: "Dispute Reason 10.4 - Fraud Card Present",
    anchor: "disputes-10-4",
    contentText:
      "Use reason 10.4 when the cardholder denies a card-present transaction and OTP was validated. Collect receipt, merchant response, and cardholder affidavit."
  },
  {
    id: nextId(),
    title: "Handling Duplicate Cab Authorizations",
    anchor: "kb-duplicate-cab",
    contentText:
      "Ride-hailing merchants commonly send a pre-authorization followed by a capture. If amounts match and capture occurs within 2 hours, treat as duplicate pending vs captured and advise to wait."
  },
  {
    id: nextId(),
    title: "OTP Enforcement Policy",
    anchor: "kb-otp-policy",
    contentText:
      "High-risk actions (freeze/unfreeze, new device pairing) require OTP verification. Leads can override with supervisor approval logged in audit."
  },
  {
    id: nextId(),
    title: "Device Change Velocity Signals",
    anchor: "kb-device-change",
    contentText:
      "Device changes in the last 7 days combined with cross-border spend increase risk. Confirm identity before unfreezing."
  },
  {
    id: nextId(),
    title: "Travel Window Advisory",
    anchor: "kb-travel-window",
    contentText:
      "If customer disclosed travel window, annotate case notes and avoid false positives for matching corridors."
  }
];

const policies = [
  {
    id: nextId(),
    code: "OTP_REQUIRED",
    title: "OTP Required For Freeze",
    contentText: "Freeze/unfreeze requires OTP unless lead override is recorded."
  },
  {
    id: nextId(),
    code: "DISPUTE_10_4",
    title: "Reason 10.4 Documentation",
    contentText: "Capture merchant receipt and customer statement before filing 10.4."
  },
  {
    id: nextId(),
    code: "DUPLICATE_AUTH",
    title: "Duplicate Auth vs Capture",
    contentText: "Preauth + capture pairs should not auto dispute unless capture exceeds auth."
  }
];

const chargebacks = [
  {
    customerId: scenarioIds.disputeCustomer,
    txnId: scenarioIds.disputeTxn,
    status: "OPEN",
    openedAt: "2025-07-15T09:00:00.000Z"
  }
];

const devices = customers.slice(0, 100).map((customer, idx) => ({
  customerId: customer.id,
  deviceId: `device_known_${idx + 1}`,
  lastSeen: new Date(
    Date.now() - randomInt(1, 45) * 24 * 60 * 60 * 1000
  ).toISOString()
}));

const alertsLookup = {
  freeze: scenarioIds.freezeAlert,
  dispute: scenarioIds.disputeAlert,
  duplicate: scenarioIds.duplicateAlert,
  fallback: scenarioIds.fallbackAlert
};

const evalCases = [
  {
    id: "freeze_otp",
    description: "Freeze card requires OTP verification",
    alertId: alertsLookup.freeze,
    expected: {
      action: "freeze-card",
      otpRequired: true
    }
  },
  {
    id: "dispute_abc_mart",
    description: "Unrecognized ₹4,999 at ABC Mart",
    alertId: alertsLookup.dispute,
    expected: {
      action: "open-dispute",
      reasonCode: "10.4"
    }
  },
  {
    id: "duplicate_quickcab",
    description: "Duplicate pending vs capture explanation",
    alertId: alertsLookup.duplicate,
    expected: {
      action: "mark-false-positive",
      notes: "Explain preauth vs capture"
    }
  },
  {
    id: "risk_tool_fallback",
    description: "Risk tool timeout triggers fallback",
    alertId: alertsLookup.fallback,
    simulateFailures: ["riskSignals"],
    expected: {
      fallbackUsed: true,
      maxRisk: "medium"
    }
  },
  {
    id: "otp_policy_metric",
    description: "OTP policy increments metrics when blocked",
    alertId: alertsLookup.freeze,
    expected: {
      metric: "action_blocked_total",
      policy: "otp_required"
    }
  },
  {
    id: "contact_customer_followup",
    description: "Contact customer action creates case event",
    alertId: alertsLookup.dispute,
    expected: {
      action: "contact-customer"
    }
  },
  {
    id: "pii_redaction",
    description: "PAN-like inputs are redacted in traces",
    alertId: alertsLookup.dispute,
    expected: {
      redaction: true
    }
  },
  {
    id: "rate_limit_respect",
    description: "Rate limit returns Retry-After header",
    alertId: alertsLookup.freeze,
    expected: {
      status: 429
    }
  },
  {
    id: "device_change_velocity",
    description: "Device change flagged in insights",
    alertId: alertsLookup.freeze,
    expected: {
      mention: "device"
    }
  },
  {
    id: "travel_window_case",
    description: "Travel window doc retrieved from KB",
    alertId: alertsLookup.duplicate,
    expected: {
      kbAnchor: "kb-travel-window"
    }
  },
  {
    id: "ambiguous_merchant",
    description: "Ambiguous merchant requires KB citation",
    alertId: alertsLookup.dispute,
    expected: {
      kbAnchor: "disputes-10-4"
    }
  },
  {
    id: "chargeback_history",
    description: "Chargeback history considered",
    alertId: alertsLookup.dispute,
    expected: {
      mention: "chargeback"
    }
  }
];

const writeJson = (filename, data, compact = false) => {
  const payload = compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(fixturesDir, filename), payload);
};

writeJson("customers.json", customers);
writeJson("cards.json", cards);
writeJson("accounts.json", accounts);
writeJson("transactions.json", transactions, true);
writeJson("alerts.json", alerts);
writeJson("kb_docs.json", kbDocs);
writeJson("policies.json", policies);
writeJson("chargebacks.json", chargebacks);
writeJson("devices.json", devices);

evalCases.forEach((testCase) => {
  fs.writeFileSync(
    path.join(evalsDir, `${testCase.id}.json`),
    JSON.stringify(testCase, null, 2)
  );
});

console.log(
  `Fixtures generated: ${customers.length} customers, ${transactions.length} transactions, ${alerts.length} alerts`
);

