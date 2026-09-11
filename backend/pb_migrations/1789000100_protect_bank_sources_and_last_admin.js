/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const imports = app.findCollectionByNameOrId("bank_imports")
  imports.fields.getByName("originalFile").protected = true
  app.save(imports)

  // Database guards also cover concurrent requests and internal writes.
  app.db().newQuery(`
    CREATE TRIGGER bolsso_keep_last_admin_update BEFORE UPDATE ON members
    WHEN OLD.active = 1 AND (OLD.isAdmin = 1 OR OLD.role = 'admin')
      AND NOT (NEW.active = 1 AND (NEW.isAdmin = 1 OR NEW.role = 'admin'))
      AND NOT EXISTS (SELECT 1 FROM members WHERE id != OLD.id AND active = 1 AND (isAdmin = 1 OR role = 'admin'))
    BEGIN SELECT RAISE(ABORT, 'At least one active administrator is required'); END
  `).execute()
  app.db().newQuery(`
    CREATE TRIGGER bolsso_keep_last_admin_delete BEFORE DELETE ON members
    WHEN OLD.active = 1 AND (OLD.isAdmin = 1 OR OLD.role = 'admin')
      AND NOT EXISTS (SELECT 1 FROM members WHERE id != OLD.id AND active = 1 AND (isAdmin = 1 OR role = 'admin'))
    BEGIN SELECT RAISE(ABORT, 'At least one active administrator is required'); END
  `).execute()
}, (app) => {
  app.db().newQuery("DROP TRIGGER IF EXISTS bolsso_keep_last_admin_update").execute()
  app.db().newQuery("DROP TRIGGER IF EXISTS bolsso_keep_last_admin_delete").execute()
  // File protection is intentionally retained even on a schema rollback.
})
