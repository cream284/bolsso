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
      const excluded = { password: true, passwordConfirm: true, oldPassword: true, evidence: true, document: true, sourceDocument: true, originalFile: true, phone: true }
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
      if (name === "members" || name === "signup_requests") domain = "members"
      if (name === "officer_terms") domain = "officers"
      if (name === "dues_policies" || name === "dues_periods" || name === "dues_payments") domain = "dues"
      if (name === "transactions") domain = "ledger"
      if (name === "rules") domain = "rules"
      if (name === "events" || name === "event_attendees") domain = "events"
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

const auditedCollections = ["members", "signup_requests", "officer_terms", "dues_policies", "dues_periods", "dues_payments", "transactions", "rules", "events", "event_attendees"]
registerAudit(auditedCollections)

function normalizeSignupPhone(phone) {
  const normalized = String(phone || "").trim()
  const digits = normalized.replace(/\D/g, "")
  if (!/^[0-9+()\-\s]+$/.test(normalized) || digits.length < 8 || digits.length > 15) {
    throw new BadRequestError("휴대폰번호 형식을 확인해 주세요.")
  }
  return normalized
}

function normalizeSignupLoginId(loginId) {
  const normalized = String(loginId || "").trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{3,39}$/.test(normalized)) {
    throw new BadRequestError("아이디는 영문 소문자·숫자와 . _ - 만 사용할 수 있습니다.")
  }
  return normalized
}

onRecordCreateRequest(function (event) {
  const name = event.record.getString("name").trim()
  if (name.length < 2) throw new BadRequestError("이름을 2자 이상 입력해 주세요.")
  const phone = normalizeSignupPhone(event.record.getString("phone"))
  const loginId = normalizeSignupLoginId(event.record.getString("loginId"))
  const existingMember = event.app.findRecordsByFilter("members", "loginId = {:loginId}", "", 1, 0, { loginId })
  if (existingMember.length) throw new BadRequestError("가입 요청을 접수하지 못했습니다.")

  event.record.set("name", name)
  event.record.set("phone", phone)
  event.record.set("loginId", loginId)
  event.record.set("status", "pending")
  event.record.set("requestedAt", new Date().toISOString())
  event.record.set("reviewedAt", null)
  event.record.set("reviewedBy", null)
  event.next()
}, "signup_requests")

onRecordUpdateRequest(function (event) {
  const original = event.record.original()
  if (original.getString("status") !== "pending") {
    throw new BadRequestError("처리 완료된 가입 요청은 변경할 수 없습니다.")
  }
  const status = event.record.getString("status")
  if (status !== "approved" && status !== "rejected") {
    throw new BadRequestError("가입 요청은 승인 또는 거절만 할 수 있습니다.")
  }
  event.record.set("phone", "")
  event.record.set("reviewedAt", new Date().toISOString())
  event.record.set("reviewedBy", event.auth.id)
  event.next()
}, "signup_requests")

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

function isAdminFinanceDelegate(actor) {
  return actor && (actor.getBool("isAdmin") || actor.getString("role") === "admin") && actor.getString("role") !== "treasurer"
}

function requireAdminFinanceDelegation(event) {
  if (!isAdminFinanceDelegate(event.auth)) return
  const reason = event.record.getString("adminDelegationReason").trim()
  if (reason.length < 5) throw new BadRequestError("관리자 재정 대행 사유를 5자 이상 입력해 주세요.")
  event.record.set("adminDelegated", true)
  event.record.set("adminDelegationReason", reason)
}

onRecordCreateRequest(function (event) {
  requireAdminFinanceDelegation(event)
  if (!isAdminFinanceDelegate(event.auth)) {
    event.record.set("adminDelegated", false)
    event.record.set("adminDelegationReason", "")
  }
  event.next()
}, "transactions")

onRecordUpdateRequest(function (event) {
  if (event.record.original().getString("entryStatus") === "confirmed") {
    throw new BadRequestError("확정 장부는 수정할 수 없습니다. 정정 거래를 새로 등록해 주세요.")
  }
  requireAdminFinanceDelegation(event)
  if (!isAdminFinanceDelegate(event.auth)) {
    event.record.set("adminDelegated", event.record.original().getBool("adminDelegated"))
    event.record.set("adminDelegationReason", event.record.original().getString("adminDelegationReason"))
  }
  event.next()
}, "transactions")

onRecordDeleteRequest(function (event) {
  if (event.record.getString("entryStatus") === "confirmed") {
    throw new BadRequestError("확정 장부는 삭제할 수 없습니다. 정정 거래를 새로 등록해 주세요.")
  }
  event.next()
}, "transactions")

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
