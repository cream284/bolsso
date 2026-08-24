/// <reference path="../pb_data/types.d.ts" />

const encryptedPrefix = "enc:v1:"

function memberDataKey() {
  const rootKey = $os.getenv("PB_ENCRYPTION_KEY")
  if (!/^[a-f0-9]{32}$/i.test(rootKey)) {
    throw new Error("PB_ENCRYPTION_KEY must be a 32 character secret before member data encryption can start.")
  }
  return $security.sha256("bolsso-member-data-v1:" + rootKey).slice(0, 32)
}

function encryptMemberValue(value, key) {
  const text = String(value || "")
  if (!text || text.startsWith(encryptedPrefix)) return text
  return encryptedPrefix + $security.encrypt(text, key)
}

function decryptMemberValue(value, key) {
  const text = String(value || "")
  if (!text.startsWith(encryptedPrefix)) return text
  return String($security.decrypt(text.slice(encryptedPrefix.length), key))
}

migrate((app) => {
  const key = memberDataKey()
  const members = app.findRecordsByFilter("members", "", "", 0, 0)
  for (const member of members) {
    member.set("name", encryptMemberValue(member.getString("name"), key))
    app.save(member)
  }

  const requests = app.findRecordsByFilter("signup_requests", "", "", 0, 0)
  for (const request of requests) {
    request.set("name", encryptMemberValue(request.getString("name"), key))
    request.set("phone", encryptMemberValue(request.getString("phone"), key))
    app.save(request)
  }
}, (app) => {
  const key = memberDataKey()
  const members = app.findRecordsByFilter("members", "", "", 0, 0)
  for (const member of members) {
    member.set("name", decryptMemberValue(member.getString("name"), key))
    app.save(member)
  }

  const requests = app.findRecordsByFilter("signup_requests", "", "", 0, 0)
  for (const request of requests) {
    request.set("name", decryptMemberValue(request.getString("name"), key))
    request.set("phone", decryptMemberValue(request.getString("phone"), key))
    app.save(request)
  }
})
