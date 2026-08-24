const API_BASE = 'https://bolsso-api.tail8a3a4b.ts.net';
const AUTH_KEY = 'bolsso.member.session';

const $ = (selector) => document.querySelector(selector);
const loginView = $('#loginView');
const passwordChangeView = $('#passwordChangeView');
const appShell = $('#appShell');
const loginForm = $('#loginForm');
const loginMessage = $('#loginMessage');
const passwordChangeForm = $('#passwordChangeForm');
const passwordChangeMessage = $('#passwordChangeMessage');
const rulesModal = $('#rulesModal');

let auth = loadAuth();
let latestRule = null;

function loadAuth() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(AUTH_KEY));
    if (!parsed?.token || !parsed?.record?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAuth(data) {
  auth = {
    token: data.token,
    record: {
      id: data.record.id,
      name: data.record.name,
      role: data.record.role,
      active: data.record.active,
      isAdmin: data.record.isAdmin === true,
      mustChangePassword: data.record.mustChangePassword === true
    }
  };
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function clearAuth() {
  auth = null;
  latestRule = null;
  sessionStorage.removeItem(AUTH_KEY);
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (auth?.token) headers.set('Authorization', auth.token);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store' });
  if (response.status === 401) {
    clearAuth();
    showLogin('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    throw new Error('SESSION_EXPIRED');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error('API_REQUEST_FAILED');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function listPath(collection, params = {}) {
  const query = new URLSearchParams({ page: '1', perPage: '200', ...params });
  return `/api/collections/${collection}/records?${query}`;
}

async function login(loginId, password) {
  const response = await fetch(`${API_BASE}/api/collections/members/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identity: loginId, password }),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.token || !data?.record?.active) throw new Error('LOGIN_FAILED');
  saveAuth(data);
}

async function refreshAuth() {
  const data = await apiRequest('/api/collections/members/auth-refresh', { method: 'POST' });
  if (!data?.record?.active) throw new Error('INACTIVE_MEMBER');
  saveAuth(data);
}

function showLogin(message = '') {
  appShell.hidden = true;
  passwordChangeView.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
  $('#password').value = '';
  $('#loginId').focus();
}

function showPasswordChange() {
  appShell.hidden = true;
  loginView.hidden = true;
  passwordChangeView.hidden = false;
  passwordChangeMessage.textContent = '';
  $('#temporaryPassword').value = '';
  $('#newPassword').value = '';
  $('#newPasswordConfirm').value = '';
  $('#temporaryPassword').focus();
}

function showApp() {
  loginView.hidden = true;
  appShell.hidden = false;
  const name = auth.record.name || '회원';
  const initial = name.trim().charAt(0) || '회';
  $('#greetingName').textContent = name;
  $('#sidebarName').textContent = name;
  $('#sidebarRole').textContent = memberRoleLabel(auth.record);
  $('#sidebarAvatar').textContent = initial;
  $('#topAvatar').textContent = initial;
  $('#adminNav').hidden = !isAdmin();
  $('#chairNav').hidden = !canManageRules();
  $('#treasurerNav').hidden = !canManageFinance();
  $('#auditNav').hidden = !(isAdmin() || canManageRules() || canManageFinance());
}

function roleLabel(role) {
  if (role === 'chair') return '회장';
  if (role === 'treasurer') return '총무';
  if (role === 'admin') return '관리자';
  if (role === 'operator') return '운영진(이전)';
  return '일반 회원';
}

function isAdmin() {
  return auth?.record?.isAdmin === true || auth?.record?.role === 'admin';
}

function canManageRules() {
  return isAdmin() || auth?.record?.role === 'chair';
}

function canManageFinance() {
  return isAdmin() || auth?.record?.role === 'treasurer';
}

function memberRoleLabel(member) {
  if (member.isAdmin && member.role === 'chair') return '관리자 · 회장';
  if (member.isAdmin) return `관리자 · ${roleLabel(member.role)}`;
  return roleLabel(member.role);
}

function formatWon(value) {
  return `₩ ${Number(value || 0).toLocaleString('ko-KR')}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function plainText(html) {
  const parsed = new DOMParser().parseFromString(html || '', 'text/html');
  return parsed.body.textContent?.trim() || '';
}

function ruleMarkdown(rule) {
  return String(rule?.contentMarkdown || rule?.content || '').trim();
}

function appendMarkdownInline(target, value) {
  const parts = String(value).split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      target.append(strong);
    } else target.append(document.createTextNode(part));
  });
}

function renderMarkdown(target, source) {
  target.replaceChildren();
  const lines = String(source || '').replace(/\r/g, '').split('\n');
  let list = null;
  let listType = '';
  const closeList = () => { list = null; listType = ''; };
  const addTextBlock = (tag, text) => {
    const node = document.createElement(tag);
    appendMarkdownInline(node, text);
    target.append(node);
  };
  const cells = (line) => {
    const text = line.trim().replace(/^\|\s?/, '').replace(/\s?\|$/, '');
    const values = [];
    let cell = '';
    let escaped = false;
    for (const character of text) {
      if (escaped) {
        cell += character;
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '|') {
        values.push(cell.trim());
        cell = '';
      } else cell += character;
    }
    if (escaped) cell += '\\';
    values.push(cell.trim());
    return values;
  };
  const tableDivider = (line) => {
    if (!line.includes('|')) return false;
    const dividerCells = cells(line);
    return dividerCells.length > 1 && dividerCells.every((cell) => /^:?-{3,}:?$/.test(cell));
  };
  const addTable = (headerCells, rows) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'rule-table-wrap';
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    headerCells.forEach((cell) => {
      const cellNode = document.createElement('th');
      appendMarkdownInline(cellNode, cell);
      headRow.append(cellNode);
    });
    head.append(headRow);
    table.append(head);
    const body = document.createElement('tbody');
    rows.forEach((rowCells) => {
      const row = document.createElement('tr');
      headerCells.forEach((_, cellIndex) => {
        const cellNode = document.createElement('td');
        appendMarkdownInline(cellNode, rowCells[cellIndex] || '');
        row.append(cellNode);
      });
      body.append(row);
    });
    table.append(body);
    wrapper.append(table);
    target.append(wrapper);
  };
  const historicalOfficerTable = (startIndex) => {
    if (lines[startIndex].trim() !== '구분') return null;
    const years = [];
    let cursor = startIndex + 1;
    while (/^\d{4}$/.test(lines[cursor]?.trim() || '')) {
      years.push(lines[cursor].trim());
      cursor += 1;
    }
    if (years.length < 2) return null;

    const officerRoles = /^(회장|부회장|총무|감사|서기)$/;
    const rows = [];
    while (cursor < lines.length) {
      const match = lines[cursor].trim().match(/^([^\s]+)\s+(.+)$/);
      if (!match || !officerRoles.test(match[1])) break;
      rows.push([match[1], ...match[2].trim().split(/\s+/)]);
      cursor += 1;
    }
    return rows.length ? { headers: ['구분', ...years], rows, end: cursor } : null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const recoveredTable = historicalOfficerTable(index);
    if (recoveredTable) {
      closeList();
      addTable(recoveredTable.headers, recoveredTable.rows);
      index = recoveredTable.end - 1;
    } else if (line.includes('|') && tableDivider(lines[index + 1] || '')) {
      closeList();
      const rowLines = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rowLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      addTable(cells(line), rowLines.map(cells));
    } else if (heading) {
      closeList();
      addTextBlock(`h${heading[1].length}`, heading[2]);
    } else if (line.trim() === '---') {
      closeList();
      target.append(document.createElement('hr'));
    } else if (bullet || ordered) {
      const nextType = bullet ? 'ul' : 'ol';
      if (!list || listType !== nextType) {
        closeList();
        list = document.createElement(nextType);
        listType = nextType;
        target.append(list);
      }
      const item = document.createElement('li');
      appendMarkdownInline(item, (bullet || ordered)[1]);
      list.append(item);
    } else if (line.trim()) {
      closeList();
      addTextBlock('p', line);
    } else closeList();
  }
}

function setConnection(ok, text) {
  const state = $('#connectionState');
  state.textContent = text;
  state.classList.toggle('online', ok);
}

function renderMembers(items) {
  $('#memberMetric').textContent = String(items.length);
  $('#memberCountLabel').textContent = `${items.length}명`;
  const list = $('#memberList');
  list.replaceChildren();
  if (!items.length) return appendEmpty(list, '등록된 회원이 없습니다.');

  items.forEach((member) => {
    const row = document.createElement('div');
    row.className = 'record-row';
    const avatar = document.createElement('span');
    avatar.className = 'avatar tiny';
    avatar.textContent = member.name?.trim().charAt(0) || '회';
    const info = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = member.name || '이름 없음';
    const detail = document.createElement('small');
    detail.textContent = member.joinedAt ? `가입 ${formatDate(member.joinedAt)}` : memberRoleLabel(member);
    info.append(name, detail);
    const badge = document.createElement('span');
    badge.className = `role-badge ${member.role === 'member' ? '' : 'operator'}`;
    badge.textContent = memberRoleLabel(member);
    row.append(avatar, info, badge);
    list.append(row);
  });
}

function appendEmpty(container, message) {
  const empty = document.createElement('p');
  empty.className = 'empty-message';
  empty.textContent = message;
  container.append(empty);
}

function renderDues(period, items) {
  const rows = $('#duesRows');
  rows.replaceChildren();
  const periodText = period ? period.label : '등록된 기간 없음';
  $('#periodLabel').textContent = periodText;
  $('#duesPeriodLabel').textContent = periodText;

  const currentItems = period ? items.filter((item) => item.periodId === period.id) : [];
  const paidCount = currentItems.filter((item) => item.status === 'paid' || (!item.status && item.paid)).length;
  const metric = $('#paidMetric');
  metric.replaceChildren(document.createTextNode(`${paidCount} / ${currentItems.length}`));
  const unit = document.createElement('small');
  unit.textContent = '명';
  metric.append(unit);
  $('#paidMetricNote').textContent = period ? `1인 ${formatWon(period.amount)}` : '등록된 회비 기간 없음';

  if (!currentItems.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'empty-cell';
    cell.textContent = '등록된 납부 현황이 없습니다.';
    row.append(cell);
    rows.append(row);
    return;
  }

  currentItems.forEach((item) => {
    const row = document.createElement('tr');
    const member = document.createElement('td');
    member.textContent = item.memberName;
    const role = document.createElement('td');
    role.textContent = roleLabel(item.memberRole);
    const status = document.createElement('td');
    const badge = document.createElement('span');
    const paymentStatus = item.status || (item.paid ? 'paid' : 'unpaid');
    badge.className = `payment-badge ${paymentStatus}`;
    badge.textContent = paymentStatus === 'paid' ? '납부' : paymentStatus === 'exempt' ? '면제' : '미납';
    status.append(badge);
    row.append(member, role, status);
    rows.append(row);
  });
}

function renderTransactions(items) {
  const list = $('#transactionList');
  list.replaceChildren();
  $('#balanceMetric').textContent = formatWon(items[0]?.balanceAfter || 0);
  if (!items.length) return appendEmpty(list, '공개된 거래 내역이 없습니다.');

  items.slice(0, 8).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'record-row transaction-row';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.category || (item.type === 'income' ? '수입' : '지출');
    const date = document.createElement('small');
    date.textContent = formatDate(item.transactedAt);
    info.append(title, date);
    const amount = document.createElement('b');
    amount.className = item.type === 'income' ? 'income' : 'expense';
    amount.textContent = `${item.type === 'income' ? '+' : '-'} ${formatWon(item.amount)}`;
    row.append(info, amount);
    list.append(row);
  });
}

