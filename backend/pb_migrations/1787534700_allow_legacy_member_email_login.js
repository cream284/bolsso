/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const members = app.findCollectionByNameOrId("members")
  // Existing members were created before loginId was introduced. Keep their
  // original email identity available while new members continue using loginId.
  members.passwordAuth = {
    enabled: true,
    identityFields: ["loginId", "email"]
  }
  app.save(members)
}, (app) => {
  const members = app.findCollectionByNameOrId("members")
  members.passwordAuth = {
    enabled: true,
    identityFields: ["loginId"]
  }
  app.save(members)
})
