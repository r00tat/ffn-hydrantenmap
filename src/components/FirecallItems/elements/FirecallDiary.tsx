import { ReactNode } from 'react';
import { Diary, FirecallItem } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallDiary extends FirecallItemBase {
  nummer: number;
  von: string;
  an: string;
  erledigt: string;

  public constructor(firecallItem?: Diary) {
    super(firecallItem);
    this.type = 'diary';
    this.von = firecallItem?.von ?? '';
    this.an = firecallItem?.an ?? '';
    this.erledigt = firecallItem?.erledigt ?? '';
    this.nummer = firecallItem?.nummer ?? 1;
  }

  public data(): Diary {
    return {
      ...super.data(),
      von: this.von,
      an: this.an,
      erledigt: this.erledigt,
      nummer: this.nummer,
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
      name: 'Information',
      beschreibung: 'Anmerkung',
      erledigt: 'Erledigt',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      name: 'textarea',
      beschreibung: 'textarea',
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
}
