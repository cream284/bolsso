/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const members = app.findCollectionByNameOrId("members")
  members.fields.getByName("password").min = 8
  app.save(members)
}, (app) => {
  const members = app.findCollectionByNameOrId("members")
  members.fields.getByName("password").min = 12
  app.save(members)
})