function renderRule(items) {
  latestRule = items[0] || null;
  const button = $('#openRules');
  const documentButton = $('#openRuleDocument');
  const sourceDocument = latestRule?.sourceDocument || latestRule?.document;
  button.disabled = !latestRule;
  documentButton.hidden = !sourceDocument;
  $('#ruleDocumentMessage').textContent = '';
  if (!latestRule) return;
  const text = ruleMarkdown(latestRule);
  $('#ruleTitle').textContent = latestRule.title;
  $('#ruleSummary').textContent = text.slice(0, 120) || '운영 규약 내용을 확인해 주세요.';
  $('#rulesModalTitle').textContent = latestRule.title;
  $('#rulesModalMeta').textContent = [latestRule.version, formatDate(latestRule.effectiveDate)].filter(Boolean).join(' · ');
  renderMarkdown($('#rulesModalContent'), text);
}

function showRuleRevisionPreview(rule) {
  $('#rulesModalTitle').textContent = rule.title || '운영 규약 초안';
  $('#rulesModalMeta').textContent = [
    rule.published ? '게시본' : '비공개 초안',
    rule.version,
    formatDate(rule.effectiveDate)
  ].filter(Boolean).join(' · ');
  $('#openRuleDocument').hidden = true;
  $('#ruleDocumentMessage').textContent = '';
  renderMarkdown($('#rulesModalContent'), ruleMarkdown(rule));
  rulesModal.showModal();
}

