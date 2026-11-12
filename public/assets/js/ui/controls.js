import { h } from '../core/dom.js';
import { iconSvg } from './icons.js';
import { t } from '../i18n/i18n.js';

export function btn({ icon, label, variant = '', size = '', onClick, title, disabled = false, type = 'button', cls = '' }) {
  const classes = ['btn', variant, size, !label && icon ? 'icon-only' : '', cls].filter(Boolean).join(' ');
  const children = [];
  if (icon) children.push(h('span', { class: 'btn-ico', html: iconSvg(icon) }));
  if (label) children.push(h('span', { class: 'btn-label' }, label));
  return h(
    'button',
    {
      class: classes,
      type,
      title: title || label || '',
      'aria-label': title || label || '',
      disabled,
      onclick: onClick,
    },
    children,
  );
}

export function iconButton(icon, title, onClick, { danger = false, disabled = false, cls = '' } = {}) {
  return h('button', {
    class: `icon-btn ${danger ? 'danger' : ''} ${cls}`.trim(),
    type: 'button',
    title,
    'aria-label': title,
    disabled,
    html: iconSvg(icon, 16),
    onclick: onClick,
  });
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'group' });
  for (const opt of options) {
    wrap.append(
      h(
        'button',
        {
          type: 'button',
          class: opt.value === value ? 'active' : '',
          'aria-pressed': String(opt.value === value),
          onclick: () => {
            if (opt.value === value) return;
            onChange(opt.value);
          },
        },
        opt.label,
      ),
    );
  }
  return wrap;
}

export function field(labelText, control, help) {
  return h('div', { class: 'field' }, [
    labelText ? h('label', {}, labelText) : null,
    control,
    help ? h('div', { class: 'help' }, help) : null,
  ]);
}

export function select(options, value, onChange, attrs = {}) {
  const el = h(
    'select',
    { ...attrs, onchange: (e) => onChange(e.target.value) },
    options.map((o) =>
      h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label),
    ),
  );
  el.value = value;
  return el;
}

export function toggle(label, checked, onChange, help) {
  const input = h('input', {
    type: 'checkbox',
    checked,
    onchange: (e) => onChange(e.target.checked),
  });
  return h('div', { class: 'field' }, [
    h('label', { class: 'switch' }, [input, h('span', { class: 'track' }), h('span', {}, label)]),
    help ? h('div', { class: 'help' }, help) : null,
  ]);
}

export function rangeField({ label, value, min, max, step = 1, onInput, onChange, format }) {
  const out = h('span', { class: 'help tnum' }, format ? format(value) : String(value));
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    oninput: (e) => {
      const v = Number(e.target.value);
      out.textContent = format ? format(v) : String(v);
      onInput?.(v);
    },
    onchange: (e) => onChange?.(Number(e.target.value)),
  });
  return h('div', { class: 'field' }, [
    h('div', { class: 'inline-between' }, [h('label', {}, label), out]),
    input,
  ]);
}

export function colorField({ label, value, onChange, allowClear = false }) {
  const input = h('input', {
    type: 'color',
    value: value && value.startsWith('#') ? value : '#38bdf8',
    oninput: (e) => onChange(e.target.value),
  });
  const row = h('div', { class: 'inline-between' }, [h('label', {}, label), input]);
  if (allowClear) {
    const clear = h('button', {
      class: 'btn small ghost',
      type: 'button',
      onclick: () => onChange(''),
    }, t('editor.transparent'));
    row.append(clear);
  }
  return h('div', { class: 'field' }, [row]);
}

export function sectionTitle(text, extra) {
  return h('div', { class: 'inline-between', style: { margin: '18px 0 10px' } }, [
    h('div', { class: 'widget-title', style: { margin: 0 } }, text),
    extra || null,
  ]);
}

export function emptyState(text, icon = 'calendar') {
  return h('div', { class: 'empty' }, [
    h('span', { html: iconSvg(icon, 26) }),
    h('span', {}, text),
  ]);
}

export function checkboxRow(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'check-row' }, [input, h('span', {}, label)]);
}

export function divider() {
  return h('div', { class: 'sep', style: { margin: '12px 0' } });
}
