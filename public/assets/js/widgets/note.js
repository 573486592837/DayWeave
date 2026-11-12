import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { uid } from '../core/dom.js';
import { registerWidget } from './registry.js';

export function renderNote(container, widget) {
  let note = store.data.notes.find((n) => n.id === widget.config?.noteId) || store.data.notes[0];
  if (!note) {
    note = { id: uid('n'), content: '' };
    store.update((data) => {
      data.notes.push(note);
    }, { reason: 'silent' });
  }
  if (widget.config?.noteId !== note.id) {
    store.update(() => {
      widget.config.noteId = note.id;
    }, { reason: 'silent' });
  }
  const display = document.body.classList.contains('display-mode');
  const area = h('textarea', {
    class: 'note',
    placeholder: t('widget.note.placeholder'),
    readOnly: display,
    spellcheck: false,
  });
  area.value = note.content || '';
  area.addEventListener('input', () => {
    store.update(() => {
      note.content = area.value;
    }, { reason: 'silent' });
  });
  container.append(area);
}

registerWidget('note', renderNote);
