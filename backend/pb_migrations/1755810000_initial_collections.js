/// <reference path="../pb_data/types.d.ts" />

const activeMember = '@request.auth.id != "" && @request.auth.active = true'
const operator = `${activeMember} && (@request.auth.role = "operator" || @request.auth.role = "admin")`

migrate((app) => {
  const members = new Collection({
    type: "auth",
    name: "members",
    listRule: activeMember,
    viewRule: activeMember,
    createRule: null,
    updateRule: operator,
    deleteRule: operator,
    fields: [
      { name: "name", type: "text", required: true, min: 1, max: 60 },
      { name: "role", type: "select", required: true, maxSelect: 1, values: ["member", "operator", "admin"] },
      { name: "active", type: "bool" },
      { name: "joinedAt", type: "date" }
    ],
    indexes: [
      "CREATE INDEX idx_members_name ON members (name)",
      "CREATE INDEX idx_members_active ON members (active)"
    ],
    passwordAuth: {
      enabled: true,
      identityFields: ["email"]
    }
  })
  app.save(members)

  const periods = new Collection({
    type: "base",
    name: "dues_periods",
    listRule: activeMember,
    viewRule: activeMember,
    createRule: operator,
    updateRule: operator,
    deleteRule: operator,
    fields: [
      { name: "year", type: "number", required: true, min: 2020, max: 2100, onlyInt: true },
      { name: "month", type: "number", required: true, min: 1, max: 12, onlyInt: true },
      { name: "label", type: "text", required: true, max: 80 },
      { name: "amount", type: "number", required: true, min: 0, onlyInt: true },
      { name: "dueDate", type: "date" },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["open", "closed"] }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_dues_period_unique ON dues_periods (year, month)"
    ]
  })
  app.save(periods)

  const payments = new Collection({
    type: "base",
    name: "dues_payments",
    listRule: activeMember,
    viewRule: activeMember,
    createRule: operator,
    updateRule: operator,
    deleteRule: operator,
    fields: [
      { name: "period", type: "relation", required: true, maxSelect: 1, collectionId: periods.id, cascadeDelete: true },
      { name: "member", type: "relation", required: true, maxSelect: 1, collectionId: members.id, cascadeDelete: true },
      { name: "amount", type: "number", required: true, min: 0, onlyInt: true },
      { name: "paid", type: "bool" },
      { name: "paidAt", type: "date" },
      { name: "note", type: "text", max: 200 }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_dues_payment_unique ON dues_payments (period, member)",
      "CREATE INDEX idx_dues_payment_paid ON dues_payments (paid)"
    ]
  })
  app.save(payments)

  const transactions = new Collection({
    type: "base",
    name: "transactions",
    listRule: `${activeMember} && (visibleToMembers = true || ${operator})`,
    viewRule: `${activeMember} && (visibleToMembers = true || ${operator})`,
    createRule: operator,
    updateRule: operator,
    deleteRule: operator,
    fields: [
      { name: "transactedAt", type: "date", required: true },
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["income", "expense"] },
      { name: "category", type: "text", required: true, max: 80 },
      { name: "amount", type: "number", required: true, min: 0, onlyInt: true },
      { name: "memo", type: "text", max: 300 },
      { name: "balanceAfter", type: "number", min: 0, onlyInt: true },
      { name: "visibleToMembers", type: "bool" }
    ],
    indexes: [
      "CREATE INDEX idx_transactions_date ON transactions (transactedAt)",
      "CREATE INDEX idx_transactions_visible ON transactions (visibleToMembers)"
    ]
  })
  app.save(transactions)

  const rules = new Collection({
    type: "base",
    name: "rules",
    listRule: `${activeMember} && (published = true || ${operator})`,
    viewRule: `${activeMember} && (published = true || ${operator})`,
    createRule: operator,
    updateRule: operator,
    deleteRule: operator,
    fields: [
      { name: "title", type: "text", required: true, max: 120 },
      { name: "content", type: "editor", required: true },
      { name: "version", type: "text", required: true, max: 30 },
      { name: "effectiveDate", type: "date" },
      { name: "published", type: "bool" }
    ],
    indexes: [
      "CREATE INDEX idx_rules_published ON rules (published, effectiveDate)"
    ]
  })
  app.save(rules)

  const imports = new Collection({
    type: "base",
    name: "bank_imports",
    listRule: operator,
    viewRule: operator,
    createRule: operator,
    updateRule: operator,
    deleteRule: operator,
    fields: [
      { name: "source", type: "select", required: true, maxSelect: 1, values: ["kakaobank", "manual"] },
      { name: "originalFile", type: "file", maxSelect: 1, maxSize: 10485760, mimeTypes: ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
      { name: "importedAt", type: "date", required: true },
      { name: "rowCount", type: "number", min: 0, onlyInt: true },
      { name: "note", type: "text", max: 300 }
    ]
  })
  app.save(imports)

  const bankTransactions = new Collection({
    type: "base",
    name: "bank_transactions",
    listRule: operator,
    viewRule: operator,
    createRule: operator,
    updateRule: operator,
    deleteRule: operator,
    fields: [
      { name: "bankImport", type: "relation", maxSelect: 1, collectionId: imports.id, cascadeDelete: true },
      { name: "transactedAt", type: "date", required: true },
      { name: "description", type: "text", required: true, max: 200 },
      { name: "deposit", type: "number", min: 0, onlyInt: true },
      { name: "withdrawal", type: "number", min: 0, onlyInt: true },
      { name: "balance", type: "number", min: 0, onlyInt: true },
      { name: "matchedMember", type: "relation", maxSelect: 1, collectionId: members.id, cascadeDelete: false }
    ],
    indexes: [
      "CREATE INDEX idx_bank_transactions_date ON bank_transactions (transactedAt)"
    ]
  })
  app.save(bankTransactions)
}, (app) => {
  for (const name of [
    "bank_transactions",
    "bank_imports",
    "rules",
    "transactions",
    "dues_payments",
    "dues_periods",
    "members"
  ]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
})
