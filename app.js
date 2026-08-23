const API_BASE = 'https://bolsso-api.tail8a3a4b.ts.net';
const AUTH_KEY = 'bolsso.member.session';

const $ = (selector) => document.querySelector(selector);
const loginView = $('#loginView');
const appShell = $('#appShell');
const loginForm = $('#loginForm');
const loginMessage = $('#loginMessage');
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
      active: data.record.active
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
  if (options.body) headers.set('Content-Type', 'application/json');
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
  loginView.hidden = false;
  loginMessage.textContent = message;
  $('#password').value = '';
  $('#loginId').focus();
}

function showApp() {
  loginView.hidden = true;
  appShell.hidden = false;
  const name = auth.record.name || '회원';
  const initial = name.trim().charAt(0) || '회';
  $('#greetingName').textContent = name;
  $('#sidebarName').textContent = name;
  $('#sidebarRole').textContent = roleLabel(auth.record.role);
  $('#sidebarAvatar').textContent = initial;
  $('#topAvatar').textContent = initial;
}

function roleLabel(role) {
  if (role === 'admin') return '관리자';
  if (role === 'operator') return '운영진';
  return '일반 회원';
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
    detail.textContent = member.joinedAt ? `가입 ${formatDate(member.joinedAt)}` : roleLabel(member.role);
    info.append(name, detail);
    const badge = document.createElement('span');
    badge.className = `role-badge ${member.role === 'member' ? '' : 'operator'}`;
    badge.textContent = roleLabel(member.role);
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
  const paidCount = currentItems.filter((item) => item.paid).length;
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
    badge.className = `payment-badge ${item.paid ? 'paid' : 'unpaid'}`;
    badge.textContent = item.paid ? '납부' : '미납';
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
  button.disabled = !latestRule;
  documentButton.hidden = !latestRule?.document;
  $('#ruleDocumentMessage').textContent = '';
  if (!latestRule) return;
  const text = plainText(latestRule.content);
  $('#ruleTitle').textContent = latestRule.title;
  $('#ruleSummary').textContent = text.slice(0, 120) || '운영 규약 내용을 확인해 주세요.';
  $('#rulesModalTitle').textContent = latestRule.title;
  $('#rulesModalMeta').textContent = [latestRule.version, formatDate(latestRule.effectiveDate)].filter(Boolean).join(' · ');
  $('#rulesModalContent').textContent = text;
}

async function openProtectedRuleDocument() {
  if (!latestRule?.document) return;
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
    const filename = encodeURIComponent(latestRule.document);
    const url = `${API_BASE}/api/files/${collection}/${record}/${filename}?token=${encodeURIComponent(token)}`;
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
    ['회비 사용', apiRequest(listPath('transactions', { sort: '-transactedAt', perPage: '20' }))],
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
    showApp();
    await loadDashboard();
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
    showApp();
    await loadDashboard();
  } catch {
    clearAuth();
    showLogin('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
})();
