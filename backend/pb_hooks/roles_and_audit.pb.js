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
      if (name === "transactions" || name === "bank_imports" || name === "bank_transactions") domain = "ledger"
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

const auditedCollections = ["members", "signup_requests", "officer_terms", "dues_policies", "dues_periods", "dues_payments", "transactions", "bank_imports", "bank_transactions", "rules", "events", "event_attendees"]
registerAudit(auditedCollections)

function stampRuleSavedAt(event) {
  event.record.set("savedAt", new Date().toISOString())
  event.next()
}

onRecordCreateRequest(stampRuleSavedAt, "rules")
onRecordUpdateRequest(stampRuleSavedAt, "rules")

onRecordCreateRequest(function (event) {
  // PocketBase request hooks may run without top-level helper bindings.
  // Keep signup-only normalization in the callback execution scope.
  const normalizePhoneForSignup = function (value) {
    const digits = String(value || "").replace(/\D/g, "")
    if (digits.length < 8 || digits.length > 15) {
      throw new BadRequestError("휴대폰번호 형식을 확인해 주세요.")
    }
    return digits
  }
  const normalizeLoginIdForSignup = function (value) {
    const normalized = String(value || "").trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{3,39}$/.test(normalized)) {
      throw new BadRequestError("아이디는 영문 소문자·숫자와 . _ - 만 사용할 수 있습니다.")
    }
    return normalized
  }

  const name = event.record.getString("name").trim()
  if (name.length < 2 || name.length > 60 || /^enc:/i.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new BadRequestError("이름은 2~60자의 일반 텍스트로 입력해 주세요.")
  }
  const phone = normalizePhoneForSignup(event.record.getString("phone"))
  const loginId = normalizeLoginIdForSignup(event.record.getString("loginId"))
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

function encryptMemberRecord(event) {
  const personal = require(__hooks + "/personal-data.js")
  const info = event.requestInfo()
  const body = info.body || {}
  const collection = event.record.collection().name
  // An external value is plaintext, never a pre-trusted stored ciphertext.
  // An omitted field on PATCH remains unchanged, avoiding double encryption.
  if (info.method === "POST" || Object.prototype.hasOwnProperty.call(body, "name")) {
    event.record.set("name", personal.encrypt(personal.validateName(event.record.getString("name"))))
  }
  if (collection === "signup_requests" && info.method === "POST") {
    event.record.set("phone", personal.encrypt(event.record.getString("phone")))
  }
  event.next()
}

onRecordCreateRequest(encryptMemberRecord, "members", "signup_requests")
onRecordUpdateRequest(encryptMemberRecord, "members", "signup_requests")

onRecordUpdateRequest(function (event) {
  const original = event.record.original()
  const wasAdmin = original.getBool("active") && (original.getBool("isAdmin") || original.getString("role") === "admin")
  const staysAdmin = event.record.getBool("active") && (event.record.getBool("isAdmin") || event.record.getString("role") === "admin")
  if (wasAdmin && !staysAdmin) {
    const others = event.app.findRecordsByFilter("members", "id != {:id} && active = true && (isAdmin = true || role = 'admin')", "", 1, 0, { id: event.record.id })
    if (!others.length) throw new BadRequestError("마지막 활성 관리자는 권한 해제하거나 비활성화할 수 없습니다. 다른 관리자를 먼저 지정해 주세요.")
  }
  if (original.getBool("active") && !event.record.getBool("active")) {
    event.record.set("deactivatedAt", new Date().toISOString())
  } else if (!original.getBool("active") && event.record.getBool("active")) {
    event.record.set("deactivatedAt", null)
  }
  event.next()
}, "members")

routerAdd("POST", "/api/bolsso/signup-requests/{id}/approve", function (event) {
  const actor = event.auth
  const isAdmin = actor && actor.collection().name === "members" && actor.getBool("active") &&
    !actor.getBool("mustChangePassword") && (actor.getBool("isAdmin") || actor.getString("role") === "admin")
  if (!isAdmin) throw new ForbiddenError("가입 승인 권한이 없습니다.")

  const requestId = event.request.pathValue("id")
  const body = event.requestInfo().body || {}
  const password = String(body.password || "")
  if (password.length < 8) throw new BadRequestError("임시 비밀번호는 8자 이상이어야 합니다.")

  let memberId = ""
  event.app.runInTransaction(function (txApp) {
    const request = txApp.findRecordById("signup_requests", requestId)
    if (request.getString("status") !== "pending") {
      throw new BadRequestError("이미 처리된 가입 요청입니다.")
    }

    const loginId = request.getString("loginId")
    const duplicate = txApp.findRecordsByFilter("members", "loginId = {:loginId}", "", 1, 0, { loginId })
    if (duplicate.length) throw new BadRequestError("이미 사용 중인 로그인 ID입니다.")

    const personal = require(__hooks + "/personal-data.js")
    let plainName
    try {
      plainName = personal.validateName(personal.decrypt(request.getString("name")))
      if (!/^[0-9]{8,15}$/.test(personal.decrypt(request.getString("phone")))) throw new Error("Invalid stored phone")
    } catch (_) {
      throw new BadRequestError("가입 요청 정보를 확인할 수 없습니다. 해당 요청을 거절한 뒤 다시 신청받아 주세요.")
    }
    const storedName = personal.encrypt(plainName)

    const members = txApp.findCollectionByNameOrId("members")
    const member = new Record(members)
    member.set("name", storedName)
    member.set("loginId", loginId)
    member.set("password", password)
    member.set("passwordConfirm", password)
    member.set("role", "member")
    member.set("isAdmin", false)
    member.set("active", true)
    member.set("mustChangePassword", true)
    member.set("joinedAt", new Date().toISOString())
    txApp.save(member)
    memberId = member.id

    const openPeriods = txApp.findRecordsByFilter("dues_periods", "status = 'open'", "year,month", 500, 0)
    const payments = txApp.findCollectionByNameOrId("dues_payments")
    for (const period of openPeriods) {
      const existing = txApp.findRecordsByFilter(
        "dues_payments",
        "period = {:period} && member = {:member}",
        "",
        1,
        0,
        { period: period.id, member: member.id }
      )
      if (existing.length) continue
      const payment = new Record(payments)
      payment.set("period", period.id)
      payment.set("member", member.id)
      payment.set("amount", period.get("amount"))
      payment.set("paid", false)
      payment.set("status", "unpaid")
      payment.set("paymentPlan", period.get("billingType"))
      txApp.save(payment)
    }

    txApp.delete(request)

    const logs = txApp.findCollectionByNameOrId("audit_logs")
    const memberAudit = new Record(logs)
    memberAudit.set("actor", actor.id)
    memberAudit.set("action", "create")
    memberAudit.set("domain", "members")
    memberAudit.set("recordId", member.id)
    memberAudit.set("summary", { changedFields: ["active", "joinedAt", "loginId", "mustChangePassword", "name", "role"] })
    memberAudit.set("occurredAt", new Date().toISOString())
    txApp.save(memberAudit)
  })

  return event.json(200, { memberId })
}, $apis.requireAuth("members"))

routerAdd("POST", "/api/bolsso/signup-requests/{id}/reject", function (event) {
  const actor = event.auth
  const isAdmin = actor && actor.collection().name === "members" && actor.getBool("active") &&
    !actor.getBool("mustChangePassword") && (actor.getBool("isAdmin") || actor.getString("role") === "admin")
  if (!isAdmin) throw new ForbiddenError("가입 거절 권한이 없습니다.")

  const requestId = event.request.pathValue("id")
  event.app.runInTransaction(function (txApp) {
    const request = txApp.findRecordById("signup_requests", requestId)
    if (request.getString("status") !== "pending") throw new BadRequestError("이미 처리된 가입 요청입니다.")
    txApp.delete(request)

    const logs = txApp.findCollectionByNameOrId("audit_logs")
    const audit = new Record(logs)
    audit.set("actor", actor.id)
    audit.set("action", "delete")
    audit.set("domain", "members")
    audit.set("recordId", requestId)
    audit.set("summary", { changedFields: ["signupRequestRejected"] })
    audit.set("occurredAt", new Date().toISOString())
    txApp.save(audit)
  })
  return event.json(200, { rejected: true })
}, $apis.requireAuth("members"))

routerAdd("POST", "/api/bolsso/members/{id}/anonymize", function (event) {
  const actor = event.auth
  const isAdmin = actor && actor.collection().name === "members" && actor.getBool("active") &&
    !actor.getBool("mustChangePassword") && (actor.getBool("isAdmin") || actor.getString("role") === "admin")
  if (!isAdmin) throw new ForbiddenError("개인정보 파기 권한이 없습니다.")

  const memberId = event.request.pathValue("id")
  if (memberId === actor.id) throw new BadRequestError("현재 로그인한 관리자 계정은 파기할 수 없습니다.")
  event.app.runInTransaction(function (txApp) {
    const member = txApp.findRecordById("members", memberId)
    if (member.getBool("active")) throw new BadRequestError("회원을 먼저 비활성으로 변경해 주세요.")
    if (member.getString("anonymizedAt")) throw new BadRequestError("이미 개인정보가 파기된 회원입니다.")

    const rootKey = $os.getenv("PB_ENCRYPTION_KEY")
    if (!/^[a-f0-9]{32}$/i.test(rootKey)) throw new InternalServerError("회원정보 암호화 키가 준비되지 않았습니다.")
    const key = $security.sha256("bolsso-member-data-v1:" + rootKey).slice(0, 32)
    const replacementPassword = $security.sha256("withdrawn-password:" + rootKey + ":" + member.id + ":" + new Date().toISOString())
    const now = new Date().toISOString()
    member.set("name", "enc:v1:" + $security.encrypt("탈퇴 회원", key))
    member.set("loginId", "withdrawn." + member.id)
    member.set("email", "")
    member.set("emailVisibility", false)
    member.set("verified", false)
    member.set("password", replacementPassword)
    member.set("passwordConfirm", replacementPassword)
    member.set("role", "member")
    member.set("isAdmin", false)
    member.set("active", false)
    member.set("mustChangePassword", true)
    if (!member.getString("deactivatedAt")) member.set("deactivatedAt", now)
    member.set("anonymizedAt", now)
    txApp.save(member)

    const logs = txApp.findCollectionByNameOrId("audit_logs")
    const audit = new Record(logs)
    audit.set("actor", actor.id)
    audit.set("action", "update")
    audit.set("domain", "members")
    audit.set("recordId", member.id)
    audit.set("summary", { changedFields: ["active", "anonymizedAt", "email", "isAdmin", "loginId", "name", "role"] })
    audit.set("occurredAt", now)
    txApp.save(audit)
  })
  return event.json(200, { anonymized: true })
}, $apis.requireAuth("members"))

onRecordEnrich(function (event) {
  // PocketBase can execute enrich callbacks in a scope that does not retain
  // top-level helper bindings. Keep response-only helpers inside the callback.
  const decryptForEnrich = function (value) {
    const text = String(value || "")
    if (!text.startsWith("enc:v1:")) return text
    const rootKey = $os.getenv("PB_ENCRYPTION_KEY")
    if (!/^[a-f0-9]{32}$/i.test(rootKey)) {
      throw new InternalServerError("회원정보 암호화 키가 준비되지 않았습니다.")
    }
    const key = $security.sha256("bolsso-member-data-v1:" + rootKey).slice(0, 32)
    try {
      return String($security.decrypt(text.slice("enc:v1:".length), key))
    } catch (_) {
      // A damaged historical value must not hide every other record in a list.
      // This is response-only data; the stored value remains available for recovery.
      event.record.withCustomData(true)
      event.record.set("personalDataError", true)
      return "정보 확인 필요"
    }
  }
  const canReadForEnrich = function (auth) {
    return auth && auth.collection().name === "members" && auth.getBool("active") && !auth.getBool("mustChangePassword")
  }
  const isAdminForEnrich = function (auth) {
    return canReadForEnrich(auth) && (auth.getBool("isAdmin") || auth.getString("role") === "admin")
  }

  const collection = event.record.collection().name
  const auth = event.requestInfo.auth
  if (collection === "members") {
    // Auth responses enrich before requestInfo.auth is available, but direct record access is already rule protected.
    event.record.set("name", decryptForEnrich(event.record.getString("name")))
  } else if (collection === "member_directory") {
    if (canReadForEnrich(auth)) event.record.set("name", decryptForEnrich(event.record.getString("name")))
    else event.record.hide("name")
  } else if (collection === "member_dues_status") {
    if (canReadForEnrich(auth)) event.record.set("memberName", decryptForEnrich(event.record.getString("memberName")))
    else event.record.hide("memberName")
  } else if (collection === "signup_requests") {
    if (isAdminForEnrich(auth)) {
      event.record.set("name", decryptForEnrich(event.record.getString("name")))
      event.record.set("phone", decryptForEnrich(event.record.getString("phone")))
    } else {
      event.record.hide("name")
      event.record.hide("phone")
      event.record.hide("loginId")
    }
  }
  event.next()
}, "members", "member_directory", "member_dues_status", "signup_requests")

// Published-rule switching is atomic in the database (see its migration).

onRecordCreateRequest(function (event) {
  const finance = require(__hooks + "/finance.js")
  finance.requireDelegation(event)
  if (!finance.isDelegate(event.auth)) {
    event.record.set("adminDelegated", false)
    event.record.set("adminDelegationReason", "")
  }
  event.next()
}, "transactions")

onRecordUpdateRequest(function (event) {
  if (event.record.original().getString("entryStatus") === "confirmed") {
    throw new BadRequestError("확정 장부는 수정할 수 없습니다. 정정 거래를 새로 등록해 주세요.")
  }
  const finance = require(__hooks + "/finance.js")
  finance.requireDelegation(event)
  if (!finance.isDelegate(event.auth)) {
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
      const existing = txApp.findRecordsByFilter(
        "dues_payments",
        "period = {:period} && member = {:member}",
        "",
        1,
        0,
        { period: period.id, member: member.id }
      )
      if (existing.length) continue
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

function ensureOpenPeriodPaymentsForMember(event) {
  event.next()
  const member = event.record
  if (!member.getBool("active")) return
  const periods = event.app.findRecordsByFilter("dues_periods", "status = 'open'", "year,month", 500, 0)
  const payments = event.app.findCollectionByNameOrId("dues_payments")
  event.app.runInTransaction(function (txApp) {
    for (const period of periods) {
      const existing = txApp.findRecordsByFilter(
        "dues_payments",
        "period = {:period} && member = {:member}",
        "",
        1,
        0,
        { period: period.id, member: member.id }
      )
      if (existing.length) continue
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
}

onRecordAfterCreateSuccess(ensureOpenPeriodPaymentsForMember, "members")
onRecordAfterUpdateSuccess(ensureOpenPeriodPaymentsForMember, "members")

onRecordAfterUpdateSuccess(function (event) {
  event.next()
  const period = event.record
  const payments = event.app.findRecordsByFilter(
    "dues_payments",
    "period = {:period} && status = 'unpaid'",
    "",
    500,
    0,
    { period: period.id }
  )
  event.app.runInTransaction(function (txApp) {
    for (const payment of payments) {
      payment.set("amount", period.get("amount"))
      payment.set("paymentPlan", period.get("billingType"))
      txApp.save(payment)
    }
  })
}, "dues_periods")
