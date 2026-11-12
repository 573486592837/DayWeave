import { t } from '../i18n/i18n.js';
import { h } from '../core/dom.js';

const registry = new Map();

export function registerWidget(type, render) {
  registry.set(type, render);
}

export function widgetName(type) {
  return t(`widget.${type}.name`);
}

export function renderWidget(container, widget) {
  const render = registry.get(widget.type);
  if (!render) {
    container.append(h('div', { class: 'empty' }, widget.type));
    return () => {};
  }
  return render(container, widget) || (() => {});
}
