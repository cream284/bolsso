/// <reference path="../pb_data/types.d.ts" />

const signedIn = '@request.auth.id != "" && @request.auth.active = true && @request.auth.mustChangePassword = false'

migrate((app) => {
  const directory = app.findCollectionByNameOrId("member_directory")
  directory.listRule = signedIn
  directory.viewRule = signedIn
  directory.viewQuery = `
    SELECT id, name, role, isAdmin, joinedAt
    FROM members
    WHERE active = TRUE
  `
  app.save(directory)
}, (app) => {
  const directory = app.findCollectionByNameOrId("member_directory")
  directory.viewQuery = `
    SELECT id, name, role, joinedAt
    FROM members
    WHERE active = TRUE
  `
  app.save(directory)
})
