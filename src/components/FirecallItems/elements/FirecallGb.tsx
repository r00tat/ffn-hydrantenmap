import { ReactNode } from 'react';
import { FirecallItem, GeschaeftsbuchEintrag } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallGb extends FirecallItemBase {
  nummer: number;
  von: string;
  an: string;
  ausgehend: boolean;

  public constructor(firecallItem?: GeschaeftsbuchEintrag) {
    super(firecallItem);
    this.type = 'gb';
    this.von = firecallItem?.von ?? '';
    this.an = firecallItem?.an ?? '';
    this.nummer = firecallItem?.nummer ?? 1;
    this.ausgehend = firecallItem?.ausgehend ?? false;
  }

  public data(): GeschaeftsbuchEintrag {
    return {
      ...super.data(),
      von: this.von,
      an: this.an,
      ausgehend: this.ausgehend,
      nummer: this.nummer,
    } as GeschaeftsbuchEintrag;
  }

  public copy(): FirecallGb {
    return Object.assign(new FirecallGb(this.data()), this);
  }

  public markerName() {
    return 'Geschäftsbuch';
  }

  public dialogText(): ReactNode {
    return (
      <>
        Geschäftsbuch {this.nummer} {this.name}
      </>
    );
  }

  public fields(): { [fieldName: string]: string } {
    return {
      nummer: 'Nummer',
      datum: 'Datum',
      ausgehend: 'Ausgehende Meldung',
      von: 'Meldung von',
      an: 'Meldung an',
      name: 'Information',
      beschreibung: 'Anmerkung',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      name: 'textarea',
      beschreibung: 'textarea',
      ausgehend: 'boolean',
    };
  }

  public dateFields(): string[] {
    return ['datum'];
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>{this.name}</b>
        <br />
        {this.beschreibung || ''}
      </>
    );
  }
  public titleFn(): string {
    return `${this.markerName()} ${this.name}\n${this.beschreibung || ''}`;
  }

  public static factory(): FirecallItemBase {
    return new FirecallGb();
  }

  public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
    return <></>;
  }
}