async function openProtectedRuleDocument() {
  const filename = latestRule?.sourceDocument || latestRule?.document;
  if (!filename) return;
  const button = $('#openRuleDocument');
  const message = $('#ruleDocumentMessage');
  button.disabled = true;
  button.textContent = 'PDF 준비 중…';
  message.textContent = '';

  const preview = window.open('about:blank', '_blank');
  if (preview) preview.opener = null;

  try {
    const { token } = await apiRequest('/api/files/token', { method: 'POST' });
    if (!token) throw new Error('FILE_TOKEN_FAILED');
    const collection = encodeURIComponent(latestRule.collectionId || 'rules');
    const record = encodeURIComponent(latestRule.id);
    const url = `${API_BASE}/api/files/${collection}/${record}/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
    if (preview) preview.location.replace(url);
    else window.location.assign(url);
  } catch (error) {
    if (preview) preview.close();
    if (error.message !== 'SESSION_EXPIRED') message.textContent = 'PDF를 열지 못했습니다. 잠시 후 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
    button.textContent = 'PDF 원문 보기';
  }
}

async function loadDashboard() {
  setConnection(false, 'NAS 연결 확인 중');
  const requests = [
    ['회원 목록', apiRequest(listPath('member_directory', { sort: 'name' }))],
    ['회비 기간', apiRequest(listPath('dues_periods', { sort: '-year,-month' }))],
    ['납부 현황', apiRequest(listPath('member_dues_status', { sort: 'memberName' }))],
    ['회비 사용', apiRequest(listPath('member_transactions', { sort: '-transactedAt', perPage: '20' }))],
    ['운영 규약', apiRequest(listPath('rules', { sort: '-effectiveDate', filter: 'published = true', perPage: '1' }))]
  ];
  const results = await Promise.allSettled(requests.map(([, request]) => request));
  if (!auth || results.some((result) => result.status === 'rejected' && result.reason?.message === 'SESSION_EXPIRED')) return;

  const items = results.map((result) => result.status === 'fulfilled' ? result.value.items : []);
  const [members, periods, dues, transactions, rules] = items;
  const currentPeriod = periods.find((item) => item.status === 'open') || periods[0] || null;
  renderMembers(members);
  renderDues(currentPeriod, dues);
  renderTransactions(transactions);
  renderRule(rules);

  const failures = results.flatMap((result, index) => result.status === 'rejected' ? [requests[index][0]] : []);
  if (!failures.length) {
    setConnection(true, 'NAS 연결됨');
    $('#lastUpdated').textContent = `${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date())} 기준 NAS 데이터`;
    return;
  }

  setConnection(false, failures.length === requests.length ? 'NAS 연결 오류' : '일부 데이터 오류');
  $('#lastUpdated').textContent = `불러오지 못한 항목: ${failures.join(', ')}`;
}

let operationData = { members: [], directory: [], terms: [], policies: [], periods: [], payments: [], transactions: [], audits: [], rules: [] };

function toPbDate(value) {
  return value ? `${value} 00:00:00.000Z` : '';
}

function fieldMessage(form, message, ok = false) {
  const node = form.querySelector('[data-message]');
  if (!node) return;
  node.textContent = message;
  node.style.color = ok ? '#527760' : '';
}

function setOptions(select, items, label) {
  select.replaceChildren();
  if (!items.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '등록된 항목 없음';
    select.append(option);
    return;
  }
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = label(item);
    select.append(option);
  });
}

function renderTerms(items) {
  const list = $('#termList');
  list.replaceChildren();
  if (!items.length) return appendEmpty(list, '등록된 운영진 임기가 없습니다.');
  items.sort((a, b) => b.year - a.year || a.office.localeCompare(b.office)).forEach((term) => {
    const row = document.createElement('div');
    row.className = 'record-row';
    const title = document.createElement('strong');
    title.textContent = `${term.year}년 ${roleLabel(term.office)}`;
    const info = document.createElement('span');
    const name = operationData.members.find((member) => member.id === term.member)?.name || '회원';
    info.append(title, document.createElement('small'));
    info.lastChild.textContent = `${name} · 1월 1일 ~ 12월 31일`;
    row.append(info);
    list.append(row);
  });
}

function renderChairLedger(items) {
  const list = $('#chairLedgerList');
  list.replaceChildren();
  if (!items.length) return appendEmpty(list, '확정된 장부가 없습니다.');
  items.slice(0, 50).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'record-row transaction-row';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.category;
    const detail = document.createElement('small');
    detail.textContent = [formatDate(item.transactedAt), item.memo].filter(Boolean).join(' · ');
    info.append(title, detail);
    const amount = document.createElement('b');
    amount.className = item.type === 'income' ? 'income' : 'expense';
    amount.textContent = `${item.type === 'income' ? '+' : '-'} ${formatWon(item.amount)}`;
    row.append(info, amount);
    list.append(row);
  });
}

function renderRuleRevisions(items) {
  const list = $('#ruleRevisionList');
  list.replaceChildren();
  if (!items.length) return appendEmpty(list, '아직 규약 개정 이력이 없습니다.');
  items.forEach((rule) => {
    const row = document.createElement('div');
    row.className = 'record-row';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = `${rule.version || '버전 없음'} · ${rule.title}`;
    const detail = document.createElement('small');
    detail.textContent = [rule.published ? '현재 게시본' : '이력', formatDate(rule.effectiveDate), rule.revisionNote].filter(Boolean).join(' · ');
    info.append(title, detail);
    row.append(info);
    const actions = document.createElement('span');
    actions.className = 'record-actions';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'text-button';
    preview.textContent = '미리보기';
    preview.addEventListener('click', () => showRuleRevisionPreview(rule));
    actions.append(preview);
    if (!rule.published) {
      const publish = document.createElement('button');
      publish.type = 'button';
      publish.className = 'text-button';
      publish.textContent = '회원 게시';
      publish.addEventListener('click', async () => {
        publish.disabled = true;
        publish.textContent = '게시 중…';
        try {
          await apiRequest(`/api/collections/rules/records/${encodeURIComponent(rule.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ published: true })
          });
          await refreshAllData();
        } catch {
          publish.disabled = false;
          publish.textContent = '게시 실패';
        }
      });
      actions.append(publish);
    }
    row.append(actions);
    list.append(row);
  });
}

