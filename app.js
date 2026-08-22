const $ = (selector) => document.querySelector(selector);
const meetingModal = $('#meetingModal');
const rulesModal = $('#rulesModal');

$('#openModal').addEventListener('click', () => meetingModal.showModal());
$('#openRules').addEventListener('click', (event) => { event.preventDefault(); rulesModal.showModal(); });
document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

$('#createMeeting').addEventListener('click', () => {
  const name = $('#meetingName').value.trim();
  if (!name) return $('#meetingName').focus();
  document.querySelector('.meeting-main h3').textContent = name;
  meetingModal.close();
  $('#meetingName').value = '';
});

$('#addTodo').addEventListener('click', () => {
  const text = window.prompt('추가할 일을 입력해 주세요.');
  if (!text?.trim()) return;
  const todo = document.createElement('label');
  todo.className = 'todo';
  todo.innerHTML = `<input type="checkbox" /><span></span><small>새 항목</small>`;
  todo.querySelector('span').textContent = text.trim();
  $('#addTodo').before(todo);
});

$('.menu-button').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
  link.classList.add('active');
  $('.sidebar').classList.remove('open');
}));
