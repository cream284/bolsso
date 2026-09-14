// Archive accounting data without deleting rows or their relationships.
migrate((app) => {
  for (const name of ["transactions", "bank_imports", "bank_transactions", "member_transactions", "chair_ledger", "dues_policies"]) {
    const collection = app.findCollectionByNameOrId(name)
    for (const rule of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) collection[rule] = null
    for (const field of collection.fields) {
      if (field.type === "file") field.protected = true
    }
    app.save(collection)
  }

  for (const name of ["dues_periods", "dues_payments"]) {
    const collection = app.findCollectionByNameOrId(name)
    const amount = collection.fields.getByName("amount")
    amount.required = false
    amount.hidden = true
    const legacy = collection.fields.getByName(name === "dues_periods" ? "policy" : "note")
    if (legacy) legacy.hidden = true
    app.save(collection)
  }
  const status = app.findCollectionByNameOrId("member_dues_status")
  status.viewQuery = `
    SELECT dp.id AS id, dp.period AS periodId,
      m.name AS memberName, m.role AS memberRole,
      p.year AS year, p.month AS month, p.label AS periodLabel,
      COALESCE(dp.status, CASE WHEN dp.paid THEN 'paid' ELSE 'unpaid' END) AS status,
      dp.paidAt AS paidAt
    FROM dues_payments dp
    JOIN members m ON m.id = dp.member
    JOIN dues_periods p ON p.id = dp.period
    WHERE m.active = TRUE
  `
  app.save(status)

  const audits = app.findCollectionByNameOrId("audit_logs")
  audits.listRule = `(${audits.listRule}) && domain != "ledger"`
  audits.viewRule = audits.listRule
  app.save(audits)
}, (app) => {
  // Restoring financial access requires an explicit review, not an automatic downgrade.
})
