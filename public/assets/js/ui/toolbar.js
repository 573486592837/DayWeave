import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { api } from '../core/api.js';
import { displayName, t } from '../i18n/i18n.js';
import { btn } from './controls.js';
import { iconSvg } from './icons.js';
import { menuItem, menuSeparator, menuTitle, openPopover } from './popover.js';
import { openProfileMenu } from './profiles.js';
import { openThemePicker } from './theme-picker.js';
import { openBackgroundEditor } from './background-editor.js';
import { openSettings } from './settings.js';
import { openLayoutEditor } from '../editor/layout-editor.js';
import { confirmDialog } from './modal.js';

function logout() {
  confirmDialog({
    title: t('settings.logout'),
    message: t('settings.logoutConfirm'),
    confirmText: t('settings.logout'),
  }).then(async (ok) => {
    if (!ok) return;
    await api.logout();
    location.replace('/login.html');
  });
}

export function renderToolbar({ onDisplay, onEditorExit, onViewChange } = {}) {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;
  toolbar.className = 'toolbar';

  const profile = store.activeProfile();
  const profileBtn = h('button', { class: 'btn ghost profile-btn', type: 'button', title: t('profile.switch') }, [
    h('span', { html: iconSvg('layout', 16) }),
    h('span', { class: 'dim tb-label' }, `${t('toolbar.layout')}`),
    h('span', { class: 'ellipsis', style: { maxWidth: '120px' } }, displayName(profile)),
    h('span', { html: iconSvg('chevronDown', 13) }),
  ]);
  profileBtn.addEventListener('click', () => openProfileMenu(profileBtn));

  const editBtn = btn({
    icon: 'edit',
    label: t('toolbar.editLayout'),
    cls: 'desktop-only',
    onClick: () => openLayoutEditor({ onExit: onEditorExit }),
  });
  const bgBtn = btn({
    icon: 'image',
    label: t('toolbar.background'),
    onClick: () => openBackgroundEditor(),
  });
  bgBtn.classList.add('desktop-only');
  const themeBtn = btn({
    icon: 'palette',
    label: t('toolbar.theme'),
    onClick: () => openThemePicker(),
  });
  themeBtn.classList.add('desktop-only');
  const displayBtn = btn({
    icon: 'monitor',
    label: t('toolbar.display'),
    onClick: () => onDisplay?.(),
  });
  displayBtn.classList.add('desktop-only');
  const settingsBtn = btn({
    icon: 'settings',
    label: t('toolbar.settings'),
    onClick: () => openSettings(),
  });
  settingsBtn.classList.add('desktop-only');
  for (const b of [editBtn, bgBtn, themeBtn, displayBtn, settingsBtn]) {
    const label = b.querySelector('.btn-label');
    if (label) label.classList.add('tb-label');
  }

  const mobileMenuBtn = h('button', {
    class: 'btn ghost mobile-only',
    type: 'button',
    title: t('toolbar.menu'),
    'aria-label': t('toolbar.menu'),
  });
  mobileMenuBtn.innerHTML = iconSvg('menu', 18);
  mobileMenuBtn.addEventListener('click', () => {
    const items = [
      menuTitle(t('toolbar.menu')),
      menuItem({ icon: 'image', label: t('toolbar.background'), onClick: () => openBackgroundEditor() }),
      menuItem({ icon: 'palette', label: t('toolbar.theme'), onClick: () => openThemePicker() }),
      menuItem({ icon: 'monitor', label: t('toolbar.display'), onClick: () => onDisplay?.() }),
      menuItem({ icon: 'settings', label: t('toolbar.settings'), onClick: () => openSettings() }),
      menuSeparator(),
      menuTitle(t('settings.language')),
      menuItem({ label: t('settings.localeAuto'), active: store.settings().locale === 'auto', onClick: () => setLanguage('auto') }),
      menuItem({ label: t('settings.localeZh'), active: store.settings().locale === 'zh-CN', onClick: () => setLanguage('zh-CN') }),
      menuItem({ label: t('settings.localeEn'), active: store.settings().locale === 'en-US', onClick: () => setLanguage('en-US') }),
      menuSeparator(),
      menuItem({ icon: 'logout', label: t('settings.logout'), onClick: logout }),
    ];
    openPopover(mobileMenuBtn, items, { align: 'end', width: 190 });
  });

  toolbar.replaceChildren(
    h('div', { class: 'brand' }, [
      h('img', { src: '/assets/img/logo.svg', alt: '' }),
      h('span', {}, 'DayWeave'),
    ]),
    profileBtn,
    h('div', { class: 'toolbar-spacer' }),
    h('div', { class: 'toolbar-group desktop-only' }, [editBtn, bgBtn, themeBtn, displayBtn, settingsBtn]),
    mobileMenuBtn,
  );

  renderMobileTabs({ onViewChange });
}

function setLanguage(locale) {
  store.update((data) => {
    data.settings.locale = locale;
  }, { reason: 'settings' });
}

function renderMobileTabs({ onViewChange } = {}) {
  const wrap = document.getElementById('mobile-tabs');
  if (!wrap) return;
  wrap.replaceChildren();
  const profile = store.activeProfile();
  const calendar = profile?.widgets.find((w) => w.type === 'calendar');
  const active = calendar?.config?.view || store.settings().defaultView;
  for (const view of ['day', 'week', 'month']) {
    wrap.append(
      h('button', {
        type: 'button',
        class: active === view ? 'active' : '',
        onclick: () => {
          onViewChange?.(view);
          renderMobileTabs({ onViewChange });
        },
      }, t(`view.${view}`)),
    );
  }
}
