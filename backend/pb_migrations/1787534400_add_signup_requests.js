/// <reference path="../pb_data/types.d.ts" />

const signedIn = '@request.auth.id != "" && @request.auth.active = true && @request.auth.mustChangePassword = false'
const admin = `${signedIn} && (@request.auth.isAdmin = true || @request.auth.role = "admin")`

migrate((app) => {
  const members = app.findCollectionByNameOrId("members")
  const requests = new Collection({
    type: "base",
    name: "signup_requests",
    listRule: admin,
    viewRule: admin,
    createRule: '@request.auth.id = ""',
    updateRule: admin,
    deleteRule: admin,
    fields: [
      { name: "name", type: "text", required: true, max: 60 },
      // The hook requires a number for a new request, then clears it after a decision.
      { name: "phone", type: "text", max: 30 },
      { name: "loginId", type: "text", required: true, max: 40 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "approved", "rejected"] },
      { name: "requestedAt", type: "date", required: true },
      { name: "reviewedAt", type: "date" },
      { name: "reviewedBy", type: "relation", maxSelect: 1, collectionId: members.id, cascadeDelete: false }
    ],
    indexes: [
      "CREATE INDEX idx_signup_requests_status_requested ON signup_requests (status, requestedAt)",
      "CREATE UNIQUE INDEX idx_signup_requests_pending_login ON signup_requests (loginId) WHERE status = 'pending'"
    ]
  })
  app.save(requests)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("signup_requests"))
})