function renderAudit(items) {
  const list = $('#auditList');
  list.replaceChildren();
  if (!items.length) return appendEmpty(list, '열람 가능한 감사 로그가 없습니다.');
  items.slice(0, 100).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'record-row';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = `${item.domain} · ${item.action}`;
    const detail = document.createElement('small');
    const fields = Array.isArray(item.summary?.changedFields) ? item.summary.changedFields.join(', ') : '항목 변경';
    detail.textContent = `${formatDate(item.occurredAt)} · ${fields || '기록'}`;
    info.append(title, detail);
    row.append(info);
    list.append(row);
  });
}

function renderOperationControls() {
  const members = operationData.members;
  const activeMembers = members.filter((member) => member.active);
  setOptions($('#adminMemberSelect'), members, (member) => `${member.name} · ${member.loginId}`);
  setOptions($('#resetMemberSelect'), members, (member) => `${member.name} · ${member.loginId}`);
  setOptions($('#termMemberSelect'), activeMembers, (member) => `${member.name} · ${member.loginId}`);
  const revisionSelect = $('#previousRevisionSelect');
  revisionSelect.replaceChildren();
  const firstOption = document.createElement('option');
  firstOption.value = '';
  firstOption.textContent = '새 제정 (이전 개정본 없음)';
  revisionSelect.append(firstOption);
  operationData.rules.forEach((rule) => {
    const option = document.createElement('option');
    option.value = rule.id;
    option.textContent = `${rule.version || '버전 없음'} · ${rule.title}`;
    revisionSelect.append(option);
  });
  setOptions($('#policySelect'), operationData.policies, (policy) => `${policy.year}년 정책`);
  setOptions($('#paymentSelect'), operationData.payments, (payment) => {
    const member = members.find((item) => item.id === payment.member);
    const period = operationData.periods.find((item) => item.id === payment.period);
    return `${period?.label || '기간'} · ${member?.name || '회원'} · ${payment.status || 'unpaid'}`;
  });
  setOptions($('#transactionSelect'), operationData.transactions.filter((item) => item.entryStatus === 'draft'), (item) => `${formatDate(item.transactedAt)} · ${item.category} · ${formatWon(item.amount)}`);
  renderTerms(operationData.terms);
  renderRuleRevisions(operationData.rules);
  renderChairLedger(operationData.chairLedger || []);
  renderAudit(operationData.audits);
}

