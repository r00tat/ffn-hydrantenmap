import { ReactNode } from 'react';
import { Diary, FirecallItem } from '../../firebase/firestore';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';
import { SimpleMap } from '../../../common/types';
import { formatTimestamp } from '../../../common/time-format';

export class FirecallDiary extends FirecallItemBase {
  nummer: number;
  von: string;
  an: string;
  erledigt: string;
  art: string;

  public constructor(firecallItem?: Diary) {
    super(firecallItem);
    this.type = 'diary';
    ({
      nummer: this.nummer = 1,
      von: this.von = '',
      an: this.an = '',
      erledigt: this.erledigt = '',
      art: this.art = 'M',
    } = firecallItem || {});
  }

  public data(): Diary {
    return {
      ...super.data(),
      von: this.von,
      an: this.an,
      erledigt: this.erledigt,
      nummer: this.nummer,
      art: this.art,
    } as Diary;
  }

  public copy(): FirecallDiary {
    return Object.assign(new FirecallDiary(this.data()), this);
  }

  public markerName() {
    return 'Einsatztagebuch';
  }

  public dialogText(): ReactNode {
    return <>Einsatztagebuch {this.name}</>;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      nummer: 'Nummer',
      datum: 'Datum',
      von: 'Meldung von',
      an: 'Meldung an',
      art: 'Art der Meldung',
      name: 'Information',
      beschreibung: 'Anmerkung',
      erledigt: 'Erledigt',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      name: 'textarea',
      beschreibung: 'textarea',
      art: 'select',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {
      art: {
        M: 'Meldung',
        F: 'Frage',
        B: 'Befehl',
      },
    };
  }

  public dateFields(): string[] {
    return ['datum', 'erledigt'];
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
    return new FirecallDiary();
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
          {this.art}: {this.name}
          <br />
          Anmerkung: {this.beschreibung}
        </>
      </>
    );
  }
}
