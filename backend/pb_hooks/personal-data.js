const prefix = "enc:v1:"

function key() {
  const root = $os.getenv("PB_ENCRYPTION_KEY")
  if (!/^[a-f0-9]{32}$/i.test(root)) throw new InternalServerError("회원정보 암호화 키가 준비되지 않았습니다.")
  return $security.sha256("bolsso-member-data-v1:" + root).slice(0, 32)
}

function validateName(value) {
  const text = String(value || "").trim()
  if (text.length < 2 || text.length > 60 || /^enc:/i.test(text) || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new BadRequestError("이름은 2~60자의 일반 텍스트로 입력해 주세요.")
  }
  return text
}

function encrypt(value) {
  const text = String(value || "")
  return text ? prefix + $security.encrypt(text, key()) : ""
}

function decrypt(value) {
  const text = String(value || "")
  if (!text.startsWith(prefix)) return text
  return String($security.decrypt(text.slice(prefix.length), key()))
}

module.exports = { validateName, encrypt, decrypt }
