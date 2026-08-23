/// <reference path="../pb_data/types.d.ts" />

const signedIn = '@request.auth.id != "" && @request.auth.active = true && @request.auth.mustChangePassword = false'
const admin = `${signedIn} && (@request.auth.isAdmin = true || @request.auth.role = "admin")`
const chair = `${signedIn} && @request.auth.role = "chair"`
const treasurer = `${signedIn} && @request.auth.role = "treasurer"`
const finance = `(${admin} || ${treasurer})`
const ruleManager = `(${admin} || ${chair})`
const leadership = `(${admin} || ${chair} || ${treasurer})`
const memberSelfPasswordUpdate = [
  'id = @request.auth.id',
  '@request.body.loginId:isset = false',
  '@request.body.email:isset = false',
  '@request.body.emailVisibility:isset = false',
  '@request.body.verified:isset = false',
  '@request.body.name:isset = false',
  '@request.body.role:isset = false',
  '@request.body.isAdmin:isset = false',
  '@request.body.active:isset = false',
  '@request.body.joinedAt:isset = false',
  '@request.body.mustChangePassword:isset = false'
].join(' && ')
const requiredPasswordChange = [
  'id = @request.auth.id',
  '@request.auth.active = true',
  '@request.auth.mustChangePassword = true',
  '@request.body.oldPassword:isset = true',
  '@request.body.password:isset = true',
  '@request.body.passwordConfirm:isset = true',
  '@request.body.mustChangePassword = false',
  '@request.body.loginId:isset = false',
  '@request.body.email:isset = false',
  '@request.body.emailVisibility:isset = false',
  '@request.body.verified:isset = false',
  '@request.body.name:isset = false',
  '@request.body.role:isset = false',
  '@request.body.isAdmin:isset = false',
  '@request.body.active:isset = false',
  '@request.body.joinedAt:isset = false'
].join(' && ')

