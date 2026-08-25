/// <reference path="../pb_data/types.d.ts" />

// Encrypted values are longer than their plain-text inputs. Keep the original
// input limits in request hooks and reserve enough storage for ciphertext.
migrate((app) => {
  const members = app.findCollectionByNameOrId("members")
  members.fields.getByName("name").max = 500
  app.save(members)

  const requests = app.findCollectionByNameOrId("signup_requests")
  requests.fields.getByName("name").max = 500
  requests.fields.getByName("phone").max = 500
  app.save(requests)
}, (app) => {
  const members = app.findCollectionByNameOrId("members")
  members.fields.getByName("name").max = 60
  app.save(members)

  const requests = app.findCollectionByNameOrId("signup_requests")
  requests.fields.getByName("name").max = 60
  requests.fields.getByName("phone").max = 30
  app.save(requests)
})
