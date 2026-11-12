import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { createCategory, CATEGORY_COLORS } from '../core/schema.js';
import { displayName, t } from '../i18n/i18n.js';
import { btn, iconButton } from './controls.js';
import { confirmDialog, openModal } from './modal.js';
import { toast } from './toast.js';

export function openCategoryManager({ onChange } = {}) {
  const list = h('div', { class: 'cat-list' });
  let entry;

  const refresh = () => {
    list.replaceChildren();
    const categories = store.data.categories;
    if (!categories.length) {
      list.append(h('div', { class: 'empty' }, t('category.empty')));
    }
    for (const cat of categories) {
      const color = h('input', {
        type: 'color',
        value: cat.color,
        style: { width: '38px', height: '36px', flex: '0 0 38px' },
        oninput: (e) => {
          store.update((data) => {
            const item = data.categories.find((c) => c.id === cat.id);
            if (item) item.color = e.target.value;
          }, { reason: 'categories' });
          onChange?.();
        },
      });
      const name = h('input', {
        type: 'text',
        value: displayName(cat),
        onchange: (e) => {
          const value = e.target.value.trim();
          store.update((data) => {
            const item = data.categories.find((c) => c.id === cat.id);
            if (!item) return;
            item.name = value || displayName(cat);
            item.builtinNameKey = null;
          }, { reason: 'categories' });
          onChange?.();
        },
      });
      const del = iconButton('trash', t('category.delete'), async () => {
        const ok = await confirmDialog({
          title: t('category.delete'),
          message: t('category.deleteConfirm', { name: displayName(cat) }),
          confirmText: t('common.delete'),
          danger: true,
        });
        if (!ok) return;
        store.update((data) => {
          data.categories = data.categories.filter((c) => c.id !== cat.id);
          for (const ev of data.events) {
            if (ev.categoryId === cat.id) ev.categoryId = null;
            for (const ov of ev.overrides || []) {
              if (ov.categoryId === cat.id) ov.categoryId = null;
            }
          }
        }, { reason: 'categories' });
        refresh();
        onChange?.();
        toast(t('toast.deleted'));
      }, { danger: true });
      list.append(
        h('div', { class: 'cat-row' }, [color, name, del]),
      );
    }
  };

  const add = () => {
    const cat = createCategory(t('category.newName'), CATEGORY_COLORS[store.data.categories.length % CATEGORY_COLORS.length]);
    store.update((data) => data.categories.push(cat), { reason: 'categories' });
    refresh();
    onChange?.();
    const inputs = list.querySelectorAll('input[type="text"]');
    inputs[inputs.length - 1]?.focus();
  };

  const body = [
    list,
    h('div', { style: { marginTop: '10px' } }, btn({ icon: 'plus', label: t('category.add'), variant: 'ghost', onClick: add })),
  ];
  entry = openModal({
    title: t('category.title'),
    body,
    size: 'narrow',
    footer: [btn({ label: t('common.done'), variant: 'primary', onClick: () => entry.close() })],
  });
  refresh();
  return entry;
}