migrate((app) => {
  const members = app.findCollectionByNameOrId("members")
  members.fields.getByName("role").values = ["member", "chair", "treasurer", "admin", "operator"]
  members.fields.add(new BoolField({ name: "isAdmin" }))
  members.listRule = admin
  members.viewRule = `id = @request.auth.id || ${admin}`
  members.createRule = admin
  members.updateRule = `${admin} || (${memberSelfPasswordUpdate}) || (${requiredPasswordChange})`
  members.deleteRule = admin
  members.manageRule = admin
  app.save(members)

  // Preserve the existing bootstrap administrator while giving it the requested chair role.
  const legacyAdmins = app.findRecordsByFilter("members", "role = 'admin'", "", 200, 0)
  for (const member of legacyAdmins) {
    member.set("isAdmin", true)
    member.set("role", "chair")
    app.save(member)
  }

  const officerTerms = new Collection({
    type: "base",
    name: "officer_terms",
    listRule: signedIn,
    viewRule: signedIn,
    createRule: admin,
    updateRule: admin,
    deleteRule: admin,
    fields: [
      { name: "year", type: "number", required: true, min: 2020, max: 2100, onlyInt: true },
      { name: "office", type: "select", required: true, maxSelect: 1, values: ["chair", "treasurer"] },
      { name: "member", type: "relation", required: true, maxSelect: 1, collectionId: members.id, cascadeDelete: false },
      { name: "startsOn", type: "date", required: true },
      { name: "endsOn", type: "date", required: true }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_officer_terms_year_office ON officer_terms (year, office)"]
  })
  app.save(officerTerms)

  const policies = new Collection({
    type: "base",
    name: "dues_policies",
    listRule: signedIn,
    viewRule: signedIn,
    createRule: finance,
    updateRule: finance,
    deleteRule: finance,
    fields: [
      { name: "year", type: "number", required: true, min: 2020, max: 2100, onlyInt: true },
      { name: "monthlyAmount", type: "number", required: true, min: 0, onlyInt: true },
      { name: "annualAmount", type: "number", required: true, min: 0, onlyInt: true },
      { name: "dueDay", type: "number", required: true, min: 1, max: 31, onlyInt: true },
      { name: "note", type: "text", max: 300 },
      { name: "active", type: "bool" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_dues_policy_year ON dues_policies (year)"]
  })
  app.save(policies)

  const periods = app.findCollectionByNameOrId("dues_periods")
  periods.fields.getByName("month").min = 1
  periods.fields.getByName("month").max = 13 // 13 is the internal annual-prepayment slot.
  periods.fields.add(new SelectField({ name: "billingType", required: true, maxSelect: 1, values: ["monthly", "annual"] }))
  periods.fields.add(new RelationField({ name: "policy", maxSelect: 1, collectionId: policies.id, cascadeDelete: false }))
  periods.listRule = signedIn
  periods.viewRule = signedIn
  periods.createRule = finance
  periods.updateRule = finance
  periods.deleteRule = finance
  periods.removeIndex("idx_dues_period_unique")
  periods.addIndex("idx_dues_period_unique", true, "year, month, billingType", "")
  app.save(periods)

  const payments = app.findCollectionByNameOrId("dues_payments")
  payments.fields.add(new SelectField({ name: "status", required: true, maxSelect: 1, values: ["unpaid", "paid", "exempt"] }))
  payments.fields.add(new SelectField({ name: "paymentPlan", maxSelect: 1, values: ["monthly", "annual"] }))
  payments.listRule = finance
  payments.viewRule = finance
  payments.createRule = finance
  payments.updateRule = finance
  payments.deleteRule = finance
  app.save(payments)

  const transactions = app.findCollectionByNameOrId("transactions")
  transactions.fields.add(new SelectField({ name: "entryStatus", required: true, maxSelect: 1, values: ["draft", "confirmed", "void"] }))
  transactions.fields.add(new RelationField({ name: "createdBy", maxSelect: 1, collectionId: members.id, cascadeDelete: false }))
  transactions.fields.add(new RelationField({ name: "confirmedBy", maxSelect: 1, collectionId: members.id, cascadeDelete: false }))
  transactions.fields.add(new DateField({ name: "confirmedAt" }))
  transactions.fields.add(new FileField({
    name: "evidence",
    maxSelect: 3,
    maxSize: 10485760,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    protected: true
  }))
  transactions.listRule = finance
  transactions.viewRule = finance
  transactions.createRule = finance
  transactions.updateRule = finance
  transactions.deleteRule = finance
  app.save(transactions)

  const rules = app.findCollectionByNameOrId("rules")
  rules.listRule = `${signedIn} && (published = true || ${ruleManager})`
  rules.viewRule = `${signedIn} && (published = true || ${ruleManager})`
  rules.createRule = ruleManager
  rules.updateRule = ruleManager
  rules.deleteRule = ruleManager
  app.save(rules)

  for (const name of ["bank_imports", "bank_transactions"]) {
    const collection = app.findCollectionByNameOrId(name)
    collection.listRule = finance
    collection.viewRule = finance
    collection.createRule = finance
    collection.updateRule = finance
    collection.deleteRule = finance
    app.save(collection)
  }

  const auditLogs = new Collection({
    type: "base",
    name: "audit_logs",
    listRule: `${admin} || (${chair} && (domain = "rules" || domain = "ledger")) || (${treasurer} && (domain = "dues" || domain = "ledger"))`,
    viewRule: `${admin} || (${chair} && (domain = "rules" || domain = "ledger")) || (${treasurer} && (domain = "dues" || domain = "ledger"))`,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "actor", type: "relation", maxSelect: 1, collectionId: members.id, cascadeDelete: false },
      { name: "action", type: "select", required: true, maxSelect: 1, values: ["create", "update", "delete", "system"] },
      { name: "domain", type: "select", required: true, maxSelect: 1, values: ["members", "officers", "dues", "ledger", "rules"] },
      { name: "recordId", type: "text", required: true, max: 30 },
      { name: "summary", type: "json", maxSize: 4096 },
      { name: "occurredAt", type: "date", required: true }
    ]
  })
  app.save(auditLogs)

  const directory = app.findCollectionByNameOrId("member_directory")
  directory.listRule = signedIn
  directory.viewRule = signedIn
  directory.viewQuery = `
    SELECT id, name, role, joinedAt
    FROM members
    WHERE active = TRUE
  `
  app.save(directory)

  const duesStatus = app.findCollectionByNameOrId("member_dues_status")
  duesStatus.listRule = signedIn
  duesStatus.viewRule = signedIn
  duesStatus.viewQuery = `
    SELECT
      dp.id AS id,
      dp.period AS periodId,
      m.name AS memberName,
      m.role AS memberRole,
      p.year AS year,
      p.month AS month,
      p.label AS periodLabel,
      p.amount AS expectedAmount,
      COALESCE(dp.status, CASE WHEN dp.paid THEN 'paid' ELSE 'unpaid' END) AS status,
      dp.paidAt AS paidAt
    FROM dues_payments dp
    JOIN members m ON m.id = dp.member
    JOIN dues_periods p ON p.id = dp.period
    WHERE m.active = TRUE
  `
  app.save(duesStatus)

  const memberTransactions = app.findCollectionByNameOrId("member_transactions")
  memberTransactions.listRule = signedIn
  memberTransactions.viewRule = signedIn
  memberTransactions.viewQuery = `
    SELECT id, transactedAt, type, category, amount, balanceAfter
    FROM transactions
    WHERE visibleToMembers = TRUE AND entryStatus = 'confirmed'
  `
  app.save(memberTransactions)

  const chairLedger = new Collection({
    type: "view",
    name: "chair_ledger",
    listRule: `(${admin} || ${chair})`,
    viewRule: `(${admin} || ${chair})`,
    viewQuery: `
      SELECT id, transactedAt, type, category, amount, memo, balanceAfter, confirmedAt
      FROM transactions
      WHERE entryStatus = 'confirmed'
    `
  })
  app.save(chairLedger)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("chair_ledger"))
  app.delete(app.findCollectionByNameOrId("audit_logs"))
  app.delete(app.findCollectionByNameOrId("dues_policies"))
  app.delete(app.findCollectionByNameOrId("officer_terms"))
})
