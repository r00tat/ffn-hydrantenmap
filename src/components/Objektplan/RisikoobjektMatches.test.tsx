// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RisikoObjekt } from '../../common/gis-objects';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { Firecall, FirecallLocation } from '../firebase/firestore';
import RisikoobjektMatches from './RisikoobjektMatches';

const objekte: RisikoObjekt[] = [
  {
    id: 'metro',
    name: 'Metro',
    adresse: 'Wienerstraße 110',
    einsatzplanummer: '31',
    erfassungsdatum: '',
    ortschaft: 'ND',
    risikogruppe: 'Geschäftsbauten',
    lat: 47.96743,
    lng: 16.83887,
  },
  {
    id: 'weit',
    name: 'Volksschule',
    adresse: 'Schulgasse 1',
    einsatzplanummer: '',
    erfassungsdatum: '',
    ortschaft: 'ND',
    risikogruppe: 'Schulen',
    lat: 47.9,
    lng: 16.7,
  },
];

let locations: Partial<FirecallLocation>[] = [];

vi.mock('../../hooks/useFirebaseCollection', () => ({
  useFirebaseCollectionState: () => ({ records: objekte, loading: false, fromCache: false }),
}));
vi.mock('../../hooks/useFirecallLocations', () => ({
  default: () => ({ locations, loading: false }),
}));
vi.mock('./ObjektplanDialog', () => ({
  default: ({ objekt }: { objekt: RisikoObjekt }) => <div>Dialog {objekt.name}</div>,
}));

function firecall(partial: Partial<Firecall>): Firecall {
  return { id: 'f1', name: 'Einsatz', ...partial };
}

describe('RisikoobjektMatches', () => {
  beforeEach(() => {
    locations = [];
  });

  it('zeigt ein Objekt aus dem Alarmtext und öffnet seine Pläne', () => {
    renderWithIntl(
      <RisikoobjektMatches
        firecall={firecall({
          description: 'Neusiedl am See/SA1/B3/BMA/Neusiedl am See/Wiener Straße/110/',
        })}
      />,
    );
    expect(screen.getByText('Mögliche Risikoobjekte')).toBeInTheDocument();
    expect(screen.getByText('Metro')).toBeInTheDocument();
    expect(screen.getByText('Adresse')).toBeInTheDocument();
    expect(screen.queryByText('Volksschule')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Metro'));
    expect(screen.getByText('Dialog Metro')).toBeInTheDocument();
  });

  it('zieht Lage und Adresse der Einsatzorte heran', () => {
    locations = [{ id: 'l1', street: 'Wiener Straße', number: '110', lat: 47.9674, lng: 16.8389 }];
    renderWithIntl(<RisikoobjektMatches firecall={firecall({})} />);
    expect(screen.getByText('Metro')).toBeInTheDocument();
    expect(screen.getByText('< 50 m')).toBeInTheDocument();
  });

  it('zeigt nichts, wenn nichts passt', () => {
    const { container } = renderWithIntl(
      <RisikoobjektMatches firecall={firecall({ name: 'Ölspur', lat: 47.0, lng: 16.0 })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
