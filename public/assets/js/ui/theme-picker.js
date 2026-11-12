import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { THEMES, THEME_BG } from '../core/schema.js';
import { t } from '../i18n/i18n.js';
import { applyTheme } from '../core/theme.js';
import { btn, segmented, toggle } from './controls.js';
import { openModal } from './modal.js';

export function openThemePicker() {
  let entry;
  const body = h('div');
  const footer = [btn({ label: t('theme.done'), variant: 'primary', onClick: () => entry.close() })];

  const render = () => {
    body.replaceChildren();
    const settings = store.settings();
    const grid = h('div', { class: 'theme-grid' });
    for (const theme of THEMES) {
      const card = h('button', {
        type: 'button',
        class: `theme-card ${settings.theme === theme.id ? 'active' : ''}`,
        onclick: () => {
          const oldTheme = settings.theme;
          store.update((data) => {
            data.settings.theme = theme.id;
            // 仅当背景仍是上一个主题的默认纯色时，跟随主题一起换色
            const from = THEME_BG[oldTheme];
            const to = THEME_BG[theme.id];
            for (const profile of data.profiles) {
              const bg = profile.background;
              if (bg?.type === 'color' && (bg.color === from || bg.color === to)) bg.color = to;
            }
          }, { reason: 'theme' });
          applyTheme();
          render();
        },
      }, [
        h('span', {
          class: 'theme-swatch',
          style: {
            background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[1]} 55%, ${theme.swatch[2]})`,
          },
        }),
        h('span', { class: 'theme-name' }, t(theme.nameKey)),
      ]);
      grid.append(card);
    }

    body.append(
      grid,
      h('div', { class: 'field', style: { marginTop: '18px' } }, [
        h('label', {}, t('theme.fontScale')),
        segmented(
          [
            { value: 'sm', label: t('theme.sm') },
            { value: 'md', label: t('theme.md') },
            { value: 'lg', label: t('theme.lg') },
          ],
          settings.fontScale,
          (v) => {
            store.update((data) => {
              data.settings.fontScale = v;
            }, { reason: 'theme' });
            applyTheme();
            render();
          },
        ),
      ]),
      toggle(t('theme.performance'), settings.performanceMode, (v) => {
        store.update((data) => {
          data.settings.performanceMode = v;
        }, { reason: 'theme' });
        applyTheme();
      }, t('theme.performanceHint')),
      h('p', { class: 'help', style: { marginTop: '10px' } }, t('theme.hint')),
    );
  };

  entry = openModal({ title: t('theme.title'), body, footer, size: 'wide' });
  render();
  return entry;
}
