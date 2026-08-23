/// <reference path="../pb_data/types.d.ts" />

const activeMember = '@request.auth.id != "" && @request.auth.active = true'
const operator = `${activeMember} && (@request.auth.role = "operator" || @request.auth.role = "admin")`
const selfSafeUpdate = [
  'id = @request.auth.id',
  '@request.body.loginId:isset = false',
  '@request.body.email:isset = false',
  '@request.body.emailVisibility:isset = false',
  '@request.body.verified:isset = false',
  '@request.body.name:isset = false',
  '@request.body.role:isset = false',
  '@request.body.active:isset = false',
  '@request.body.joinedAt:isset = false'
].join(' && ')

migrate((app) => {
  const members = app.findCollectionByNameOrId("members")

  members.fields.add(new TextField({
    name: "loginId",
    required: true,
    min: 4,
    max: 40,
    pattern: "^[a-z0-9][a-z0-9._-]{3,39}$"
  }))
  members.addIndex("idx_members_login_id", true, "loginId", "")
  members.listRule = operator
  members.viewRule = `id = @request.auth.id || ${operator}`
  members.updateRule = `${operator} || (${selfSafeUpdate})`
  members.deleteRule = operator
  members.manageRule = operator
  members.authRule = "active = true"
  members.passwordAuth = {
    enabled: true,
    identityFields: ["loginId"]
  }
  members.authToken.duration = 43200
  members.fields.getByName("password").min = 12
  members.fields.getByName("email").required = false
  members.fields.getByName("email").hidden = true
  app.save(members)

  const payments = app.findCollectionByNameOrId("dues_payments")
  payments.listRule = operator
  payments.viewRule = operator
  app.save(payments)

  const directory = new Collection({
    type: "view",
    name: "member_directory",
    listRule: activeMember,
    viewRule: activeMember,
    viewQuery: `
      SELECT
        id,
        name,
        role,
        joinedAt
      FROM members
      WHERE active = TRUE
    `
  })
  app.save(directory)

  const duesStatus = new Collection({
    type: "view",
    name: "member_dues_status",
    listRule: activeMember,
    viewRule: activeMember,
    viewQuery: `
      SELECT
        dp.id AS id,
        dp.period AS periodId,
        m.name AS memberName,
        m.role AS memberRole,
        p.year AS year,
        p.month AS month,
        p.label AS periodLabel,
        p.amount AS expectedAmount,
        dp.paid AS paid,
        dp.paidAt AS paidAt
      FROM dues_payments dp
      JOIN members m ON m.id = dp.member
      JOIN dues_periods p ON p.id = dp.period
      WHERE m.active = TRUE
    `
  })
  app.save(duesStatus)
}, (app) => {
  for (const name of ["member_dues_status", "member_directory"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }

  const payments = app.findCollectionByNameOrId("dues_payments")
  payments.listRule = activeMember
  payments.viewRule = activeMember
  app.save(payments)

  const members = app.findCollectionByNameOrId("members")
  members.listRule = activeMember
  members.viewRule = activeMember
  members.updateRule = operator
  members.deleteRule = operator
  members.manageRule = null
  members.authRule = ""
  members.passwordAuth = {
    enabled: true,
    identityFields: ["email"]
  }
  members.authToken.duration = 604800
  members.fields.getByName("password").min = 8
  members.fields.getByName("email").hidden = false
  members.removeIndex("idx_members_login_id")
  members.fields.removeByName("loginId")
  app.save(members)
})
