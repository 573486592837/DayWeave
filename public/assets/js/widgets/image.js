import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { btn, iconButton } from '../ui/controls.js';
import { emptyState } from '../ui/controls.js';
import { pickAndUpload } from '../ui/image-upload.js';
import { registerWidget } from './registry.js';

function fitStyle(fit) {
  switch (fit) {
    case 'contain':
      return { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    case 'repeat':
      return { backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: 'center' };
    case 'center':
      return { backgroundSize: 'auto', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    default:
      return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
  }
}

export function renderImage(container, widget) {
  const display = document.body.classList.contains('display-mode');
  const wrap = h('div', { class: 'image-widget' });
  container.append(wrap);
  const asset = store.asset(widget.config?.assetId);

  const setFit = (el, fit) => Object.assign(el.style, fitStyle(fit));

  async function changeImage() {
    const results = await pickAndUpload();
    if (!results.length) return;
    store.update((data) => {
      for (const p of data.profiles) {
        const w = p.widgets.find((x) => x.id === widget.id);
        if (w) w.config.assetId = results[0].id;
      }
    }, { reason: 'data' });
  }

  if (asset) {
    const img = h('div', {
      style: {
        width: '100%',
        height: '100%',
        backgroundImage: `url("/uploads/${asset.filename}")`,
      },
    });
    setFit(img, widget.config?.fit || 'cover');
    wrap.append(img);
    if (!display) {
      wrap.append(h('div', { class: 'img-actions' }, [
        iconButton('image', t('widget.image.change'), changeImage),
        iconButton('trash', t('widget.image.remove'), () => {
          store.update((data) => {
            for (const p of data.profiles) {
              const w = p.widgets.find((x) => x.id === widget.id);
              if (w) w.config.assetId = null;
            }
          }, { reason: 'data' });
        }, { danger: true }),
      ]));
    }
  } else {
    wrap.append(emptyState(t('widget.image.empty'), 'image'));
    if (!display) {
      wrap.append(btn({ icon: 'upload', label: t('widget.image.choose'), variant: 'ghost', size: 'small', onClick: changeImage }));
    }
  }
}

registerWidget('image', renderImage);
