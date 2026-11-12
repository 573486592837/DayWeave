import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { btn, iconButton, sectionTitle, segmented, select, toggle } from './controls.js';

function styleRow(label, control, valueText) {
  return h('div', { class: 'field' }, [
    h('div', { class: 'inline-between' }, [h('label', {}, label), valueText ? h('span', { class: 'help tnum' }, valueText) : null]),
    control,
  ]);
}

function range({ value, min = 0, max = 100, step = 1, onInput, onChange }) {
  return h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    oninput: (e) => onInput(Number(e.target.value)),
    onchange: (e) => onChange(Number(e.target.value)),
  });
}

export function buildInspector(widget, callbacks) {
  const { updateStyle, updateConfig, resetStyle, action, close } = callbacks;
  const style = widget.style || {};
  const config = widget.config || {};
  const root = h('div', { class: 'inspector-inner' });

  root.append(
    h('div', { class: 'inspector-header' }, [
      h('div', {}, [
        h('div', { class: 'inspector-type' }, t(`widget.${widget.type}.name`)),
        h('div', { class: 'inspector-pos tnum' }, `x ${widget.x} · y ${widget.y} · ${t('editor.size', { w: widget.w, h: widget.h })}`),
      ]),
      iconButton('x', t('common.close'), () => close()),
    ]),
  );

  const body = h('div', { class: 'inspector-body' });

  body.append(sectionTitle(t('editor.style')));

  const bgInput = h('input', {
    type: 'color',
    value: style.bg || '#1e293b',
    oninput: (e) => updateStyle({ bg: e.target.value }, false),
    onchange: () => updateStyle({}, true),
  });
  body.append(
    h('div', { class: 'inline-between', style: { marginBottom: '8px' } }, [
      h('label', {}, t('editor.bg')),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
        bgInput,
        h('button', {
          class: 'btn small ghost',
          type: 'button',
          text: t('editor.transparent'),
          onclick: () => updateStyle({ bg: '' }, true),
        }),
      ]),
    ]),
  );

  const opacityValue = h('span', { class: 'help tnum' }, `${Math.round((style.bgOpacity ?? 1) * 100)}%`);
  body.append(
    styleRow(t('editor.bgOpacity'), range({
      value: Math.round((style.bgOpacity ?? 1) * 100),
      min: 0,
      max: 100,
      onInput: (v) => {
        opacityValue.textContent = `${v}%`;
        updateStyle({ bgOpacity: v / 100 }, false);
      },
      onChange: () => updateStyle({}, true),
    }), opacityValue),
  );

  const blurValue = h('span', { class: 'help tnum' }, `${style.blur || 0}px`);
  body.append(
    styleRow(t('editor.blur'), range({
      value: style.blur || 0,
      min: 0,
      max: 20,
      onInput: (v) => {
        blurValue.textContent = `${v}px`;
        updateStyle({ blur: v }, false);
      },
      onChange: () => updateStyle({}, true),
    }), blurValue),
  );

  const radiusValue = h('span', { class: 'help tnum' }, `${style.radius ?? 16}px`);
  body.append(
    styleRow(t('editor.radius'), range({
      value: style.radius ?? 16,
      min: 0,
      max: 32,
      onInput: (v) => {
        radiusValue.textContent = `${v}px`;
        updateStyle({ radius: v }, false);
      },
      onChange: () => updateStyle({}, true),
    }), radiusValue),
  );

  const paddingValue = h('span', { class: 'help tnum' }, `${style.padding ?? 16}px`);
  body.append(
    styleRow(t('editor.padding'), range({
      value: style.padding ?? 16,
      min: 0,
      max: 32,
      onInput: (v) => {
        paddingValue.textContent = `${v}px`;
        updateStyle({ padding: v }, false);
      },
      onChange: () => updateStyle({}, true),
    }), paddingValue),
  );

  const colorInput = h('input', {
    type: 'color',
    value: style.color || '#e2e8f0',
    oninput: (e) => updateStyle({ color: e.target.value }, false),
    onchange: () => updateStyle({}, true),
  });
  body.append(
    h('div', { class: 'inline-between', style: { marginBottom: '10px' } }, [
      h('label', {}, t('editor.color')),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
        colorInput,
        h('button', {
          class: 'btn small ghost',
          type: 'button',
          text: t('editor.transparent'),
          onclick: () => updateStyle({ color: '' }, true),
        }),
      ]),
    ]),
  );

  body.append(
    h('div', { class: 'field' }, [
      h('label', {}, t('editor.fontSize')),
      segmented(
        [
          { value: 'sm', label: t('editor.little') },
          { value: 'md', label: t('editor.medium') },
          { value: 'lg', label: t('editor.large') },
        ],
        style.fontSize || 'md',
        (v) => updateStyle({ fontSize: v }, true),
      ),
    ]),
  );

  body.append(sectionTitle(t('editor.config')));
  const typeConfig = h('div');
  body.append(typeConfig);

  const cfg = (patch, rerender = true) => updateConfig(patch, true, rerender);

  if (widget.type === 'clock') {
    typeConfig.append(
      h('div', { class: 'field' }, [
        h('label', {}, t('widget.clock.mode')),
        segmented(
          [
            { value: 'digital', label: t('widget.clock.digital') },
            { value: 'analog', label: t('widget.clock.analog') },
          ],
          config.mode || 'digital',
          (v) => cfg({ mode: v }),
        ),
      ]),
      toggle(t('widget.clock.showSeconds'), config.showSeconds, (v) => cfg({ showSeconds: v }, false)),
      toggle(t('widget.clock.showDate'), config.showDate !== false, (v) => cfg({ showDate: v }, false)),
    );
  } else if (widget.type === 'calendar') {
    typeConfig.append(
      h('div', { class: 'field' }, [
        h('label', {}, t('widget.calendar.view')),
        segmented(
          [
            { value: 'day', label: t('view.day') },
            { value: 'week', label: t('view.week') },
            { value: 'month', label: t('view.month') },
          ],
          config.view || store.settings().defaultView,
          (v) => cfg({ view: v }),
        ),
      ]),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [
          h('label', {}, t('widget.calendar.dayStart')),
          h('input', {
            type: 'number',
            min: 0,
            max: 22,
            value: config.dayStart ?? store.settings().dayStartHour,
            onchange: (e) => cfg({ dayStart: Number(e.target.value) }),
          }),
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('widget.calendar.dayEnd')),
          h('input', {
            type: 'number',
            min: 1,
            max: 24,
            value: config.dayEnd ?? store.settings().dayEndHour,
            onchange: (e) => cfg({ dayEnd: Number(e.target.value) }),
          }),
        ]),
      ]),
      h('button', {
        class: 'btn small ghost',
        type: 'button',
        text: t('common.reset'),
        onclick: () => {
          updateConfig({ dayStart: undefined, dayEnd: undefined }, true, true);
        },
      }),
    );
  } else if (widget.type === 'eventList') {
    typeConfig.append(
      h('div', { class: 'field' }, [
        h('label', {}, t('widget.eventList.range')),
        select(
          [
            { value: 'today', label: t('widget.eventList.today') },
            { value: '3d', label: t('widget.eventList.3d') },
            { value: '7d', label: t('widget.eventList.7d') },
          ],
          config.range || '3d',
          (v) => cfg({ range: v }),
        ),
      ]),
      toggle(t('widget.eventList.showDone'), config.showDone !== false, (v) => cfg({ showDone: v })),
    );
  } else if (widget.type === 'todo') {
    typeConfig.append(toggle(t('widget.todo.showDone'), config.showDone !== false, (v) => cfg({ showDone: v })));
  } else if (widget.type === 'progress') {
    typeConfig.append(
      h('div', { class: 'field' }, [
        h('label', {}, t('widget.progress.mode')),
        segmented(
          [
            { value: 'year', label: t('widget.progress.year') },
            { value: 'month', label: t('widget.progress.month') },
            { value: 'day', label: t('widget.progress.day') },
          ],
          config.mode || 'year',
          (v) => cfg({ mode: v }),
        ),
      ]),
    );
  } else if (widget.type === 'countdown') {
    typeConfig.append(
      btn({ icon: 'countdown', label: t('widget.countdown.set'), variant: 'ghost', size: 'small', onClick: () => action('countdown') }),
    );
  } else if (widget.type === 'image') {
    typeConfig.append(
      h('div', { class: 'field' }, [
        h('label', {}, t('widget.image.fit')),
        select(
          [
            { value: 'cover', label: t('widget.image.cover') },
            { value: 'contain', label: t('widget.image.contain') },
            { value: 'repeat', label: t('widget.image.repeat') },
            { value: 'center', label: t('widget.image.center') },
          ],
          config.fit || 'cover',
          (v) => cfg({ fit: v }),
        ),
      ]),
      h('div', { style: { display: 'flex', gap: '6px' } }, [
        btn({ icon: 'upload', label: t('widget.image.choose'), variant: 'ghost', size: 'small', onClick: () => action('image-change') }),
        btn({ icon: 'trash', label: t('widget.image.remove'), variant: 'danger', size: 'small', onClick: () => action('image-remove') }),
      ]),
    );
  }

  body.append(
    h('div', { style: { marginTop: '20px' } }, [
      btn({ icon: 'refresh', label: t('editor.resetStyle'), variant: 'ghost', size: 'small', onClick: () => resetStyle() }),
    ]),
  );

  root.append(body);
  return root;
}
