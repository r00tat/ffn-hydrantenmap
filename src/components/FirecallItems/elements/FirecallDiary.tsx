import { ReactNode } from 'react';
import { Diary, FirecallItem } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallDiary extends FirecallItemBase {
  von: string;
  an: string;
  erledigt: string;

  public constructor(firecallItem?: Diary) {
    super(firecallItem);
    this.type = 'diary';
    this.von = firecallItem?.von ?? '';
    this.an = firecallItem?.an ?? '';
    this.erledigt = firecallItem?.erledigt ?? '';
  }

  public data(): Diary {
    return {
      ...super.data(),
      von: this.von,
      an: this.an,
      erledigt: this.erledigt,
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
      ...super.fields(),
      von: 'Meldung von',
      an: 'Meldung an',
      erledigt: 'Erledigt',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {};
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
