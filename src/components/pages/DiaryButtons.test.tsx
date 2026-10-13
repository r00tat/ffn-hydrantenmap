// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { Diary, FirecallItem } from '../firebase/firestore';

vi.mock('../FirecallItems/FirecallItemUpdateDialog', () => ({
  default: ({ item }: { item: FirecallItem }) => (
    <div role="dialog">
      Dialog {item.type} {item.name}
    </div>
  ),
}));
vi.mock('../FirecallItems/DeleteFirecallItemDialog', () => ({
  default: () => <div role="alertdialog">Löschen</div>,
}));

const { default: DiaryButtons } = await import('./DiaryButtons');

const unit = {
  id: 'u1',
  type: 'tacticalUnit',
  name: '1. Zug',
} as FirecallItem;

describe('DiaryButtons', () => {
  it('bietet bei gespeicherten Einträgen Bearbeiten und Löschen', () => {
    const diary = {
      id: 'd1',
      type: 'diary',
      datum: '',
      name: 'Lagemeldung',
      editable: true,
    } as Diary;
    renderWithIntl(<DiaryButtons diary={diary} />);
    expect(
      screen.getByRole('button', { name: 'Lagemeldung bearbeiten' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lagemeldung löschen' }),
    ).toBeInTheDocument();
  });

  it('öffnet bei abgeleiteten Einträgen das Einsatzmittel, ohne Löschen', async () => {
    const user = userEvent.setup();
    const diary = {
      id: 'alarmierungu1',
      type: 'diary',
      datum: '',
      name: '1. Zug alarmiert',
      editable: false,
      original: unit,
    } as Diary;
    renderWithIntl(<DiaryButtons diary={diary} />);

    expect(screen.queryByRole('button', { name: /löschen/ })).toBeNull();
    await user.click(
      screen.getByRole('button', {
        name: '1. Zug bearbeiten (Alarmierung, Eintreffen, Abrücken, Stärke)',
      }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Dialog tacticalUnit 1. Zug',
    );
  });

  it('zeigt nichts bei Einträgen ohne Quelle, die nicht bearbeitbar sind', () => {
    const diary = {
      id: 'x',
      type: 'diary',
      datum: '',
      name: 'Fest',
      editable: false,
    } as Diary;
    const { container } = renderWithIntl(<DiaryButtons diary={diary} />);
    expect(container).toBeEmptyDOMElement();
  });
});
