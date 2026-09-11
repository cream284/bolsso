/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Do not silently choose between conflicting existing publications.
  const published = app.findRecordsByFilter("rules", "published = true", "", 2, 0)
  if (published.length > 1) {
    throw new Error("Resolve multiple published rules before applying this migration.")
  }
  const rules = app.findCollectionByNameOrId("rules")
  rules.addIndex("idx_rules_single_published", true, "published", "published = 1")
  app.save(rules)
  // The switch and the write share the same SQLite statement transaction.
  // A failed insert/update restores the previous publication automatically.
  for (const operation of ["INSERT", "UPDATE"]) {
    app.db().newQuery(`
      CREATE TRIGGER bolsso_rules_publish_${operation.toLowerCase()}
      BEFORE ${operation} ON rules
      WHEN NEW.published = 1
      BEGIN
        UPDATE rules SET published = 0 WHERE published = 1 AND id != NEW.id;
      END
    `).execute()
  }
}, (app) => {
  app.db().newQuery("DROP TRIGGER IF EXISTS bolsso_rules_publish_insert").execute()
  app.db().newQuery("DROP TRIGGER IF EXISTS bolsso_rules_publish_update").execute()
  const rules = app.findCollectionByNameOrId("rules")
  rules.removeIndex("idx_rules_single_published")
  app.save(rules)
})
