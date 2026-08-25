const API_BASE = 'https://bolsso-api.tail8a3a4b.ts.net';
const AUTH_KEY = 'bolsso.member.session';

const $ = (selector) => document.querySelector(selector);
const loginView = $('#loginView');
const signupView = $('#signupView');
const passwordChangeView = $('#passwordChangeView');
const appShell = $('#appShell');
const loginForm = $('#loginForm');
const loginMessage = $('#loginMessage');
const signupRequestForm = $('#signupRequestForm');
const signupMessage = $('#signupMessage');
const passwordChangeForm = $('#passwordChangeForm');
const passwordChangeMessage = $('#passwordChangeMessage');
const rulesModal = $('#rulesModal');
const sidebar = $('.sidebar');
const scrollToTopButton = $('#scrollToTop');
const mobileSidebarMedia = window.matchMedia('(max-width: 800px)');

let auth = loadAuth();
let latestRule = null;
let sidebarPageScroll = 0;

function setSidebarOpen(open) {
  const wasLocked = document.body.classList.contains('sidebar-open');
  sidebar.classList.toggle('open', open);

  if (!mobileSidebarMedia.matches) {
    document.body.classList.remove('sidebar-open');
    document.body.style.top = '';
    if (wasLocked) window.scrollTo(0, sidebarPageScroll);
    updateScrollToTopButton();
    return;
  }

  if (open && !wasLocked) {
    sidebarPageScroll = window.scrollY;
    document.body.style.top = `-${sidebarPageScroll}px`;
    document.body.classList.add('sidebar-open');
  } else if (!open && wasLocked) {
    document.body.classList.remove('sidebar-open');
    document.body.style.top = '';
    window.scrollTo(0, sidebarPageScroll);
  }
  updateScrollToTopButton();
}

function updateScrollToTopButton() {
  const shouldShow = !appShell.hidden && window.scrollY > 160 && !document.body.classList.contains('sidebar-open');
  scrollToTopButton.classList.toggle('visible', shouldShow);
}

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

function loginError(code, status = 0) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function classifyLoginFailure(response, data) {
  if (response.ok) {
    if (!data || typeof data !== 'object' || !data.token || !data.record) return 'LOGIN_INVALID_RESPONSE';
    if (!data.record.active) return 'LOGIN_INACTIVE';
    return '';
  }

  if ([400, 401, 403].includes(response.status)) return 'LOGIN_REJECTED';
  if (response.status === 429) return 'LOGIN_RATE_LIMITED';
  if (response.status >= 500) return 'LOGIN_SERVER_ERROR';
  return 'LOGIN_REQUEST_FAILED';
}

function loginErrorMessage(error) {
  const code = error?.code || error?.message;
  if (code === 'LOGIN_NETWORK') {
    return '로그인 서버에 연결할 수 없습니다. 인터넷 연결 또는 DNS 설정을 확인한 뒤 다시 시도해 주세요.';
  }
  if (code === 'LOGIN_REJECTED') {
    return '아이디 또는 비밀번호가 맞지 않거나 사용이 중지된 계정입니다.';
  }
  if (code === 'LOGIN_INACTIVE') {
    return '사용이 중지된 계정입니다. 운영자에게 문의해 주세요.';
  }
  if (code === 'LOGIN_RATE_LIMITED') {
    return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (code === 'LOGIN_SERVER_ERROR') {
    return '로그인 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (code === 'LOGIN_INVALID_RESPONSE') {
    return '로그인 응답을 확인하지 못했습니다. 운영자에게 문의해 주세요.';
  }
  return '로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

async function login(loginId, password) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/collections/members/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identity: loginId, password }),
      cache: 'no-store'
    });
  } catch {
    throw loginError('LOGIN_NETWORK');
  }
  const data = await response.json().catch(() => null);
  const failure = classifyLoginFailure(response, data);
  if (failure) throw loginError(failure, response.status);
  saveAuth(data);
}

async function refreshAuth() {
  const data = await apiRequest('/api/collections/members/auth-refresh', { method: 'POST' });
  if (!data?.record?.active) throw new Error('INACTIVE_MEMBER');
  saveAuth(data);
}

function showLogin(message = '') {
  setSidebarOpen(false);
  appShell.hidden = true;
  signupView.hidden = true;
  passwordChangeView.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
  $('#password').value = '';
  $('#loginId').focus();
}

function showSignup() {
  appShell.hidden = true;
  passwordChangeView.hidden = true;
  loginView.hidden = true;
  signupView.hidden = false;
  signupMessage.textContent = '';
  signupRequestForm.reset();
  signupRequestForm.elements.name.focus();
}

function showPasswordChange() {
  appShell.hidden = true;
  loginView.hidden = true;
  signupView.hidden = true;
  passwordChangeView.hidden = false;
  passwordChangeMessage.textContent = '';
  $('#temporaryPassword').value = '';
  $('#newPassword').value = '';
  $('#newPasswordConfirm').value = '';
  $('#temporaryPassword').focus();
}

