// Also covers the private admin port; the public proxy is not the only write path.
routerUse(function (event) {
  if (["GET", "HEAD", "OPTIONS"].indexOf(event.request.method) !== -1) return event.next()
  let maintenance = false
  try { $os.stat(event.app.dataDir() + "/.deployment-maintenance"); maintenance = true } catch (_) {}
  if (maintenance) return event.json(503, { code: 503, message: "서비스 점검 중입니다. 잠시 후 다시 시도해 주세요." })
  return event.next()
})
