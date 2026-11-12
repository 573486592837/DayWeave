const dict = {
  'zh-CN': {
    subtitle: '私人日程，内网常驻',
    login: '请输入访问密码',
    setup: '首次使用，请设置访问密码',
    password: '访问密码',
    confirm: '确认密码',
    enter: '进入 DayWeave',
    setupEnter: '设置并进入',
    mismatch: '两次输入的密码不一致',
    tooShort: '密码至少 4 位',
    bad: '密码错误，请重试',
    limited: '尝试次数过多，请一分钟后再试',
    net: '无法连接服务器，请确认服务已启动',
    checking: '正在检查…',
    show: '显示密码',
    hide: '隐藏密码',
  },
  'en-US': {
    subtitle: 'A private calendar that lives on your LAN',
    login: 'Enter your access password',
    setup: 'Welcome — set an access password to begin',
    password: 'Access password',
    confirm: 'Confirm password',
    enter: 'Enter DayWeave',
    setupEnter: 'Set password & enter',
    mismatch: 'Passwords do not match',
    tooShort: 'Password must be at least 4 characters',
    bad: 'Incorrect password, try again',
    limited: 'Too many attempts. Please wait a minute',
    net: 'Cannot reach the server. Is it running?',
    checking: 'Checking…',
    show: 'Show password',
    hide: 'Hide password',
  },
};

const $ = (id) => document.getElementById(id);
const card = $('card');
const form = $('form');
const password = $('password');
const confirmInput = $('confirm');
const confirmGroup = $('confirmGroup');
const errorEl = $('error');
const submit = $('submit');
const peek = $('peek');

let lang = localStorage.getItem('dw_lang') || (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');
let mode = 'login';
let busy = false;
const t = (key) => dict[lang][key] || dict['zh-CN'][key] || key;

const eyeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeOffIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.5 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.5A17 17 0 0 0 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

function setLang(next) {
  lang = next;
  localStorage.setItem('dw_lang', next);
  document.documentElement.lang = next;
  $('langToggle').textContent = next === 'zh-CN' ? 'English' : '中文';
  $('subtitle').textContent = t(mode === 'setup' ? 'setup' : 'login');
  $('passwordLabel').textContent = t('password');
  $('confirmLabel').textContent = t('confirm');
  $('submit').textContent = mode === 'setup' ? t('setupEnter') : t('enter');
  $('hint').textContent = t('checking');
  peek.setAttribute('aria-label', password.type === 'password' ? t('show') : t('hide'));
  if (mode === 'setup') password.setAttribute('autocomplete', 'new-password');
  else password.setAttribute('autocomplete', 'current-password');
}

function applyMode() {
  confirmGroup.hidden = mode !== 'setup';
  card.setAttribute('aria-busy', String(busy));
  submit.disabled = busy;
  setLang(lang);
}

function showError(message) {
  errorEl.textContent = message || '';
}

async function boot() {
  setLang(lang);
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.ok) {
      location.replace('/');
      return;
    }
    mode = data.needSetup ? 'setup' : 'login';
    applyMode();
    $('hint').textContent = '';
    password.focus();
  } catch {
    showError(t('net'));
  }
  card.setAttribute('aria-busy', 'false');
}

async function onSubmit(event) {
  event.preventDefault();
  showError('');
  const pw = password.value;
  if (pw.length < 4) return showError(t('tooShort'));
  if (mode === 'setup' && pw !== confirmInput.value) return showError(t('mismatch'));

  busy = true;
  applyMode();
  try {
    const endpoint = mode === 'setup' ? '/api/auth/setup' : '/api/auth/login';
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.status === 204) {
      location.replace('/');
      return;
    }
    let payload = {};
    try {
      payload = await res.json();
    } catch {
      /* 忽略非 JSON 响应 */
    }
    if (res.status === 401) showError(t('bad'));
    else if (res.status === 429) showError(t('limited'));
    else if (payload.error === 'weak_password') showError(t('tooShort'));
    else if (payload.error === 'setup_required') {
      mode = 'setup';
      applyMode();
      showError('');
    } else showError(t('net'));
  } catch {
    showError(t('net'));
  } finally {
    busy = false;
    applyMode();
  }
}

peek.addEventListener('click', () => {
  const showing = password.type === 'text';
  password.type = showing ? 'password' : 'text';
  peek.innerHTML = showing ? eyeIcon : eyeOffIcon;
  peek.setAttribute('aria-label', showing ? t('show') : t('hide'));
});

$('langToggle').addEventListener('click', () => {
  setLang(lang === 'zh-CN' ? 'en-US' : 'zh-CN');
  if ($('hint').textContent === dict['zh-CN'].checking || $('hint').textContent === dict['en-US'].checking) {
    $('hint').textContent = '';
  }
});

password.addEventListener('input', () => {
  if (errorEl.textContent) errorEl.textContent = '';
});

form.addEventListener('submit', onSubmit);
peek.innerHTML = eyeIcon;
boot();
