import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSFER_BLOCK_MESSAGES,
  hasUnsavedChanges,
  isEinsatzDetailPage,
  onUnsavedChange,
  resetUnsavedChanges,
  transferBlock,
  watchUnsavedChanges,
} from './sybos-einsatz-state';

const DETAIL = 'https://sybos.lfv-bgld.at/index.php?comp=sybEinsatz&s=frmEinsatzAdd&id=0';

function setupForm(): HTMLFormElement {
  document.body.innerHTML =
    '<form name="frmMain"><textarea name="ESunfallhergang"></textarea><input name="ESort"></form>' +
    '<div id="einsatzkarte-widget"><input class="ek-search"></div>';
  return document.querySelector('form')!;
}

afterEach(() => {
  resetUnsavedChanges();
  document.body.innerHTML = '';
});

describe('isEinsatzDetailPage', () => {
  it('erkennt das Einsatzformular, auch neu mit id=0', () => {
    expect(isEinsatzDetailPage(DETAIL)).toBe(true);
    expect(
      isEinsatzDetailPage('https://sybos.lfv-bgld.at/index.php?comp=sybEinsatz&s=frmEinsatzAdd&id=105069&edit=1')
    ).toBe(true);
  });

  it('lehnt andere Seiten ab', () => {
    expect(isEinsatzDetailPage('https://sybos.lfv-bgld.at/index.php?comp=sybEinsatz&s=MaterialListe&id=1')).toBe(false);
    expect(isEinsatzDetailPage('nicht-eine-url')).toBe(false);
  });
});

describe('transferBlock', () => {
  it('sperrt, solange der Einsatz noch nie gespeichert wurde', () => {
    expect(transferBlock({ einsatzId: null, unsavedChanges: false })).toBe('unsaved');
  });

  it('sperrt bei ungespeicherten Änderungen im Formular', () => {
    expect(transferBlock({ einsatzId: '105069', unsavedChanges: true })).toBe('dirty');
  });

  it('gibt frei, wenn der Einsatz gespeichert ist', () => {
    expect(transferBlock({ einsatzId: '105069', unsavedChanges: false })).toBeNull();
  });

  it('hat für jeden Grund einen Hinweis', () => {
    expect(TRANSFER_BLOCK_MESSAGES.unsaved).toMatch(/speichern/);
    expect(TRANSFER_BLOCK_MESSAGES.dirty).toMatch(/speichern/);
  });
});

describe('watchUnsavedChanges', () => {
  it('merkt Eingaben im SYBOS-Formular und meldet sie einmal', () => {
    const form = setupForm();
    const listener = vi.fn();
    watchUnsavedChanges(document);
    onUnsavedChange(listener);

    const area = form.querySelector('textarea')!;
    area.dispatchEvent(new Event('input', { bubbles: true }));
    area.dispatchEvent(new Event('change', { bubbles: true }));

    expect(hasUnsavedChanges()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('übersieht Eingaben im eigenen Widget', () => {
    setupForm();
    watchUnsavedChanges(document);

    document
      .querySelector('#einsatzkarte-widget input')!
      .dispatchEvent(new Event('input', { bubbles: true }));

    expect(hasUnsavedChanges()).toBe(false);
  });

  it('hängt sich nur einmal an, auch bei neuem Aufbau des Panels', () => {
    const form = setupForm();
    const listener = vi.fn();
    watchUnsavedChanges(document);
    watchUnsavedChanges(document);
    onUnsavedChange(listener);

    form.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('lässt sich abmelden', () => {
    const form = setupForm();
    const listener = vi.fn();
    watchUnsavedChanges(document);
    const unsubscribe = onUnsavedChange(listener);
    unsubscribe();

    form.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(listener).not.toHaveBeenCalled();
  });
});
