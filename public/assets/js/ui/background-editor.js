import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { renderBackground } from '../core/theme.js';
import { defaultBackground } from '../core/schema.js';
import { api } from '../core/api.js';
import { btn, iconButton, segmented, select } from './controls.js';
import { confirmDialog, openModal } from './modal.js';
import { pickAndUpload } from './image-upload.js';
import { toast } from './toast.js';

function assetUrl(id) {
  const asset = store.data.assets.find((a) => a.id === id);
  return asset ? `/uploads/${asset.filename}` : null;
}

function intervalLabel(sec) {
  if (sec >= 60) return `${sec / 60} ${t('common.minutes')}`;
  return `${sec} ${t('common.seconds')}`;
}

export function openBackgroundEditor() {
  const profile = store.activeProfile();
  const saved = profile.background;
  const draft = { ...structuredClone(saved || defaultBackground()) };
  draft.gradient = { ...defaultBackground().gradient, ...(draft.gradient || {}) };
  draft.image = { ...defaultBackground().image, ...(draft.image || {}) };
  draft.slideshow = { ...defaultBackground().slideshow, ...(draft.slideshow || {}) };
  draft.overlay = { ...defaultBackground().overlay, ...(draft.overlay || {}) };
  let savedFlag = false;

  const preview = () => renderBackground(draft);

  const body = h('div');

  const rebuild = () => {
    body.replaceChildren(buildContent());
    preview();
  };

  const library = () => {
    const assets = store.data.assets;
    if (!assets.length) return h('div', { class: 'help' }, t('background.noImages'));
    const grid = h('div', { class: 'image-library' });
    const selectedIds = draft.type === 'slideshow'
      ? draft.slideshow.assetIds
      : draft.type === 'image' && draft.image.assetId
        ? [draft.image.assetId]
        : [];
    for (const asset of assets) {
      const index = selectedIds.indexOf(asset.id);
      const thumb = h('button', {
        type: 'button',
        class: `bg-thumb ${index >= 0 ? 'selected' : ''}`,
        style: { backgroundImage: `url("/uploads/${asset.filename}")` },
        title: asset.filename,
        onclick: () => {
          if (draft.type === 'image') {
            draft.image.assetId = asset.id;
          } else if (draft.type === 'slideshow') {
            const ids = draft.slideshow.assetIds;
            const at = ids.indexOf(asset.id);
            if (at >= 0) ids.splice(at, 1);
            else ids.push(asset.id);
          }
          rebuild();
        },
      }, index >= 0 ? h('span', { class: 'thumb-index' }, String(index + 1)) : null);
      const del = h('button', {
        type: 'button',
        class: 'thumb-del',
        title: t('background.deleteImage'),
        html: '×',
        onclick: async (e) => {
          e.stopPropagation();
          const ok = await confirmDialog({
            title: t('background.deleteImage'),
            message: t('background.deleteImageConfirm'),
            confirmText: t('common.delete'),
            danger: true,
          });
          if (!ok) return;
          try {
            await api.deleteAsset(asset.id);
            await store.refresh();
            rebuild();
          } catch (err) {
            toast(err.status === 409 ? t('background.imageInUse') : t('background.uploadFailed'), { type: 'error' });
          }
        },
      });
      const cell = h('div', { class: 'bg-thumb-wrap' }, [thumb, del]);
      grid.append(cell);
    }
    return h('div', {}, [
      h('div', { class: 'widget-title', style: { marginBottom: '6px' } }, t('background.pickFromLibrary')),
      grid,
    ]);
  };

  const upload = async (multiple) => {
    const results = await pickAndUpload({ multiple });
    if (!results.length) return;
    if (draft.type === 'image') draft.image.assetId = results[results.length - 1].id;
    else if (draft.type === 'slideshow') {
      for (const r of results) draft.slideshow.assetIds.push(r.id);
    }
    rebuild();
  };

  const slideshowList = () => {
    const ids = draft.slideshow.assetIds;
    if (!ids.length) return h('div', { class: 'help' }, t('background.emptyImages'));
    const list = h('div', { class: 'slideshow-list' });
    ids.forEach((id, index) => {
      const url = assetUrl(id);
      const row = h('div', { class: 'slide-row' }, [
        h('span', { class: 'slide-thumb', style: { backgroundImage: url ? `url("${url}")` : 'none' } }),
        h('span', { class: 'slide-index tnum' }, `${index + 1}`),
        h('div', { class: 'slide-actions' }, [
          iconButton('arrowUp', t('common.prev'), () => {
            if (index === 0) return;
            [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
            rebuild();
          }),
          iconButton('arrowDown', t('common.next'), () => {
            if (index === ids.length - 1) return;
            [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
            rebuild();
          }),
          iconButton('trash', t('background.deleteImage'), () => {
            ids.splice(index, 1);
            rebuild();
          }, { danger: true }),
        ]),
      ]);
      list.append(row);
    });
    return list;
  };

  const buildContent = () => {
    const frag = h('div');
    const typeSeg = segmented(
      [
        { value: 'color', label: t('background.color') },
        { value: 'gradient', label: t('background.gradient') },
        { value: 'image', label: t('background.image') },
        { value: 'slideshow', label: t('background.slideshow') },
      ],
      draft.type,
      (v) => {
        draft.type = v;
        rebuild();
      },
    );
    frag.append(h('div', { class: 'field' }, [h('label', {}, t('background.type')), typeSeg]));

    if (draft.type === 'color') {
      frag.append(h('div', { class: 'field' }, [
        h('label', {}, t('background.color')),
        h('input', {
          type: 'color',
          value: draft.color || '#0f172a',
          oninput: (e) => {
            draft.color = e.target.value;
            preview();
          },
        }),
      ]));
    } else if (draft.type === 'gradient') {
      frag.append(
        h('div', { class: 'field-row' }, [
          h('div', { class: 'field' }, [
            h('label', {}, t('background.gradientFrom')),
            h('input', {
              type: 'color',
              value: draft.gradient.from,
              oninput: (e) => {
                draft.gradient.from = e.target.value;
                preview();
              },
            }),
          ]),
          h('div', { class: 'field' }, [
            h('label', {}, t('background.gradientTo')),
            h('input', {
              type: 'color',
              value: draft.gradient.to,
              oninput: (e) => {
                draft.gradient.to = e.target.value;
                preview();
              },
            }),
          ]),
        ]),
        h('div', { class: 'field' }, [
          h('div', { class: 'inline-between' }, [h('label', {}, t('background.angle')), h('span', { class: 'help tnum' }, `${draft.gradient.angle}°`)]),
          h('input', {
            type: 'range',
            min: 0,
            max: 360,
            value: draft.gradient.angle,
            oninput: (e) => {
              draft.gradient.angle = Number(e.target.value);
              e.target.previousElementSibling.querySelector('.help').textContent = `${draft.gradient.angle}°`;
              preview();
            },
          }),
        ]),
      );
    } else if (draft.type === 'image') {
      frag.append(
        h('div', { class: 'field' }, [
          h('label', {}, t('background.fit')),
          select(
            [
              { value: 'cover', label: t('background.cover') },
              { value: 'contain', label: t('background.contain') },
              { value: 'repeat', label: t('background.repeat') },
              { value: 'center', label: t('background.center') },
            ],
            draft.image.fit,
            (v) => {
              draft.image.fit = v;
              preview();
            },
          ),
        ]),
        library(),
        h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } }, [
          btn({ icon: 'upload', label: t('background.upload'), variant: 'ghost', size: 'small', onClick: () => upload(false) }),
        ]),
      );
    } else if (draft.type === 'slideshow') {
      frag.append(
        h('div', { class: 'field' }, [
          h('label', {}, t('background.interval')),
          select(
            [15, 30, 60, 300, 1800].map((sec) => ({ value: String(sec), label: intervalLabel(sec) })),
            String(draft.slideshow.intervalSec),
            (v) => {
              draft.slideshow.intervalSec = Number(v);
              preview();
            },
          ),
        ]),
        h('div', { class: 'field-row' }, [
          h('div', { class: 'field' }, [
            h('label', {}, t('background.order')),
            segmented(
              [
                { value: 'sequential', label: t('background.sequential') },
                { value: 'random', label: t('background.random') },
              ],
              draft.slideshow.order,
              (v) => {
                draft.slideshow.order = v;
                preview();
              },
            ),
          ]),
          h('div', { class: 'field' }, [
            h('label', {}, t('background.transition')),
            segmented(
              [
                { value: 'fade', label: t('background.fade') },
                { value: 'none', label: t('background.none') },
              ],
              draft.slideshow.transition,
              (v) => {
                draft.slideshow.transition = v;
                preview();
              },
            ),
          ]),
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('background.fit')),
          select(
            [
              { value: 'cover', label: t('background.cover') },
              { value: 'contain', label: t('background.contain') },
              { value: 'repeat', label: t('background.repeat') },
              { value: 'center', label: t('background.center') },
            ],
            draft.image.fit,
            (v) => {
              draft.image.fit = v;
              preview();
            },
          ),
        ]),
        h('div', { class: 'widget-title', style: { margin: '12px 0 6px' } }, t('background.images')),
        slideshowList(),
        library(),
        h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } }, [
          btn({ icon: 'upload', label: t('background.addImages'), variant: 'ghost', size: 'small', onClick: () => upload(true) }),
        ]),
      );
    }

    frag.append(
      h('div', { class: 'field-row', style: { marginTop: '12px' } }, [
        h('div', { class: 'field' }, [
          h('label', {}, t('background.overlayColor')),
          h('input', {
            type: 'color',
            value: draft.overlay.color,
            oninput: (e) => {
              draft.overlay.color = e.target.value;
              preview();
            },
          }),
        ]),
        h('div', { class: 'field' }, [
          h('div', { class: 'inline-between' }, [
            h('label', {}, t('background.overlayOpacity')),
            h('span', { class: 'help tnum' }, `${Math.round(draft.overlay.opacity * 100)}%`),
          ]),
          h('input', {
            type: 'range',
            min: 0,
            max: 100,
            value: Math.round(draft.overlay.opacity * 100),
            oninput: (e) => {
              draft.overlay.opacity = Number(e.target.value) / 100;
              e.target.previousElementSibling.querySelector('.help').textContent = `${e.target.value}%`;
              preview();
            },
          }),
        ]),
      ]),
      h('div', { class: 'field' }, [
        h('div', { class: 'inline-between' }, [h('label', {}, t('background.blur')), h('span', { class: 'help tnum' }, `${draft.blur}px`)]),
        h('input', {
          type: 'range',
          min: 0,
          max: 20,
          value: draft.blur,
          oninput: (e) => {
            draft.blur = Number(e.target.value);
            e.target.previousElementSibling.querySelector('.help').textContent = `${e.target.value}px`;
            preview();
          },
        }),
      ]),
      h('p', { class: 'help' }, t('background.uploadHint')),
    );
    return frag;
  };

  let entry;
  const restore = () => {
    if (!savedFlag) renderBackground(saved);
  };
  entry = openModal({
    title: t('background.title'),
    body,
    size: 'wide',
    footer: [
      btn({ label: t('common.cancel'), variant: 'ghost', onClick: () => entry.close() }),
      btn({
        label: t('common.save'),
        variant: 'primary',
        onClick: () => {
          store.update((data) => {
            const target = data.profiles.find((p) => p.id === profile.id);
            if (target) target.background = structuredClone(draft);
          }, { reason: 'background' });
          savedFlag = true;
          toast(t('background.applied'), { type: 'success', icon: 'image' });
          entry.close();
        },
      }),
    ],
    onClose: () => restore(),
  });
  rebuild();
  return entry;
}
