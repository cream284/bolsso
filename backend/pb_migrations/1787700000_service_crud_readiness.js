/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const signedIn = '@request.auth.id != "" && @request.auth.active = true && @request.auth.mustChangePassword = false'
  const admin = `${signedIn} && (@request.auth.isAdmin = true || @request.auth.role = "admin")`
  const chair = `${signedIn} && @request.auth.role = "chair"`
  const treasurer = `${signedIn} && @request.auth.role = "treasurer"`
  const eventManager = `(${admin} || ${chair} || ${treasurer})`

  const members = app.findCollectionByNameOrId("members")
  members.fields.add(new DateField({ name: "deactivatedAt" }))
  members.fields.add(new DateField({ name: "anonymizedAt" }))
  const memberSelfPasswordUpdate = [
    'id = @request.auth.id',
    '@request.body.loginId:isset = false',
    '@request.body.email:isset = false',
    '@request.body.emailVisibility:isset = false',
    '@request.body.verified:isset = false',
    '@request.body.name:isset = false',
    '@request.body.role:isset = false',
    '@request.body.isAdmin:isset = false',
    '@request.body.active:isset = false',
    '@request.body.joinedAt:isset = false',
    '@request.body.mustChangePassword:isset = false',
    '@request.body.deactivatedAt:isset = false',
    '@request.body.anonymizedAt:isset = false'
  ].join(' && ')
  const requiredPasswordChange = [
    'id = @request.auth.id',
    '@request.auth.active = true',
    '@request.auth.mustChangePassword = true',
    '@request.body.oldPassword:isset = true',
    '@request.body.password:isset = true',
    '@request.body.passwordConfirm:isset = true',
    '@request.body.mustChangePassword = false',
    '@request.body.loginId:isset = false',
    '@request.body.email:isset = false',
    '@request.body.emailVisibility:isset = false',
    '@request.body.verified:isset = false',
    '@request.body.name:isset = false',
    '@request.body.role:isset = false',
    '@request.body.isAdmin:isset = false',
    '@request.body.active:isset = false',
    '@request.body.joinedAt:isset = false',
    '@request.body.deactivatedAt:isset = false',
    '@request.body.anonymizedAt:isset = false'
  ].join(' && ')
  members.updateRule = `${admin} || (${memberSelfPasswordUpdate}) || (${requiredPasswordChange})`
  // Keep referenced member rows for accounting and audit integrity. Membership
  // termination is represented by active=false; personal data is anonymized by
  // a separate, deliberate retention workflow.
  members.deleteRule = null
  app.save(members)

  const events = app.findCollectionByNameOrId("events")
  events.createRule = eventManager
  events.updateRule = eventManager
  events.deleteRule = null // use cancelled status instead of destroying history
  app.save(events)

  const attendees = app.findCollectionByNameOrId("event_attendees")
  attendees.createRule = eventManager
  attendees.updateRule = eventManager
  attendees.deleteRule = eventManager
  app.save(attendees)

  const periods = app.findCollectionByNameOrId("dues_periods")
  periods.deleteRule = null // use closed status and retain member payment history
  app.save(periods)

  const payments = app.findCollectionByNameOrId("dues_payments")
  payments.deleteRule = null
  payments.fields.getByName("period").cascadeDelete = false
  payments.fields.getByName("member").cascadeDelete = false
  app.save(payments)

  const policies = app.findCollectionByNameOrId("dues_policies")
  policies.deleteRule = null // use active=false
  app.save(policies)

  const auditLogs = app.findCollectionByNameOrId("audit_logs")
  auditLogs.listRule = `${admin} || (${chair} && (domain = "rules" || domain = "ledger" || domain = "events")) || (${treasurer} && (domain = "dues" || domain = "ledger" || domain = "events"))`
  auditLogs.viewRule = auditLogs.listRule
  app.save(auditLogs)
}, (app) => {
  const signedIn = '@request.auth.id != "" && @request.auth.active = true && @request.auth.mustChangePassword = false'
  const admin = `${signedIn} && (@request.auth.isAdmin = true || @request.auth.role = "admin")`
  const chair = `${signedIn} && @request.auth.role = "chair"`
  const eventManager = `(${admin} || ${chair})`

  const members = app.findCollectionByNameOrId("members")
  members.fields.removeByName("anonymizedAt")
  members.fields.removeByName("deactivatedAt")
  const memberSelfPasswordUpdate = [
    'id = @request.auth.id', '@request.body.loginId:isset = false', '@request.body.email:isset = false',
    '@request.body.emailVisibility:isset = false', '@request.body.verified:isset = false', '@request.body.name:isset = false',
    '@request.body.role:isset = false', '@request.body.isAdmin:isset = false', '@request.body.active:isset = false',
    '@request.body.joinedAt:isset = false', '@request.body.mustChangePassword:isset = false'
  ].join(' && ')
  const requiredPasswordChange = [
    'id = @request.auth.id', '@request.auth.active = true', '@request.auth.mustChangePassword = true',
    '@request.body.oldPassword:isset = true', '@request.body.password:isset = true',
    '@request.body.passwordConfirm:isset = true', '@request.body.mustChangePassword = false',
    '@request.body.loginId:isset = false', '@request.body.email:isset = false',
    '@request.body.emailVisibility:isset = false', '@request.body.verified:isset = false',
    '@request.body.name:isset = false', '@request.body.role:isset = false', '@request.body.isAdmin:isset = false',
    '@request.body.active:isset = false', '@request.body.joinedAt:isset = false'
  ].join(' && ')
  members.updateRule = `${admin} || (${memberSelfPasswordUpdate}) || (${requiredPasswordChange})`
  members.deleteRule = admin
  app.save(members)

  const events = app.findCollectionByNameOrId("events")
  events.createRule = eventManager
  events.updateRule = eventManager
  events.deleteRule = eventManager
  app.save(events)

  const attendees = app.findCollectionByNameOrId("event_attendees")
  attendees.createRule = eventManager
  attendees.updateRule = eventManager
  attendees.deleteRule = eventManager
  app.save(attendees)

  const periods = app.findCollectionByNameOrId("dues_periods")
  periods.deleteRule = `(${admin} || (${signedIn} && @request.auth.role = "treasurer"))`
  app.save(periods)

  const payments = app.findCollectionByNameOrId("dues_payments")
  payments.deleteRule = `(${admin} || (${signedIn} && @request.auth.role = "treasurer"))`
  payments.fields.getByName("period").cascadeDelete = true
  payments.fields.getByName("member").cascadeDelete = true
  app.save(payments)

  const policies = app.findCollectionByNameOrId("dues_policies")
  policies.deleteRule = `(${admin} || (${signedIn} && @request.auth.role = "treasurer"))`
  app.save(policies)

  const auditLogs = app.findCollectionByNameOrId("audit_logs")
  auditLogs.listRule = `${admin} || (${chair} && (domain = "rules" || domain = "ledger")) || (${signedIn} && @request.auth.role = "treasurer" && (domain = "dues" || domain = "ledger"))`
  auditLogs.viewRule = auditLogs.listRule
  app.save(auditLogs)
})
