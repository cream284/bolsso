/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const signedIn = '@request.auth.id != "" && @request.auth.active = true && @request.auth.mustChangePassword = false'
  const admin = `${signedIn} && (@request.auth.isAdmin = true || @request.auth.role = "admin")`
  const chair = `${signedIn} && @request.auth.role = "chair"`
  const eventManager = `(${admin} || ${chair})`
  const members = app.findCollectionByNameOrId("members")

  const events = new Collection({
    type: "base",
    name: "events",
    listRule: signedIn,
    viewRule: signedIn,
    createRule: eventManager,
    updateRule: eventManager,
    deleteRule: eventManager,
    fields: [
      { name: "title", type: "text", required: true, max: 120 },
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["regular_meeting", "travel", "special_meeting"] },
      { name: "scheduledAt", type: "date", required: true },
      { name: "location", type: "text", max: 200 },
      { name: "note", type: "text", max: 1000 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["planned", "completed", "cancelled"] }
    ],
    indexes: ["CREATE INDEX idx_events_scheduled_at ON events (scheduledAt)"]
  })
  app.save(events)

  const attendees = new Collection({
    type: "base",
    name: "event_attendees",
    listRule: signedIn,
    viewRule: signedIn,
    createRule: eventManager,
    updateRule: eventManager,
    deleteRule: eventManager,
    fields: [
      { name: "event", type: "relation", required: true, maxSelect: 1, collectionId: events.id, cascadeDelete: false },
      { name: "member", type: "relation", required: true, maxSelect: 1, collectionId: members.id, cascadeDelete: false },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["planned", "attended", "absent"] }
    ],
    indexes: [
      "CREATE INDEX idx_event_attendees_event ON event_attendees (event)",
      "CREATE UNIQUE INDEX idx_event_attendees_unique ON event_attendees (event, member)"
    ]
  })
  app.save(attendees)

  const auditLogs = app.findCollectionByNameOrId("audit_logs")
  auditLogs.fields.getByName("domain").values = ["members", "officers", "dues", "ledger", "rules", "events"]
  app.save(auditLogs)
}, (app) => {
  const auditLogs = app.findCollectionByNameOrId("audit_logs")
  auditLogs.fields.getByName("domain").values = ["members", "officers", "dues", "ledger", "rules"]
  app.save(auditLogs)
  app.delete(app.findCollectionByNameOrId("event_attendees"))
  app.delete(app.findCollectionByNameOrId("events"))
})
