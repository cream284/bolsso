/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const rules = app.findCollectionByNameOrId("rules")
  rules.fields.add(new DateField({ name: "savedAt" }))
  rules.addIndex("idx_rules_saved_at", false, "savedAt", "")
  app.save(rules)

  const records = app.findRecordsByFilter("rules", "", "", 0, 0)
  for (const record of records) {
    const audits = app.findRecordsByFilter(
      "audit_logs",
      'domain = "rules" && recordId = {:recordId}',
      "-occurredAt",
      1,
      0,
      { recordId: record.id }
    )
    const savedAt = audits.length
      ? audits[0].getString("occurredAt")
      : record.getString("effectiveDate") || new Date().toISOString()
    record.set("savedAt", savedAt)
    app.save(record)
  }
}, (app) => {
  const rules = app.findCollectionByNameOrId("rules")
  rules.removeIndex("idx_rules_saved_at")
  rules.fields.removeByName("savedAt")
  app.save(rules)
})
