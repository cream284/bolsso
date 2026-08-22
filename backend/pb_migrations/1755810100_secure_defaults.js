/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const settings = app.settings()
  settings.meta.appName = "bolsso"
  settings.rateLimits.enabled = true
  settings.logs.maxDays = 14
  settings.logs.logAuthId = true
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.rateLimits.enabled = false
  app.save(settings)
})