async function loadOperations() {
  $('#adminPanel').hidden = !isAdmin();
  $('#chairPanel').hidden = !canManageRules();
  $('#treasurerPanel').hidden = !canManageFinance();
  $('#auditPanel').hidden = !(isAdmin() || canManageRules() || canManageFinance());
  if (!isAdmin() && !canManageRules() && !canManageFinance()) return;

  const requests = [
    ['directory', apiRequest(listPath('member_directory', { sort: 'name' }))],
    ['terms', apiRequest(listPath('officer_terms', { sort: '-year,office' }))]
  ];
  if (isAdmin()) requests.push(['members', apiRequest(listPath('members', { sort: 'name' }))]);
  if (canManageFinance()) requests.push(
    ['policies', apiRequest(listPath('dues_policies', { sort: '-year' }))],
    ['periods', apiRequest(listPath('dues_periods', { sort: '-year,-month' }))],
    ['payments', apiRequest(listPath('dues_payments'))],
    ['transactions', apiRequest(listPath('transactions', { sort: '-transactedAt' }))]
  );
  if (canManageRules()) requests.push(
    ['chairLedger', apiRequest(listPath('chair_ledger', { sort: '-transactedAt' }))],
    ['rules', apiRequest(listPath('rules', { sort: '-effectiveDate' }))]
  );
  if (isAdmin() || canManageRules() || canManageFinance()) requests.push(['audits', apiRequest(listPath('audit_logs', { sort: '-occurredAt' }))]);

  const results = await Promise.allSettled(requests.map(([, request]) => request));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') operationData[requests[index][0]] = result.value.items;
  });
  if (!operationData.members.length) operationData.members = operationData.directory;
  renderOperationControls();
}