function showApp() {
  loginView.hidden = true;
  signupView.hidden = true;
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
  renderAdminFinanceDelegationControls();
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

function isAdminFinanceDelegate() {
  return isAdmin() && auth?.record?.role !== 'treasurer';
}

function renderAdminFinanceDelegationControls() {
  const delegated = isAdminFinanceDelegate();
  document.querySelectorAll('[data-admin-finance-delegation]').forEach((node) => {
    node.hidden = !delegated;
    const input = node.querySelector('textarea');
    if (input) {
      input.required = delegated;
      if (!delegated) input.value = '';
    }
  });
  $('#adminFinanceDelegationNotice').hidden = !delegated;
}

function memberRoleLabels(member) {
  if (member.isAdmin && member.role === 'chair') return ['회장', '관리자'];
  if (member.isAdmin && member.role === 'treasurer') return ['총무', '관리자'];
  if (member.isAdmin) return ['관리자'];
  return [roleLabel(member.role)];
}

function memberRoleLabel(member) {
  return memberRoleLabels(member).join(' · ');
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

function eventTypeLabel(type) {
  if (type === 'travel') return '여행';
  if (type === 'special_meeting') return '특별모임';
  return '정기모임';
}

function eventStatusLabel(status) {
  if (status === 'completed') return '완료';
  if (status === 'cancelled') return '취소';
  return '예정';
}

function plainText(html) {
  const parsed = new DOMParser().parseFromString(html || '', 'text/html');
  return parsed.body.textContent?.trim() || '';
}

function ruleMarkdown(rule) {
  return String(rule?.contentMarkdown || rule?.content || '').trim();
}

const historicalOfficerCountStart = '<!-- bolsso:historical-officer-counts:start -->';
const historicalOfficerCountEnd = '<!-- bolsso:historical-officer-counts:end -->';

function markdownTableCells(line) {
  const text = String(line || '').trim().replace(/^\|\s?/, '').replace(/\s?\|$/, '');
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
}

function isMarkdownTableDivider(line) {
  if (!String(line || '').includes('|')) return false;
  const dividerCells = markdownTableCells(line);
  return dividerCells.length > 1 && dividerCells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function historicalOfficerTableFromMarkdown(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^#{1,6}\s+역대\s+임원진\s*$/.test(lines[index].trim())) continue;
    let headerIndex = index + 1;
    while (headerIndex < lines.length && !lines[headerIndex].trim()) headerIndex += 1;
    const headers = markdownTableCells(lines[headerIndex]);
    if (headers[0] !== '구분' || !isMarkdownTableDivider(lines[headerIndex + 1])) continue;

    const rows = [];
    let cursor = headerIndex + 2;
    while (cursor < lines.length && lines[cursor].trim() && lines[cursor].includes('|')) {
      const row = markdownTableCells(lines[cursor]);
      if (row[0] === '회장' || row[0] === '총무') rows.push(row);
      cursor += 1;
    }
    if (rows.length) return { headers, rows, end: cursor };
  }
  return null;
}

function isOfficerName(value) {
  const name = String(value || '').replace(/\*\*/g, '').trim();
  return name && !['-', '—', '없음', '미정', '공석'].includes(name);
}

function removeHistoricalOfficerCountSection(lines) {
  const markerStart = lines.indexOf(historicalOfficerCountStart);
  const markerEnd = lines.indexOf(historicalOfficerCountEnd);
  if (markerStart >= 0 && markerEnd >= markerStart) {
    lines.splice(markerStart, markerEnd - markerStart + 1);
    return;
  }

  const summaryIndex = lines.findIndex((line) => /^#{1,6}\s+역대\s+임원진\s+역임\s+횟수\s*$/.test(line.trim()));
  if (summaryIndex < 0) return;
  const level = (lines[summaryIndex].match(/^(#+)/) || ['', ''])[1].length;
  let end = summaryIndex + 1;
  while (end < lines.length) {
    const heading = lines[end].match(/^(#+)\s+/);
    if (heading && heading[1].length <= level) break;
    end += 1;
  }
  lines.splice(summaryIndex, end - summaryIndex);
}

function updateHistoricalOfficerCounts(markdown) {
  const source = String(markdown || '').replace(/\r/g, '');
  const lines = source.split('\n');
  removeHistoricalOfficerCountSection(lines);
  const table = historicalOfficerTableFromMarkdown(lines);
  if (!table) return { markdown: source, count: 0, changed: false };

  const counts = new Map();
  table.rows.forEach((row) => {
    row.slice(1, table.headers.length).forEach((value) => {
      if (!isOfficerName(value)) return;
      const name = String(value).replace(/\*\*/g, '').trim();
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  });
  if (!counts.size) return { markdown: source, count: 0, changed: false };

  const countLines = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'ko'))
    .map(([name, count]) => `${name} - ${count}회`);
  lines.splice(table.end, 0, '', historicalOfficerCountStart, '### 역대 임원진 역임 횟수', '', ...countLines, historicalOfficerCountEnd, '');
  const next = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
  return { markdown: next, count: counts.size, changed: next !== source };
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
    if (!/^구분\s*$/.test(lines[startIndex])) return null;
    const years = [];
    let cursor = startIndex + 1;
    const skipBlankLines = () => {
      while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
    };
    skipBlankLines();
    while (/^(?:19|20)\d{2}(?:년)?$/.test(lines[cursor]?.trim() || '')) {
      years.push(lines[cursor].trim().replace(/년$/, ''));
      cursor += 1;
      skipBlankLines();
    }
    if (years.length < 2) return null;

    const officerRoles = /^(회장|부회장|총무|감사|서기)$/;
    const rows = [];
    while (cursor < lines.length) {
      const match = lines[cursor].trim().match(/^(회장|부회장|총무|감사|서기)(?:\s*[:|]\s*|\s+)?(.*)$/);
      if (!match || !officerRoles.test(match[1])) break;
      const values = match[2] ? match[2].trim().split(/\s+/) : [];
      cursor += 1;
      // PDF·문서 변환본은 역할과 각 연도 담당자를 줄마다 나눠 둘 수 있다.
      while (values.length < years.length && cursor < lines.length) {
        skipBlankLines();
        const value = lines[cursor]?.trim() || '';
        if (!value || officerRoles.test(value) || /^(?:19|20)\d{2}(?:년)?$/.test(value) || /^(#{1,3}\s|제?\d+\s*[장조항.])/.test(value)) break;
        values.push(value);
        cursor += 1;
      }
      rows.push([match[1], ...values]);
      skipBlankLines();
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
    } else if (line.includes('|') && isMarkdownTableDivider(lines[index + 1] || '')) {
      closeList();
      const rowLines = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rowLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      addTable(markdownTableCells(line), rowLines.map(markdownTableCells));
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
    const roles = memberRoleLabels(member);
    const row = document.createElement('div');
    row.className = 'record-row';
    const avatar = document.createElement('span');
    avatar.className = 'avatar tiny';
    avatar.textContent = member.name?.trim().charAt(0) || '회';
    const info = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = member.name || '이름 없음';
    const detail = document.createElement('small');
    detail.textContent = roles.join(' · ');
    info.append(name, detail);
    const badgeGroup = document.createElement('span');
    badgeGroup.className = 'role-badge-group';
    roles.forEach((role) => {
      const badge = document.createElement('span');
      badge.className = `role-badge ${role === '일반 회원' ? '' : 'operator'}`;
      badge.textContent = role;
      badgeGroup.append(badge);
    });
    row.append(avatar, info, badgeGroup);
    list.append(row);
  });
}

function renderMemberRecords(items) {
  const list = $('#memberRecordList');
  if (!list) return;
  list.replaceChildren();
  if (!items.length) return appendEmpty(list, '등록된 회원이 없습니다.');

  [...items]
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ko'))
    .forEach((member) => {
      const row = document.createElement('div');
      row.className = 'record-row';
      const info = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = member.name || '이름 없음';
      const detail = document.createElement('small');
      const status = member.active ? '활성' : '비활성';
      detail.textContent = [`ID ${member.loginId || '미발급'}`, status, memberRoleLabel(member)].join(' · ');
      info.append(name, detail);
      const badge = document.createElement('span');
      badge.className = `role-badge ${member.active ? 'operator' : ''}`;
      badge.textContent = member.isAdmin ? '시스템 관리자' : status;
      row.append(info, badge);
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

function renderEvents(events, attendees, members) {
  const list = $('#eventList');
  list.replaceChildren();
  if (!events.length) return appendEmpty(list, '등록된 모임·여행 일정이 없습니다.');
  events.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'record-row event-row';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = `${eventTypeLabel(event.type)} · ${event.title}`;
    const detail = document.createElement('small');
    const participantNames = attendees
      .filter((attendee) => attendee.event === event.id && attendee.status !== 'absent')
      .map((attendee) => members.find((member) => member.id === attendee.member)?.name || '회원');
    detail.textContent = [
      formatDate(event.scheduledAt),
      event.location,
      eventStatusLabel(event.status),
      participantNames.length ? `참석 ${participantNames.join(', ')}` : '참석자 미등록',
      event.note
    ].filter(Boolean).join(' · ');
    info.append(title, detail);
    const badge = document.createElement('span');
    badge.className = `event-status ${event.status}`;
    badge.textContent = eventStatusLabel(event.status);
    row.append(info, badge);
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
    ['회원 목록', apiRequest(listPath('member_directory', { sort: '-joinedAt' }))],
    ['회비 기간', apiRequest(listPath('dues_periods', { sort: '-year,-month' }))],
    ['납부 현황', apiRequest(listPath('member_dues_status', { sort: 'memberName' }))],
    ['회비 사용', apiRequest(listPath('member_transactions', { sort: '-transactedAt', perPage: '20' }))],
    ['모임·여행 일정', apiRequest(listPath('events', { sort: '-scheduledAt' }))],
    ['참석자 명단', apiRequest(listPath('event_attendees'))],
    ['운영 규약', apiRequest(listPath('rules', { sort: '-savedAt', filter: 'published = true', perPage: '1' }))]
  ];
  const results = await Promise.allSettled(requests.map(([, request]) => request));
  if (!auth || results.some((result) => result.status === 'rejected' && result.reason?.message === 'SESSION_EXPIRED')) return;

  const items = results.map((result) => result.status === 'fulfilled' ? result.value.items : []);
  const [members, periods, dues, transactions, events, attendees, rules] = items;
  const currentPeriod = periods.find((item) => item.status === 'open') || periods[0] || null;
  renderMembers(members);
  renderDues(currentPeriod, dues);
  renderTransactions(transactions);
  renderEvents(events, attendees, members);
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

let operationData = { members: [], directory: [], terms: [], policies: [], periods: [], payments: [], transactions: [], audits: [], rules: [], events: [], eventAttendees: [], signupRequests: [] };
let ruleRevisionDraft = null;
let ruleRevisionMetadataManual = false;

function toPbDate(value) {
  return value ? `${value} 00:00:00.000Z` : '';
}

function fieldMessage(form, message, ok = false) {
  const node = form.querySelector('[data-message]');
  if (!node) return;
  node.textContent = message;
  node.style.color = ok ? '#527760' : '';
}

function sortRulesByLastSaved(items) {
  return [...items].sort((left, right) => {
    const leftSavedAt = String(left.savedAt || left.effectiveDate || '');
    const rightSavedAt = String(right.savedAt || right.effectiveDate || '');
    return rightSavedAt.localeCompare(leftSavedAt);
  });
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
    const delegation = item.adminDelegated
      ? `관리자 대행${item.adminDelegationReason ? `: ${item.adminDelegationReason}` : ''}`
      : '';
    detail.textContent = [formatDate(item.transactedAt), item.memo, delegation].filter(Boolean).join(' · ');
    info.append(title, detail);
    const amount = document.createElement('b');
    amount.className = item.type === 'income' ? 'income' : 'expense';
    amount.textContent = `${item.type === 'income' ? '+' : '-'} ${formatWon(item.amount)}`;
    row.append(info, amount);
    list.append(row);
  });
}

function renderAdminFinanceDelegations(items) {
  const list = $('#adminFinanceDelegationList');
  list.replaceChildren();
  const delegated = items.filter((item) => item.adminDelegated).slice(0, 20);
  if (!delegated.length) return appendEmpty(list, '관리자 대행 처리 기록이 없습니다.');
  delegated.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'record-row transaction-row';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = `관리자 대행 · ${item.category}`;
    const detail = document.createElement('small');
    detail.textContent = [formatDate(item.transactedAt), item.entryStatus === 'confirmed' ? '확정' : '초안', item.adminDelegationReason].filter(Boolean).join(' · ');
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
    const revise = document.createElement('button');
    revise.type = 'button';
    revise.className = 'text-button';
    revise.textContent = '개정하기';
    revise.addEventListener('click', () => startRuleRevision(rule));
    actions.append(revise);
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

function currentRuleRevision() {
  return operationData.rules.find((rule) => rule.published) || operationData.rules[0] || null;
}

async function deleteOlderRuleRevisions() {
  const button = $('#deleteOlderRuleRevisions');
  const message = $('#ruleRevisionCleanupMessage');
  const current = currentRuleRevision();
  if (!current) {
    message.textContent = '보존할 규약이 없습니다.';
    return;
  }
  const older = operationData.rules.filter((rule) => rule.id !== current.id);
  if (!older.length) {
    message.textContent = '현재 규약만 있어 삭제할 이전 이력이 없습니다.';
    return;
  }
  if (!window.confirm(`현재 게시본 1개를 남기고 이전 개정본 ${older.length}개를 영구 삭제합니다. 계속할까요?`)) return;

  button.disabled = true;
  message.textContent = '이전 개정 이력을 삭제 중…';
  try {
    await Promise.all(older.map((rule) => apiRequest(`/api/collections/rules/records/${encodeURIComponent(rule.id)}`, { method: 'DELETE' })));
    message.textContent = `현재 규약 1개를 남기고 이전 개정 이력 ${older.length}개를 삭제했습니다.`;
    await refreshAllData();
  } catch {
    message.textContent = '일부 이력을 삭제하지 못했습니다. 새로고침 후 다시 확인해 주세요.';
  } finally {
    button.disabled = false;
  }
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

function createTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const random = new Uint32Array(14);
  window.crypto.getRandomValues(random);
  return `M-${Array.from(random, (value) => alphabet[value % alphabet.length]).join('')}`;
}

async function approveSignupRequest(request, button) {
  if (!window.confirm(`${request.name}님의 가입 요청을 승인할까요?`)) return;
  const notice = $('#signupApprovalMessage');
  const temporaryPassword = createTemporaryPassword();
  button.disabled = true;
  notice.textContent = '';
  try {
    await apiRequest('/api/collections/members/records', {
      method: 'POST',
      body: JSON.stringify({
        name: request.name,
        loginId: request.loginId,
        password: temporaryPassword,
        passwordConfirm: temporaryPassword,
        role: 'member',
        isAdmin: false,
        active: true,
        mustChangePassword: true,
        joinedAt: new Date().toISOString()
      })
    });
    await apiRequest(`/api/collections/signup_requests/records/${encodeURIComponent(request.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' })
    });
    await refreshAllData();
    notice.textContent = `${request.name}님 승인 완료. 전달할 임시 비밀번호: ${temporaryPassword} (화면을 닫거나 새로고침하면 다시 볼 수 없습니다.)`;
  } catch {
    button.disabled = false;
    notice.textContent = '승인하지 못했습니다. 같은 아이디의 회원이 이미 있는지 확인해 주세요.';
  }
}

async function rejectSignupRequest(request, button) {
  if (!window.confirm(`${request.name}님의 가입 요청을 거절할까요?`)) return;
  const notice = $('#signupApprovalMessage');
  button.disabled = true;
  notice.textContent = '';
  try {
    await apiRequest(`/api/collections/signup_requests/records/${encodeURIComponent(request.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' })
    });
    await refreshAllData();
    notice.textContent = `${request.name}님의 가입 요청을 거절했습니다. 휴대폰번호는 삭제되었습니다.`;
  } catch {
    button.disabled = false;
    notice.textContent = '가입 요청을 처리하지 못했습니다.';
  }
}

function renderSignupRequests(items) {
  const list = $('#signupRequestList');
  list.replaceChildren();
  if (!items.length) return appendEmpty(list, '대기 중인 회원가입 요청이 없습니다.');
  items.forEach((request) => {
    const row = document.createElement('div');
    row.className = 'record-row';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = request.name;
    const detail = document.createElement('small');
    detail.textContent = `아이디 ${request.loginId} · 휴대폰 ${request.phone} · ${formatDate(request.requestedAt)} 요청`;
    info.append(title, detail);
    const actions = document.createElement('span');
    actions.className = 'record-actions';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'text-button';
    approve.textContent = '승인';
    approve.addEventListener('click', () => approveSignupRequest(request, approve));
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'text-button danger-button';
    reject.textContent = '거절';
    reject.addEventListener('click', () => rejectSignupRequest(request, reject));
    actions.append(approve, reject);
    row.append(info, actions);
    list.append(row);
  });
}

function renderOperationControls() {
  const members = operationData.members;
  const activeMembers = members.filter((member) => member.active);
  setOptions($('#adminMemberSelect'), members, (member) => `${member.name} · ${member.loginId}`);
  setOptions($('#resetMemberSelect'), members, (member) => `${member.name} · ${member.loginId}`);
  setOptions($('#termMemberSelect'), activeMembers, (member) => `${member.name} · ${member.loginId}`);
  setOptions($('#eventAttendanceEventSelect'), operationData.events, (event) => `${formatDate(event.scheduledAt)} · ${eventTypeLabel(event.type)} · ${event.title}`);
  setOptions($('#eventAttendanceMemberSelect'), activeMembers, (member) => member.name);
  setOptions($('#eventRecordEventSelect'), operationData.events, (event) => `${formatDate(event.scheduledAt)} · ${eventTypeLabel(event.type)} · ${event.title}`);
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
  renderMemberRecords(isAdmin() ? members : []);
  renderTerms(operationData.terms);
  renderRuleRevisions(operationData.rules);
  renderChairLedger(operationData.chairLedger || []);
  renderAdminFinanceDelegations(operationData.transactions);
  renderAudit(operationData.audits);
  renderSignupRequests(operationData.signupRequests);
  renderAdminFinanceDelegationControls();
}

async function loadOperations() {
  $('#adminPanel').hidden = !isAdmin();
  $('#chairPanel').hidden = !canManageRules();
  $('#treasurerPanel').hidden = !canManageFinance();
  $('#auditPanel').hidden = !(isAdmin() || canManageRules() || canManageFinance());
  if (!isAdmin() && !canManageRules() && !canManageFinance()) return;

  const requests = [
    ['directory', apiRequest(listPath('member_directory', { sort: '-joinedAt' }))],
    ['terms', apiRequest(listPath('officer_terms', { sort: '-year,office' }))]
  ];
  if (isAdmin()) requests.push(
    ['members', apiRequest(listPath('members', { sort: '-joinedAt' }))],
    ['signupRequests', apiRequest(listPath('signup_requests', { sort: '-requestedAt', filter: 'status = "pending"' }))]
  );
  if (canManageFinance()) requests.push(
    ['policies', apiRequest(listPath('dues_policies', { sort: '-year' }))],
    ['periods', apiRequest(listPath('dues_periods', { sort: '-year,-month' }))],
    ['payments', apiRequest(listPath('dues_payments'))],
    ['transactions', apiRequest(listPath('transactions', { sort: '-transactedAt' }))]
  );
  if (canManageRules()) requests.push(
    ['chairLedger', apiRequest(listPath('chair_ledger', { sort: '-transactedAt' }))],
    ['rules', apiRequest(listPath('rules', { sort: '-savedAt' }))],
    ['events', apiRequest(listPath('events', { sort: '-scheduledAt' }))],
    ['eventAttendees', apiRequest(listPath('event_attendees'))]
  );
  if (isAdmin() || canManageRules() || canManageFinance()) requests.push(['audits', apiRequest(listPath('audit_logs', { sort: '-occurredAt' }))]);

  const results = await Promise.allSettled(requests.map(([, request]) => request));
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const key = requests[index][0];
    operationData[key] = key === 'rules' ? sortRulesByLastSaved(result.value.items) : result.value.items;
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

$('#openSignup').addEventListener('click', showSignup);
$('#backToLogin').addEventListener('click', () => showLogin());

const signupPhoneInput = signupRequestForm.elements.phone;
signupPhoneInput.addEventListener('input', () => {
  signupPhoneInput.value = signupPhoneInput.value.replace(/\D/g, '');
});

signupRequestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(signupRequestForm);
  const name = String(data.get('name')).trim();
  const phone = String(data.get('phone')).replace(/\D/g, '');
  const loginId = String(data.get('loginId')).trim().toLowerCase();
  if (name.length < 2 || phone.length < 8 || phone.length > 15 || !/^[a-z0-9][a-z0-9._-]{3,39}$/.test(loginId)) {
    signupMessage.textContent = '이름, 숫자 8~15자리 휴대폰번호, 영문 소문자·숫자 4자 이상의 아이디를 확인해 주세요.';
    return;
  }
  const button = signupRequestForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '요청 보내는 중…';
  signupMessage.textContent = '';
  try {
    const response = await fetch(`${API_BASE}/api/collections/signup_requests/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, phone, loginId }),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('SIGNUP_REQUEST_FAILED');
    signupRequestForm.reset();
    signupMessage.textContent = '가입 요청을 접수했습니다. 운영자 승인 후 임시 비밀번호를 안내받아 로그인해 주세요.';
  } catch {
    signupMessage.textContent = '가입 요청을 접수하지 못했습니다. 입력한 정보를 확인하거나 운영자에게 문의해 주세요.';
  } finally {
    button.disabled = false;
    button.textContent = '가입 요청 보내기';
  }
});

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
  } catch (error) {
    clearAuth();
    loginMessage.textContent = loginErrorMessage(error);
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

$('#eventCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await submitJsonForm(form, '/api/collections/events/records', {
    title: String(data.get('title')).trim(),
    type: String(data.get('type')),
    scheduledAt: toPbDate(String(data.get('scheduledAt'))),
    location: String(data.get('location')).trim(),
    note: String(data.get('note')).trim(),
    status: String(data.get('status'))
  }, '일정을 저장했습니다. 참석자 명단을 이어서 등록해 주세요.');
});

$('#eventAttendanceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const eventId = String(data.get('event'));
  const memberId = String(data.get('member'));
  if (!eventId || !memberId) return fieldMessage(form, '일정과 회원을 선택해 주세요.');
  const status = String(data.get('status'));
  const existing = operationData.eventAttendees.find((item) => item.event === eventId && item.member === memberId);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (existing) {
      await apiRequest(`/api/collections/event_attendees/records/${encodeURIComponent(existing.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status })
      });
    } else {
      await apiRequest('/api/collections/event_attendees/records', {
        method: 'POST', body: JSON.stringify({ event: eventId, member: memberId, status })
      });
    }
    fieldMessage(form, '참석자 명단을 저장했습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '참석자 명단을 저장하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

$('#eventRecordEventSelect').addEventListener('change', (event) => {
  const record = operationData.events.find((item) => item.id === event.target.value);
  if (!record) return;
  const form = $('#eventRecordForm');
  form.elements.status.value = record.status;
  form.elements.note.value = record.note || '';
});

$('#eventRecordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const eventId = String(data.get('eventId'));
  if (!eventId) return fieldMessage(form, '기록할 일정을 선택해 주세요.');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest(`/api/collections/events/records/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: String(data.get('status')), note: String(data.get('note')).trim() })
    });
    fieldMessage(form, '일정 기록을 저장했습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '일정 기록을 저장하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

function markdownHeadingFromFilename(filename) {
  return String(filename || '운영 규약').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || '운영 규약';
}

function localDateValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function nextRevisionVersion(version) {
  const current = String(version || '').trim();
  const match = current.match(/^(.*?)(\d+)([^\d]*)$/);
  if (match) return `${match[1]}${Number(match[2]) + 1}${match[3]}`;
  return current ? `${current} 개정` : localDateValue().replaceAll('-', '.');
}

function setRuleRevisionMode(message) {
  $('#ruleRevisionMode').textContent = message;
}

function resetRuleRevisionDraft() {
  const form = $('#ruleManageForm');
  ruleRevisionDraft = null;
  ruleRevisionMetadataManual = false;
  form.reset();
  form.elements.previousRevision.value = '';
  form.elements.effectiveDate.value = localDateValue();
  form.elements.published.checked = false;
  setRuleRevisionMode('새 제정 초안입니다. 기존 개정본을 선택하거나 이력의 개정하기를 누르면 원문을 불러옵니다.');
}

function startRuleRevision(rule) {
  if (!rule) return;
  const form = $('#ruleManageForm');
  ruleRevisionDraft = {
    id: rule.id,
    markdown: ruleMarkdown(rule),
    version: rule.version || '',
    effectiveDate: String(rule.effectiveDate || '').slice(0, 10)
  };
  ruleRevisionMetadataManual = false;
  form.elements.previousRevision.value = rule.id;
  form.elements.title.value = rule.title || '';
  form.elements.version.value = ruleRevisionDraft.version;
  form.elements.effectiveDate.value = ruleRevisionDraft.effectiveDate;
  form.elements.revisionNote.value = '';
  form.elements.contentMarkdown.value = ruleRevisionDraft.markdown;
  form.elements.sourceDocument.value = '';
  form.elements.published.checked = false;
  setRuleRevisionMode(`${rule.version || '기존'} 개정본을 불러왔습니다. 원문을 수정하면 새 버전과 오늘 시행일이 자동 설정됩니다. 기본값은 비공개 초안입니다.`);
  $('#ruleManageForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.contentMarkdown.focus();
}

function syncRuleRevisionMetadata() {
  const form = $('#ruleManageForm');
  if (!ruleRevisionDraft) return;
  const changed = form.elements.contentMarkdown.value.trim() !== ruleRevisionDraft.markdown.trim();
  if (!changed) {
    if (!ruleRevisionMetadataManual) {
      form.elements.version.value = ruleRevisionDraft.version;
      form.elements.effectiveDate.value = ruleRevisionDraft.effectiveDate;
    }
    return;
  }
  if (!ruleRevisionMetadataManual) {
    form.elements.version.value = nextRevisionVersion(ruleRevisionDraft.version);
    form.elements.effectiveDate.value = localDateValue();
  }
  if (!form.elements.revisionNote.value.trim()) form.elements.revisionNote.value = `${localDateValue()} 원문 수정`;
  setRuleRevisionMode(`원문 수정이 감지됐습니다. 버전 ${form.elements.version.value || '새 버전'}와 시행일 ${form.elements.effectiveDate.value}이 자동 설정됐습니다.`);
}

function normalizeExtractedMarkdown(text, filename) {
  const cleaned = String(text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) throw new Error('NO_TEXT');
  return cleaned.startsWith('#') ? cleaned : `# ${markdownHeadingFromFilename(filename)}\n\n${cleaned}`;
}

function isMarkdownSource(file) {
  return /\.(md|markdown)$/i.test(String(file?.name || ''));
}

function prepareRuleDraftForSource() {
  const form = $('#ruleManageForm');
  if (!form.elements.previousRevision.value && operationData.rules.length) {
    const baseRule = operationData.rules.find((rule) => rule.published) || operationData.rules[0];
    startRuleRevision(baseRule);
  }
  if (!operationData.rules.length) {
    form.elements.effectiveDate.value = localDateValue();
    if (!form.elements.version.value.trim()) form.elements.version.value = '1.0';
    if (!form.elements.revisionNote.value.trim()) form.elements.revisionNote.value = '최초 제정';
  }
}

async function convertRuleSourceToMarkdown(file) {
  if (isMarkdownSource(file)) return normalizeExtractedMarkdown(await file.text(), file.name);
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
  prepareRuleDraftForSource();
  note.textContent = isMarkdownSource(file) ? 'Markdown 원문을 편집기에 불러오는 중…' : 'NAS 내부 MarkItDown으로 PDF 원문을 Markdown 초안으로 만드는 중…';
  try {
    const markdown = await convertRuleSourceToMarkdown(file);
    const form = $('#ruleManageForm');
    const officerCounts = updateHistoricalOfficerCounts(markdown);
    form.elements.contentMarkdown.value = officerCounts.markdown;
    syncRuleRevisionMetadata();
    if (!form.elements.title.value.trim()) form.elements.title.value = markdownHeadingFromFilename(file.name);
    note.textContent = ruleRevisionDraft
      ? `기존 개정본을 승계했습니다.${officerCounts.count ? ` 역대 임원진 ${officerCounts.count}명의 역임 횟수도 자동 집계했습니다.` : ''} 원문을 검토한 뒤 새 버전과 오늘 시행일로 저장해 주세요.`
      : `Markdown 초안을 채웠습니다.${officerCounts.count ? ` 역대 임원진 ${officerCounts.count}명의 역임 횟수도 자동 집계했습니다.` : ''} 내용과 줄바꿈을 검토한 뒤 저장해 주세요.`;
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
  if (!rule) return resetRuleRevisionDraft();
  startRuleRevision(rule);
});

$('#resetRuleRevisionDraft').addEventListener('click', resetRuleRevisionDraft);
$('#deleteOlderRuleRevisions').addEventListener('click', deleteOlderRuleRevisions);

$('#ruleManageForm').elements.contentMarkdown.addEventListener('input', syncRuleRevisionMetadata);
['version', 'effectiveDate'].forEach((name) => {
  $('#ruleManageForm').elements[name].addEventListener('input', () => { ruleRevisionMetadataManual = true; });
});

$('#ruleManageForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const officerCounts = updateHistoricalOfficerCounts(form.elements.contentMarkdown.value);
  if (officerCounts.changed) {
    form.elements.contentMarkdown.value = officerCounts.markdown;
    syncRuleRevisionMetadata();
  }
  const data = new FormData(form);
  const markdown = String(data.get('contentMarkdown')).trim();
  if (ruleRevisionDraft && String(data.get('previousRevision') || '') === ruleRevisionDraft.id && markdown === ruleRevisionDraft.markdown.trim()) {
    return fieldMessage(form, '원문을 수정한 뒤 새 개정본을 저장해 주세요.');
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  fieldMessage(form, officerCounts.count ? `역대 임원진 ${officerCounts.count}명의 역임 횟수를 자동 집계해 NAS에 저장 중…` : 'NAS에 규약을 저장 중…');
  try {
    const payload = new FormData();
    payload.set('title', String(data.get('title')).trim());
    payload.set('version', String(data.get('version')).trim());
    payload.set('effectiveDate', toPbDate(String(data.get('effectiveDate'))));
    payload.set('content', markdown);
    payload.set('contentMarkdown', markdown);
    payload.set('revisionNote', String(data.get('revisionNote')).trim());
    const previousRevision = String(data.get('previousRevision') || '');
    if (previousRevision) payload.set('previousRevision', previousRevision);
    payload.set('published', data.get('published') === 'on' ? 'true' : 'false');
    const sourceDocument = data.get('sourceDocument');
    if (sourceDocument instanceof File && sourceDocument.size) payload.set('sourceDocument', sourceDocument);
    await apiRequest('/api/collections/rules/records', { method: 'POST', body: payload });
    resetRuleRevisionDraft();
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
  const delegationReason = String(data.get('adminDelegationReason') || '').trim();
  if (isAdminFinanceDelegate() && delegationReason.length < 5) return fieldMessage(form, '관리자 대행 사유를 5자 이상 입력해 주세요.');
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
    payload.set('adminDelegationReason', delegationReason);
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
  const delegationReason = String(data.get('adminDelegationReason') || '').trim();
  if (isAdminFinanceDelegate() && delegationReason.length < 5) return fieldMessage(form, '관리자 대행 사유를 5자 이상 입력해 주세요.');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest(`/api/collections/transactions/records/${encodeURIComponent(transactionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ entryStatus: 'confirmed', adminDelegationReason: delegationReason })
    });
    fieldMessage(form, '장부를 확정했습니다. 회장은 읽기 전용으로 확인할 수 있으며 확정 장부는 수정·삭제할 수 없습니다.', true);
    await refreshAllData();
  } catch {
    fieldMessage(form, '장부를 확정하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});

$('#logoutButton').addEventListener('click', () => {
  setSidebarOpen(false);
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

$('.menu-button').addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
  link.classList.add('active');
  setSidebarOpen(false);
}));
mobileSidebarMedia.addEventListener('change', () => setSidebarOpen(false));
window.addEventListener('scroll', updateScrollToTopButton, { passive: true });
scrollToTopButton.addEventListener('click', () => {
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  window.scrollTo({ top: 0, behavior });
});
updateScrollToTopButton();

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
