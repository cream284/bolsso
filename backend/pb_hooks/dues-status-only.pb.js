onRecordCreateRequest(function (event) {
  const amount = event.record.collection().fields.getByName("amount")
  const body = event.requestInfo().body || {}
  if (amount.hidden && (Object.prototype.hasOwnProperty.call(body, "amount") || Object.prototype.hasOwnProperty.call(body, "policy"))) {
    throw new BadRequestError("회비는 금액 없이 납부 상태만 관리합니다. 화면을 새로고침해 주세요.")
  }
  event.next()
}, "dues_periods", "dues_payments")

onRecordUpdateRequest(function (event) {
  const amount = event.record.collection().fields.getByName("amount")
  const body = event.requestInfo().body || {}
  const original = event.record.original()
  const changedAmount = event.record.get("amount") !== original.get("amount")
  const changedPolicy = event.record.collection().name === "dues_periods" && event.record.getString("policy") !== original.getString("policy")
  if (amount.hidden && (changedAmount || changedPolicy || Object.prototype.hasOwnProperty.call(body, "amount") || Object.prototype.hasOwnProperty.call(body, "policy"))) {
    throw new BadRequestError("기존 금액 자료는 보관 전용입니다. 납부 상태만 수정해 주세요.")
  }
  event.next()
}, "dues_periods", "dues_payments")
