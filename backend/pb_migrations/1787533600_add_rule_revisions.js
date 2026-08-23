/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const rules = app.findCollectionByNameOrId("rules")

  rules.fields.add(new TextField({ name: "contentMarkdown", max: 50000 }))
  rules.fields.add(new TextField({ name: "revisionNote", max: 500 }))
  rules.fields.add(new RelationField({
    name: "previousRevision",
    collectionId: rules.id,
    maxSelect: 1,
    cascadeDelete: false
  }))
  rules.fields.add(new FileField({
    name: "sourceDocument",
    maxSelect: 1,
    maxSize: 10485760,
    mimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/markdown",
      "text/plain",
      "text/html",
      "text/csv"
    ],
    protected: true
  }))
  rules.addIndex("idx_rules_previous_revision", false, "previousRevision", "")
  app.save(rules)

  const existing = app.findRecordsByFilter("rules", "", "", 0, 0)
  for (const record of existing) {
    if (!record.getString("contentMarkdown")) {
      record.set("contentMarkdown", record.getString("content"))
      app.save(record)
    }
  }
}, (app) => {
  const rules = app.findCollectionByNameOrId("rules")
  rules.removeIndex("idx_rules_previous_revision")
  rules.fields.removeByName("sourceDocument")
  rules.fields.removeByName("previousRevision")
  rules.fields.removeByName("revisionNote")
  rules.fields.removeByName("contentMarkdown")
  app.save(rules)
})
