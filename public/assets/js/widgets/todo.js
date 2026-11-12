import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { createTodo } from '../core/schema.js';
import { t } from '../i18n/i18n.js';
import { btn, emptyState } from '../ui/controls.js';
import { registerWidget } from './registry.js';

export function renderTodo(container, widget) {
  const showDone = widget.config?.showDone !== false;
  const display = document.body.classList.contains('display-mode');
  const wrap = h('div', { class: 'todo' });
  const list = h('div', { class: 'todo-list' });
  let input = null;

  const renderList = () => {
    list.replaceChildren();
    const items = [...store.data.todos]
      .filter((item) => showDone || !item.done)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!items.length) {
      list.append(emptyState(t('widget.todo.empty'), 'todo'));
      return;
    }
    for (const item of items) {
      const checkbox = h('input', {
        type: 'checkbox',
        checked: item.done,
        disabled: display,
        onchange: (e) => {
          store.update((data) => {
            const target = data.todos.find((x) => x.id === item.id);
            if (target) target.done = e.target.checked;
          }, { reason: 'silent' });
          renderList();
        },
      });
      const row = h('div', { class: `todo-row ${item.done ? 'done' : ''}` }, [
        h('label', {}, [checkbox, h('span', { class: 'text', title: item.text }, item.text)]),
      ]);
      if (!display) {
        row.append(
          h('button', {
            class: 'icon-btn danger',
            type: 'button',
            'aria-label': t('common.delete'),
            title: t('common.delete'),
            html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
            onclick: () => {
              store.update((data) => {
                data.todos = data.todos.filter((x) => x.id !== item.id);
              }, { reason: 'silent' });
              renderList();
            },
          }),
        );
      }
      list.append(row);
    }
  };

  if (!display) {
    input = h('input', { type: 'text', placeholder: t('widget.todo.placeholder'), maxlength: 500 });
    const form = h('form', {
      class: 'todo-add',
      onsubmit: (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        store.update((data) => {
          data.todos.push(createTodo(text));
        }, { reason: 'silent' });
        input.value = '';
        renderList();
        input.focus();
      },
    }, [input, btn({ icon: 'plus', label: '', title: t('widget.todo.add'), variant: 'ghost', type: 'submit' })]);
    wrap.append(form);
  }
  wrap.append(list);
  container.append(wrap);
  renderList();
}

registerWidget('todo', renderTodo);