async function refreshAllData() {
  await Promise.all([loadDashboard(), loadOperations()]);
}

async function submitJsonForm(form, path, body, successMessage) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  fieldMessage(form, '저장 중…');
  try {
    await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    fieldMessage(form, successMessage, true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '저장하지 못했습니다. 입력값과 권한을 확인해 주세요.');
  } finally {
    button.disabled = false;
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const loginId = $('#loginId').value.trim().toLowerCase();
  const password = $('#password').value;
  if (!loginId || !password) {
    loginMessage.textContent = '로그인 ID와 비밀번호를 모두 입력해 주세요.';
    return;
  }

  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '확인 중…';
  loginMessage.textContent = '';
  try {
    await login(loginId, password);
    if (auth.record.mustChangePassword) {
      showPasswordChange();
      return;
    }
    showApp();
    await refreshAllData();
  } catch {
    clearAuth();
    loginMessage.textContent = '로그인 정보를 확인할 수 없습니다.';
    $('#password').value = '';
    $('#password').focus();
  } finally {
    button.disabled = false;
    button.textContent = '로그인';
  }
});

passwordChangeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const oldPassword = $('#temporaryPassword').value;
  const password = $('#newPassword').value;
  const passwordConfirm = $('#newPasswordConfirm').value;
  if (!oldPassword) {
    passwordChangeMessage.textContent = '현재 임시 비밀번호를 입력해 주세요.';
    return;
  }
  if (password.length < 8) {
    passwordChangeMessage.textContent = '비밀번호는 8자 이상으로 설정해 주세요.';
    return;
  }
  if (password !== passwordConfirm) {
    passwordChangeMessage.textContent = '새 비밀번호 확인이 일치하지 않습니다.';
    return;
  }

  const button = passwordChangeForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '저장 중…';
  passwordChangeMessage.textContent = '';
  try {
    await apiRequest(`/api/collections/members/records/${encodeURIComponent(auth.record.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ oldPassword, password, passwordConfirm, mustChangePassword: false })
    });
    clearAuth();
    showLogin('새 비밀번호가 설정되었습니다. 새 비밀번호로 다시 로그인해 주세요.');
  } catch (error) {
    if (error.message !== 'SESSION_EXPIRED') {
      passwordChangeMessage.textContent = '비밀번호를 저장하지 못했습니다. 8자 이상인지 확인해 주세요.';
    }
  } finally {
    button.disabled = false;
    button.textContent = '새 비밀번호 설정';
  }
});

$('#adminMemberSelect').addEventListener('change', (event) => {
  const member = operationData.members.find((item) => item.id === event.target.value);
  if (!member) return;
  const form = $('#memberUpdateForm');
  form.elements.role.value = member.role === 'admin' || member.role === 'operator' ? 'member' : member.role;
  form.elements.active.checked = member.active === true;
  form.elements.isAdmin.checked = member.isAdmin === true || member.role === 'admin';
});

$('#memberCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const password = String(data.get('password'));
  if (password.length < 8) return fieldMessage(form, '임시 비밀번호는 8자 이상이어야 합니다.');
  await submitJsonForm(form, '/api/collections/members/records', {
    name: String(data.get('name')).trim(),
    loginId: String(data.get('loginId')).trim().toLowerCase(),
    password,
    passwordConfirm: password,
    role: data.get('role'),
    isAdmin: false,
    active: true,
    mustChangePassword: true,
    joinedAt: new Date().toISOString()
  }, '회원 계정을 발급했습니다. 첫 로그인에서 비밀번호 변경이 필요합니다.');
});

$('#memberUpdateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const memberId = String(data.get('memberId'));
  if (!memberId) return fieldMessage(form, '회원을 선택해 주세요.');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest(`/api/collections/members/records/${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: data.get('role'), active: data.get('active') === 'on', isAdmin: data.get('isAdmin') === 'on' })
    });
    fieldMessage(form, '회원 상태와 직책을 저장했습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '변경하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

$('#passwordResetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const password = String(data.get('password'));
  const memberId = String(data.get('memberId'));
  if (!memberId || password.length < 8) return fieldMessage(form, '회원과 8자 이상 임시 비밀번호를 입력해 주세요.');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest(`/api/collections/members/records/${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ password, passwordConfirm: password, mustChangePassword: true })
    });
    form.reset();
    fieldMessage(form, '비밀번호를 초기화했습니다. 다음 로그인에서 변경이 필요합니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '초기화하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

$('#termCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const year = Number(data.get('year'));
  await submitJsonForm(form, '/api/collections/officer_terms/records', {
    year,
    office: data.get('office'),
    member: data.get('member'),
    startsOn: `${year}-01-01 00:00:00.000Z`,
    endsOn: `${year}-12-31 23:59:59.000Z`
  }, '해당 연도의 1월~12월 운영진 임기를 등록했습니다.');
});

function markdownHeadingFromFilename(filename) {
  return String(filename || '운영 규약').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || '운영 규약';
}

function normalizeExtractedMarkdown(text, filename) {
  const cleaned = String(text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) throw new Error('NO_TEXT');
  return cleaned.startsWith('#') ? cleaned : `# ${markdownHeadingFromFilename(filename)}\n\n${cleaned}`;
}

async function convertRuleSourceToMarkdown(file) {
  const payload = new FormData();
  payload.set('file', file);
  const result = await apiRequest('/api/bolsso/rules/convert', { method: 'POST', body: payload });
  return normalizeExtractedMarkdown(result.markdown, result.sourceName || file.name);
}

$('#convertRuleSource').addEventListener('click', async () => {
  const input = $('#ruleSourceDocument');
  const file = input.files?.[0];
  const note = $('#ruleConversionNote');
  if (!file) {
    note.textContent = 'NAS에 보관할 원본 파일을 먼저 선택해 주세요.';
    return;
  }
  const button = $('#convertRuleSource');
  button.disabled = true;
  note.textContent = 'NAS 내부 MarkItDown으로 Markdown 초안을 만드는 중…';
  try {
    const markdown = await convertRuleSourceToMarkdown(file);
    const form = $('#ruleManageForm');
    form.elements.contentMarkdown.value = markdown;
    if (!form.elements.title.value.trim()) form.elements.title.value = markdownHeadingFromFilename(file.name);
    note.textContent = 'Markdown 초안을 채웠습니다. 내용과 줄바꿈을 검토한 뒤 저장해 주세요.';
  } catch (error) {
    if (error.message === 'NO_TEXT') {
      note.textContent = '텍스트를 찾지 못했습니다. 스캔 PDF는 Markdown 내용을 직접 입력하거나 붙여넣어 주세요.';
    } else {
      note.textContent = '변환하지 못했습니다. PDF·Word·Markdown·텍스트 형식인지 확인해 주세요.';
    }
  } finally {
    button.disabled = false;
  }
});

$('#previousRevisionSelect').addEventListener('change', (event) => {
  const rule = operationData.rules.find((item) => item.id === event.target.value);
  if (!rule) return;
  const form = $('#ruleManageForm');
  form.elements.title.value = rule.title || '';
  form.elements.contentMarkdown.value = ruleMarkdown(rule);
  $('#ruleConversionNote').textContent = '이전 개정본을 Markdown 편집기에 복사했습니다. 버전·시행일·개정 사유를 새로 입력해 주세요.';
});

$('#ruleManageForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  fieldMessage(form, 'NAS에 규약을 저장 중…');
  try {
    const payload = new FormData();
    payload.set('title', String(data.get('title')).trim());
    payload.set('version', String(data.get('version')).trim());
    payload.set('effectiveDate', toPbDate(String(data.get('effectiveDate'))));
    const markdown = String(data.get('contentMarkdown')).trim();
    payload.set('content', markdown);
    payload.set('contentMarkdown', markdown);
    payload.set('revisionNote', String(data.get('revisionNote')).trim());
    const previousRevision = String(data.get('previousRevision') || '');
    if (previousRevision) payload.set('previousRevision', previousRevision);
    payload.set('published', data.get('published') === 'on' ? 'true' : 'false');
    const sourceDocument = data.get('sourceDocument');
    if (sourceDocument instanceof File && sourceDocument.size) payload.set('sourceDocument', sourceDocument);
    await apiRequest('/api/collections/rules/records', { method: 'POST', body: payload });
    form.reset();
    $('#ruleConversionNote').textContent = '원본은 NAS에만 저장됩니다. 파일을 불러온 뒤 Markdown 초안을 검토하고 수정해 게시하세요.';
    fieldMessage(form, '규약 개정본을 NAS에 저장했습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '규약을 저장하지 못했습니다. 원본 파일은 10MB 이하인지 확인해 주세요.');
  } finally {
    button.disabled = false;
  }
});

$('#policyCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await submitJsonForm(form, '/api/collections/dues_policies/records', {
    year: Number(data.get('year')),
    monthlyAmount: Number(data.get('monthlyAmount')),
    annualAmount: Number(data.get('annualAmount')),
    dueDay: Number(data.get('dueDay')),
    active: true
  }, '연도 회비 정책을 저장했습니다.');
});

