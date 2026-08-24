/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const transactions = app.findCollectionByNameOrId("transactions")
  transactions.fields.add(new BoolField({ name: "adminDelegated" }))
  transactions.fields.add(new TextField({ name: "adminDelegationReason", max: 500 }))
  app.save(transactions)

  const chairLedger = app.findCollectionByNameOrId("chair_ledger")
  chairLedger.viewQuery = `
    SELECT id, transactedAt, type, category, amount, memo, balanceAfter, confirmedAt,
      adminDelegated, adminDelegationReason
    FROM transactions
    WHERE entryStatus = 'confirmed'
  `
  app.save(chairLedger)
}, (app) => {
  const chairLedger = app.findCollectionByNameOrId("chair_ledger")
  chairLedger.viewQuery = `
    SELECT id, transactedAt, type, category, amount, memo, balanceAfter, confirmedAt
    FROM transactions
    WHERE entryStatus = 'confirmed'
  `
  app.save(chairLedger)

  const transactions = app.findCollectionByNameOrId("transactions")
  transactions.fields.removeByName("adminDelegationReason")
  transactions.fields.removeByName("adminDelegated")
  app.save(transactions)
})
