import { store } from '../core/store.js';
import { h, uid } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { startOfDay } from '../i18n/format.js';
import { btn } from '../ui/controls.js';
import { openModal } from '../ui/modal.js';
import { registerWidget } from './registry.js';

function daysBetween(target) {
  const today = startOfDay(new Date());
  return Math.round((startOfDay(target) - today) / 86_400_000);
}

export function openCountdownEditor(widget, existing, onSaved) {
  const titleInput = h('input', { type: 'text', value: existing?.title || '', placeholder: t('widget.countdown.titlePlaceholder') });
  const dateInput = h('input', { type: 'date', value: existing?.targetDate || '' });
  const error = h('p', { class: 'error-text' });
  const entry = openModal({
    title: t('widget.countdown.set'),
    body: [
      h('div', { class: 'field' }, [h('label', {}, t('widget.countdown.title')), titleInput]),
      h('div', { class: 'field' }, [h('label', {}, t('widget.countdown.date')), dateInput]),
      error,
    ],
    size: 'narrow',
    footer: [
      btn({ label: t('common.cancel'), variant: 'ghost', onClick: () => entry.close() }),
      btn({
        label: t('common.save'),
        variant: 'primary',
        onClick: () => {
          if (!dateInput.value) {
            error.textContent = t('widget.countdown.date');
            return;
          }
          store.update((data) => {
            if (existing) {
              const target = data.countdowns.find((c) => c.id === existing.id);
              if (target) {
                target.title = titleInput.value.trim();
                target.targetDate = dateInput.value;
              }
            } else {
              const cd = { id: uid('cd'), title: titleInput.value.trim(), targetDate: dateInput.value };
              data.countdowns.push(cd);
              widget.config.countdownId = cd.id;
            }
          }, { reason: 'data' });
          entry.close();
          onSaved?.();
        },
      }),
    ],
  });
}

export function renderCountdown(container, widget) {
  const wrap = h('div', { class: 'countdown' });
  container.append(wrap);
  const display = document.body.classList.contains('display-mode');
  let timer = null;

  const paint = () => {
    wrap.replaceChildren();
    const cd = store.data.countdowns.find((c) => c.id === widget.config?.countdownId);
    if (!cd) {
      wrap.append(h('div', { class: 'countdown-title' }, t('widget.countdown.empty')));
      if (!display) {
        wrap.append(btn({ icon: 'plus', label: t('widget.countdown.set'), variant: 'ghost', size: 'small', onClick: () => openCountdownEditor(widget, null) }));
      }
      return;
    }
    const target = new Date(`${cd.targetDate}T00:00:00`);
    const diff = daysBetween(target);
    wrap.append(
      h('div', { class: 'countdown-title', title: cd.title }, cd.title || t('widget.countdown.title')),
      h('div', { class: 'countdown-days tnum' }, String(Math.abs(diff))),
      h('div', { class: 'countdown-label' }, diff > 0
        ? t('widget.countdown.daysLeft', { n: diff })
        : diff === 0
          ? t('widget.countdown.today')
          : t('widget.countdown.daysAgo', { n: Math.abs(diff) })),
    );
    if (!display) {
      wrap.style.cursor = 'pointer';
      wrap.title = t('common.edit');
      wrap.onclick = () => openCountdownEditor(widget, cd);
    }
  };

  paint();
  timer = setInterval(paint, 60_000);
  return () => clearInterval(timer);
}

registerWidget('countdown', renderCountdown);
