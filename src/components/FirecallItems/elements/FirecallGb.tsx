import { ReactNode } from 'react';
import { FirecallItem, GeschaeftsbuchEintrag } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';
import { formatTimestamp } from '../../../common/time-format';

export class FirecallGb extends FirecallItemBase {
  nummer: number;
  von: string;
  an: string;
  ausgehend: boolean;
  weiterleitung: string;

  public constructor(firecallItem?: GeschaeftsbuchEintrag) {
    super(firecallItem);
    this.type = 'gb';
    this.von = firecallItem?.von ?? '';
    this.an = firecallItem?.an ?? '';
    this.nummer = firecallItem?.nummer ?? 1;
    this.ausgehend = firecallItem?.ausgehend ?? false;
    this.weiterleitung = firecallItem?.weiterleitung ?? '';
  }

  public data(): GeschaeftsbuchEintrag {
    return {
      ...super.data(),
      von: this.von,
      an: this.an,
      ausgehend: this.ausgehend,
      nummer: this.nummer,
      weiterleitung: this.weiterleitung,
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
      weiterleitung: 'Weiterleiten an (S1, S2, ...)',
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

  public body(): ReactNode {
    return (
      <>
        <>
          #{this.nummer} {formatTimestamp(this.datum)}
          <br />
          {this.von && (
            <>
              Von: {this.von}
              <br />
            </>
          )}
          {this.an && (
            <>
              An: {this.an}
              <br />
            </>
          )}
          {this.ausgehend ? 'Ausgehend' : 'Eingehend'}: {this.name}
          Weiterleitung: {this.weiterleitung} <br />
          <br />
          Anmerkung: {this.beschreibung}
        </>
      </>
    );
  }
}