$('#billingType').addEventListener('change', (event) => {
  const isAnnual = event.target.value === 'annual';
  const month = $('#periodMonth');
  month.value = isAnnual ? '13' : '1';
  month.readOnly = isAnnual;
});

$('#periodCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const policy = operationData.policies.find((item) => item.id === data.get('policy'));
  const billingType = String(data.get('billingType'));
  const month = billingType === 'annual' ? 13 : Number(data.get('month'));
  if (!policy || (billingType === 'monthly' && (month < 1 || month > 12))) return fieldMessage(form, '정책과 월을 확인해 주세요.');
  const amount = billingType === 'annual' ? policy.annualAmount : policy.monthlyAmount;
  const label = billingType === 'annual' ? `${policy.year}년 연납 회비` : `${policy.year}년 ${month}월 회비`;
  await submitJsonForm(form, '/api/collections/dues_periods/records', {
    year: policy.year,
    month,
    label,
    amount,
    dueDate: toPbDate(String(data.get('dueDate'))),
    status: 'open',
    billingType,
    policy: policy.id
  }, '회비 기간을 만들고 모든 활성 회원의 납부 행을 생성했습니다.');
});

$('#paymentUpdateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const paymentId = String(data.get('paymentId'));
  const status = String(data.get('status'));
  if (!paymentId) return fieldMessage(form, '납부 행을 선택해 주세요.');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest(`/api/collections/dues_payments/records/${encodeURIComponent(paymentId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, paid: status === 'paid', paidAt: status === 'paid' ? new Date().toISOString() : null })
    });
    fieldMessage(form, '납부 상태를 저장했습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '납부 상태를 저장하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

$('#transactionCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  fieldMessage(form, 'NAS에 장부 초안을 저장 중…');
  try {
    const payload = new FormData();
    payload.set('transactedAt', toPbDate(String(data.get('transactedAt'))));
    payload.set('type', String(data.get('type')));
    payload.set('category', String(data.get('category')).trim());
    payload.set('amount', String(data.get('amount')));
    payload.set('balanceAfter', String(data.get('balanceAfter') || 0));
    payload.set('memo', String(data.get('memo')).trim());
    payload.set('visibleToMembers', data.get('visibleToMembers') === 'on' ? 'true' : 'false');
    const evidence = data.get('evidence');
    if (evidence instanceof File && evidence.size) payload.set('evidence', evidence);
    await apiRequest('/api/collections/transactions/records', { method: 'POST', body: payload });
    form.reset();
    fieldMessage(form, '장부 초안을 NAS에 저장했습니다. 확정 전에는 회원에게 표시되지 않습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '장부 초안을 저장하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

$('#transactionConfirmForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const transactionId = String(data.get('transactionId'));
  if (!transactionId) return fieldMessage(form, '확정할 초안 장부를 선택해 주세요.');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest(`/api/collections/transactions/records/${encodeURIComponent(transactionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ entryStatus: 'confirmed' })
    });
    fieldMessage(form, '장부를 확정했습니다. 회장은 읽기 전용으로 확인할 수 있습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '장부를 확정하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

$('#logoutButton').addEventListener('click', () => {
  clearAuth();
  showLogin('안전하게 로그아웃되었습니다.');
});

$('#openRules').addEventListener('click', () => {
  if (latestRule) rulesModal.showModal();
});

$('#openRuleDocument').addEventListener('click', openProtectedRuleDocument);

document.querySelectorAll('.close-dialog').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
rulesModal.addEventListener('click', (event) => {
  if (event.target === rulesModal) rulesModal.close();
});

$('.menu-button').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
  link.classList.add('active');
  $('.sidebar').classList.remove('open');
}));

(async () => {
  if (!auth) return showLogin();
  try {
    await refreshAuth();
    if (auth.record.mustChangePassword) return showPasswordChange();
    showApp();
    await refreshAllData();
  } catch {
    clearAuth();
    showLogin('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
})();
