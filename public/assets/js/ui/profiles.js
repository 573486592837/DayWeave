import { store } from '../core/store.js';
import { uid } from '../core/dom.js';
import { createProfile } from '../core/schema.js';
import { displayName, t } from '../i18n/i18n.js';
import { confirmDialog, promptDialog } from './modal.js';
import { menuItem, menuSeparator, menuTitle, openPopover } from './popover.js';
import { toast } from './toast.js';

function freshWidget(widget) {
  const copy = structuredClone(widget);
  copy.id = uid('w');
  return copy;
}

export function switchProfile(id) {
  store.update((data) => {
    if (data.profiles.some((p) => p.id === id)) data.activeProfileId = id;
  }, { reason: 'profile' });
}

export async function createNewProfile() {
  const name = await promptDialog({
    title: t('profile.new'),
    label: t('profile.namePlaceholder'),
    value: t('profile.newName'),
    confirmText: t('common.create'),
  });
  if (!name) return null;
  const profile = createProfile(name, { view: store.settings().defaultView });
  store.update((data) => {
    data.profiles.push(profile);
    data.activeProfileId = profile.id;
  }, { reason: 'profile' });
  toast(t('profile.created'), { type: 'success', icon: 'layout' });
  return profile;
}

export async function renameProfile(profile) {
  const name = await promptDialog({
    title: t('profile.rename'),
    label: t('profile.namePlaceholder'),
    value: displayName(profile),
    confirmText: t('common.save'),
  });
  if (!name) return;
  store.update((data) => {
    const target = data.profiles.find((p) => p.id === profile.id);
    if (!target) return;
    target.name = name;
    target.builtinNameKey = null;
  }, { reason: 'profile' });
  toast(t('profile.renamed'));
}

export function duplicateProfile(profile) {
  const copy = structuredClone(profile);
  copy.id = uid('p');
  copy.name = `${displayName(profile)} 2`;
  copy.builtinNameKey = null;
  copy.widgets = copy.widgets.map(freshWidget);
  store.update((data) => {
    data.profiles.push(copy);
    data.activeProfileId = copy.id;
  }, { reason: 'profile' });
  toast(t('profile.copied'), { type: 'success', icon: 'copy' });
  return copy;
}

export async function deleteProfile(profile) {
  if (store.data.profiles.length <= 1) {
    toast(t('profile.atLeastOne'), { type: 'error', icon: 'warning' });
    return false;
  }
  const ok = await confirmDialog({
    title: t('profile.delete'),
    message: t('profile.deleteConfirm', { name: displayName(profile) }),
    confirmText: t('common.delete'),
    danger: true,
  });
  if (!ok) return false;
  store.update((data) => {
    data.profiles = data.profiles.filter((p) => p.id !== profile.id);
    if (data.activeProfileId === profile.id) data.activeProfileId = data.profiles[0].id;
  }, { reason: 'profile' });
  toast(t('profile.deleted'));
  return true;
}

export function openProfileMenu(anchor, { onAfter, manage = true } = {}) {
  const content = [menuTitle(t('profile.title'))];
  for (const profile of store.data.profiles) {
    content.push(
      menuItem({
        label: displayName(profile),
        active: profile.id === store.data.activeProfileId,
        onClick: () => {
          if (profile.id !== store.data.activeProfileId) {
            switchProfile(profile.id);
            onAfter?.(profile);
          }
        },
      }),
    );
  }
  if (manage) {
    content.push(menuSeparator());
    content.push(menuItem({
      icon: 'plus',
      label: t('profile.new'),
      onClick: async () => {
        const created = await createNewProfile();
        if (created) onAfter?.(created);
      },
    }));
    const active = store.activeProfile();
    content.push(menuItem({
      icon: 'edit',
      label: t('profile.rename'),
      onClick: async () => {
        await renameProfile(active);
        onAfter?.(store.activeProfile());
      },
    }));
    content.push(menuItem({
      icon: 'copy',
      label: t('profile.duplicate'),
      onClick: () => {
        const copy = duplicateProfile(active);
        onAfter?.(copy);
      },
    }));
    content.push(menuItem({
      icon: 'trash',
      label: t('profile.delete'),
      disabled: store.data.profiles.length <= 1,
      onClick: async () => {
        const deleted = await deleteProfile(active);
        if (deleted) onAfter?.(store.activeProfile());
      },
    }));
  }
  return openPopover(anchor, content, { align: 'start', width: 210 });
}
