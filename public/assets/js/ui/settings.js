import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { api } from '../core/api.js';
import { t } from '../i18n/i18n.js';
import { formatClock } from '../i18n/format.js';
import { btn, sectionTitle, segmented, select, toggle } from './controls.js';
import { confirmDialog, openModal } from './modal.js';
import { toast } from './toast.js';

const APP_VERSION = '1.1.0';

export function openSettings() {
  let entry;
  const body = h('div');

  const set = (mutator) => {
    store.update((data) => mutator(data.settings), { reason: 'settings' });
  };

  const build = () => {
    const frag = h('div');
    const settings = store.settings();

    frag.append(sectionTitle(t('settings.general')));
    frag.append(
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.language')),
        select(
          [
            { value: 'auto', label: t('settings.localeAuto') },
            { value: 'zh-CN', label: t('settings.localeZh') },
            { value: 'en-US', label: t('settings.localeEn') },
          ],
          settings.locale,
          (v) => set((s) => {
            s.locale = v;
          }),
        ),
      ]),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [
          h('label', {}, t('settings.firstDayOfWeek')),
          select(
            [
              { value: '1', label: t('settings.monday') },
              { value: '0', label: t('settings.sunday') },
            ],
            String(settings.firstDayOfWeek),
            (v) => set((s) => {
              s.firstDayOfWeek = Number(v);
            }),
          ),
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('settings.timeFormat')),
          segmented(
            [
              { value: '24h', label: t('settings.h24') },
              { value: '12h', label: t('settings.h12') },
            ],
            settings.timeFormat,
            (v) => set((s) => {
              s.timeFormat = v;
            }),
          ),
        ]),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.defaultView')),
        segmented(
          [
            { value: 'day', label: t('view.day') },
            { value: 'week', label: t('view.week') },
            { value: 'month', label: t('view.month') },
          ],
          settings.defaultView,
          (v) => set((s) => {
            s.defaultView = v;
          }),
        ),
      ]),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [
          h('label', {}, `${t('settings.dayRange')} · ${t('settings.dayStart')}`),
          select(
            Array.from({ length: 23 }, (_, i) => ({ value: String(i), label: formatClock(i, 0, settings.timeFormat === '12h') })),
            String(settings.dayStartHour),
            (v) => set((s) => {
              s.dayStartHour = Number(v);
              if (s.dayEndHour <= s.dayStartHour) s.dayEndHour = Math.min(24, s.dayStartHour + 1);
            }),
          ),
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, `${t('settings.dayRange')} · ${t('settings.dayEnd')}`),
          select(
            Array.from({ length: 24 }, (_, i) => ({ value: String(i + 1), label: formatClock(i + 1 === 24 ? 0 : i + 1, 0, settings.timeFormat === '12h') })),
            String(settings.dayEndHour),
            (v) => set((s) => {
              s.dayEndHour = Number(v);
            }),
          ),
        ]),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.fontScale')),
        segmented(
          [
            { value: 'sm', label: t('theme.sm') },
            { value: 'md', label: t('theme.md') },
            { value: 'lg', label: t('theme.lg') },
          ],
          settings.fontScale,
          (v) => set((s) => {
            s.fontScale = v;
          }),
        ),
      ]),
    );

    frag.append(sectionTitle(t('settings.display')));
    frag.append(
      toggle(t('settings.displayDefault'), settings.displayModeDefault, (v) => set((s) => {
        s.displayModeDefault = v;
      }), t('settings.displayDefaultHint')),
      toggle(t('settings.performanceMode'), settings.performanceMode, (v) => set((s) => {
        s.performanceMode = v;
      }), t('settings.performanceHint')),
    );

    frag.append(sectionTitle(t('settings.reminder')));
    frag.append(
      toggle(t('settings.reminderEnabled'), settings.reminder.enabled, (v) => set((s) => {
        s.reminder.enabled = v;
      })),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [
          h('label', {}, t('settings.reminderMinutes')),
          h('input', {
            type: 'number',
            min: 0,
            max: 180,
            value: settings.reminder.minutesBefore,
            onchange: (e) => set((s) => {
              s.reminder.minutesBefore = Math.min(180, Math.max(0, Number(e.target.value) || 0));
            }),
          }),
        ]),
        toggle(t('settings.reminderSound'), settings.reminder.sound, (v) => set((s) => {
          s.reminder.sound = v;
        })),
      ]),
      h('p', { class: 'help' }, t('settings.reminderHint')),
    );

    frag.append(sectionTitle(t('settings.security')));
    const oldPw = h('input', { type: 'password', autocomplete: 'current-password' });
    const newPw = h('input', { type: 'password', autocomplete: 'new-password' });
    const confirmPw = h('input', { type: 'password', autocomplete: 'new-password' });
    const pwError = h('p', { class: 'error-text' });
    const pwBtn = btn({
      icon: 'lock',
      label: t('settings.changePassword'),
      variant: 'ghost',
      onClick: async () => {
        pwError.textContent = '';
        if (newPw.value !== confirmPw.value) {
          pwError.textContent = t('settings.passwordMismatch');
          return;
        }
        if (newPw.value.length < 4) {
          pwError.textContent = t('settings.weakPassword');
          return;
        }
        try {
          await api.changePassword(oldPw.value, newPw.value);
          oldPw.value = newPw.value = confirmPw.value = '';
          toast(t('settings.passwordChanged'), { type: 'success', icon: 'lock' });
        } catch (err) {
          pwError.textContent = err.status === 401 ? t('settings.wrongPassword') : t('settings.weakPassword');
        }
      },
    });
    frag.append(
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [h('label', {}, t('settings.oldPassword')), oldPw]),
        h('div', { class: 'field' }, [h('label', {}, t('settings.newPassword')), newPw]),
      ]),
      h('div', { class: 'field' }, [h('label', {}, t('settings.confirmPassword')), confirmPw]),
      pwError,
      pwBtn,
    );

    frag.append(sectionTitle(t('settings.danger')));
    const clearPw = h('input', { type: 'password', placeholder: t('settings.clearNeedPassword'), autocomplete: 'current-password' });
    const clearBtn = btn({
      icon: 'trash',
      label: t('settings.clearData'),
      variant: 'danger',
      onClick: async () => {
        const ok = await confirmDialog({
          title: t('settings.clearData'),
          message: t('settings.clearConfirm'),
          confirmText: t('common.delete'),
          danger: true,
        });
        if (!ok) return;
        try {
          await api.resetState(clearPw.value);
          await store.refresh();
          toast(t('settings.dataCleared'), { type: 'success', icon: 'trash' });
          entry.close();
        } catch (err) {
          toast(err.status === 401 ? t('settings.wrongPassword') : t('toast.saveFailed'), { type: 'error' });
        }
      },
    });
    frag.append(
      h('p', { class: 'help' }, t('settings.clearHint')),
      h('div', { class: 'field-row' }, [clearPw, clearBtn]),
    );

    frag.append(sectionTitle(t('settings.about')));
    frag.append(
      h('p', { class: 'help' }, t('settings.aboutVersion', { version: APP_VERSION })),
      h('p', { class: 'help' }, t('settings.aboutStorage')),
      h('p', { class: 'help' }, t('settings.aboutReminder')),
    );
    return frag;
  };

  const render = () => {
    body.replaceChildren(build());
    entry?.setTitle(t('settings.title'));
  };

  const onLocale = () => render();

  entry = openModal({
    title: t('settings.title'),
    body,
    size: 'wide',
    footer: [
      h('div', { class: 'left' }, [
        btn({
          icon: 'logout',
          label: t('settings.logout'),
          variant: 'ghost',
          size: 'small',
          onClick: async () => {
            const ok = await confirmDialog({
              title: t('settings.logout'),
              message: t('settings.logoutConfirm'),
              confirmText: t('settings.logout'),
            });
            if (!ok) return;
            await api.logout();
            location.replace('/login.html');
          },
        }),
      ]),
      btn({ label: t('settings.done'), variant: 'primary', onClick: () => entry.close() }),
    ],
    onClose: () => window.removeEventListener('dw:localechange', onLocale),
  });
  render();
  window.addEventListener('dw:localechange', onLocale);
  return entry;
}
