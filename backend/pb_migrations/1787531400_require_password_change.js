/// <reference path="../pb_data/types.d.ts" />

const signedInMember = '@request.auth.id != "" && @request.auth.active = true'
const activeMember = `${signedInMember} && @request.auth.mustChangePassword = false`
const operator = `${activeMember} && (@request.auth.role = "operator" || @request.auth.role = "admin")`
const selfPasswordUpdate = [
  'id = @request.auth.id',
  '@request.body.loginId:isset = false',
  '@request.body.email:isset = false',
  '@request.body.emailVisibility:isset = false',
  '@request.body.verified:isset = false',
  '@request.body.name:isset = false',
  '@request.body.role:isset = false',
  '@request.body.active:isset = false',
  '@request.body.joinedAt:isset = false',
  '@request.body.mustChangePassword:isset = false'
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
  '@request.body.active:isset = false',
  '@request.body.joinedAt:isset = false'
].join(' && ')

migrate((app) => {
  const members = app.findCollectionByNameOrId("members")
  members.fields.add(new BoolField({ name: "mustChangePassword" }))
  members.listRule = operator
  members.viewRule = `id = @request.auth.id || ${operator}`
  members.updateRule = `${operator} || (${selfPasswordUpdate}) || (${requiredPasswordChange})`
  app.save(members)

  const payments = app.findCollectionByNameOrId("dues_payments")
  payments.listRule = operator
  payments.viewRule = operator
  app.save(payments)

  for (const name of ["member_directory", "member_dues_status"]) {
    const view = app.findCollectionByNameOrId(name)
    view.listRule = activeMember
    view.viewRule = activeMember
    app.save(view)
  }

  const transactions = app.findCollectionByNameOrId("transactions")
  transactions.listRule = operator
  transactions.viewRule = operator
  app.save(transactions)

  const memberTransactions = new Collection({
    type: "view",
    name: "member_transactions",
    listRule: activeMember,
    viewRule: activeMember,
    viewQuery: `
      SELECT
        id,
        transactedAt,
        type,
        category,
        amount,
        balanceAfter
      FROM transactions
      WHERE visibleToMembers = TRUE
    `
  })
  app.save(memberTransactions)

  const rules = app.findCollectionByNameOrId("rules")
  rules.listRule = `${activeMember} && (published = true || ${operator})`
  rules.viewRule = `${activeMember} && (published = true || ${operator})`
  app.save(rules)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("member_transactions"))

  const activeMemberBefore = '@request.auth.id != "" && @request.auth.active = true'
  const operatorBefore = `${activeMemberBefore} && (@request.auth.role = "operator" || @request.auth.role = "admin")`
  const selfSafeUpdateBefore = [
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

  const members = app.findCollectionByNameOrId("members")
  members.fields.removeByName("mustChangePassword")
  members.listRule = operatorBefore
  members.viewRule = `id = @request.auth.id || ${operatorBefore}`
  members.updateRule = `${operatorBefore} || (${selfSafeUpdateBefore})`
  app.save(members)

  const payments = app.findCollectionByNameOrId("dues_payments")
  payments.listRule = operatorBefore
  payments.viewRule = operatorBefore
  app.save(payments)

  for (const name of ["member_directory", "member_dues_status"]) {
    const view = app.findCollectionByNameOrId(name)
    view.listRule = activeMemberBefore
    view.viewRule = activeMemberBefore
    app.save(view)
  }

  const transactions = app.findCollectionByNameOrId("transactions")
  transactions.listRule = `${activeMemberBefore} && (visibleToMembers = true || ${operatorBefore})`
  transactions.viewRule = `${activeMemberBefore} && (visibleToMembers = true || ${operatorBefore})`
  app.save(transactions)

  const rules = app.findCollectionByNameOrId("rules")
  rules.listRule = `${activeMemberBefore} && (published = true || ${operatorBefore})`
  rules.viewRule = `${activeMemberBefore} && (published = true || ${operatorBefore})`
  app.save(rules)
})
