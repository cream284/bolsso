function isDelegate(actor) {
  return actor && (actor.getBool("isAdmin") || actor.getString("role") === "admin") && actor.getString("role") !== "treasurer"
}

module.exports = {
  isDelegate,
  requireDelegation(event) {
    if (!isDelegate(event.auth)) return
    const reason = event.record.getString("adminDelegationReason").trim()
    if (reason.length < 5) throw new BadRequestError("관리자 재정 대행 사유를 5자 이상 입력해 주세요.")
    event.record.set("adminDelegated", true)
    event.record.set("adminDelegationReason", reason)
  }
}
