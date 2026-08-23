/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const rules = app.findCollectionByNameOrId("rules")
  rules.fields.add(new FileField({
    name: "document",
    maxSelect: 1,
    maxSize: 10485760,
    mimeTypes: ["application/pdf"],
    protected: true
  }))
  app.save(rules)
}, (app) => {
  const rules = app.findCollectionByNameOrId("rules")
  rules.fields.removeByName("document")
  app.save(rules)
})
