// Server-side audit trail and automatic dues rows. It stores no passwords or source-file contents.

function registerAudit(names) {
  const handler = function (event) {
    const record = event.record
    let fields = []
    let action = "update"
    try {
      const info = event.requestInfo()
      const body = info.body || {}
      if (info.method === "POST") action = "create"
      if (info.method === "DELETE") action = "delete"
      const excluded = { password: true, passwordConfirm: true, oldPassword: true, evidence: true, document: true, sourceDocument: true, originalFile: true }
      for (const key in body) {
        if (!excluded[key]) fields.push(key)
      }
      fields.sort()
    } catch (error) {
      console.log("audit field summary skipped: " + error)
    }
    event.next()
    try {
      const actor = event.auth
      if (!actor || !record || actor.collection().name !== "members") return
      const name = record.collection().name
      let domain = ""
      if (name === "members") domain = "members"
      if (name === "officer_terms") domain = "officers"
      if (name === "dues_policies" || name === "dues_periods" || name === "dues_payments") domain = "dues"
      if (name === "transactions") domain = "ledger"
      if (name === "rules") domain = "rules"
      if (!domain) return
      const logs = event.app.findCollectionByNameOrId("audit_logs")
      const audit = new Record(logs)
      audit.set("actor", actor.id)
      audit.set("action", action)
      audit.set("domain", domain)
      audit.set("recordId", record.id)
      audit.set("summary", { changedFields: fields })
      audit.set("occurredAt", new Date().toISOString())
      event.app.save(audit)
    } catch (error) {
      console.log("audit skipped: " + error)
    }
  }
  onRecordCreateRequest(handler, ...names)
  onRecordUpdateRequest(handler, ...names)
  onRecordDeleteRequest(handler, ...names)
}

const auditedCollections = ["members", "officer_terms", "dues_policies", "dues_periods", "dues_payments", "transactions", "rules"]
registerAudit(auditedCollections)

function unpublishOlderRuleRevisions(event) {
  event.next()
  if (!event.record.getBool("published")) return
  const olderPublished = event.app.findRecordsByFilter(
    "rules",
    "published = true && id != {:id}",
    "",
    0,
    0,
    { id: event.record.id }
  )
  for (const record of olderPublished) {
    record.set("published", false)
    event.app.save(record)
  }
}

onRecordAfterCreateSuccess(unpublishOlderRuleRevisions, "rules")
onRecordAfterUpdateSuccess(unpublishOlderRuleRevisions, "rules")

onRecordCreateRequest(function (event) {
  event.record.set("createdBy", event.auth.id)
  event.record.set("entryStatus", "draft")
  event.next()
}, "transactions")

onRecordUpdateRequest(function (event) {
  if (event.record.get("entryStatus") === "confirmed") {
    event.record.set("confirmedBy", event.auth.id)
    event.record.set("confirmedAt", new Date().toISOString())
  }
  event.next()
}, "transactions")

onRecordAfterCreateSuccess(function (event) {
  event.next()
  const period = event.record
  const members = event.app.findRecordsByFilter("members", "active = true", "name", 500, 0)
  const payments = event.app.findCollectionByNameOrId("dues_payments")
  event.app.runInTransaction(function (txApp) {
    for (const member of members) {
      const payment = new Record(payments)
      payment.set("period", period.id)
      payment.set("member", member.id)
      payment.set("amount", period.get("amount"))
      payment.set("paid", false)
      payment.set("status", "unpaid")
      payment.set("paymentPlan", period.get("billingType"))
      txApp.save(payment)
    }
  })
}, "dues_periods")
