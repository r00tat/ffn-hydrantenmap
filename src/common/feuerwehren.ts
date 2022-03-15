export interface Feuerwehr {
  name: string;
  abschnitt: number;
}

export interface FeuerwehrMap {
  [key: string]: Feuerwehr;
}

export const feuerwehren: FeuerwehrMap = {
  neusiedl: {
    name: 'Neusiedl am See',
    abschnitt: 1,
  },
  fallback: {
    name: 'Fallback',
    abschnitt: 0,
  },
  jois: {
    name: 'Jois',
    abschnitt: 1,
  },
  weiden: {
    name: 'Weiden am See',
    abschnitt: 1,
  },
  winden: {
    name: 'Winden am See',
    abschnitt: 1,
  },
  kaisersteinbruch: {
    name: 'Kaisersteinbruch',
    abschnitt: 1,
  },
  bruckneudorf: {
    name: 'Bruckneudorf',
    abschnitt: 1,
  },
  parndorf: {
    name: 'Parndorf',
    abschnitt: 4,
  },
  gattendorf: {
    name: 'Gattendorf',
    abschnitt: 4,
  },
  zurndorf: {
    name: 'Zurndorf',
    abschnitt: 4,
  },
  potzneusiedl: {
    name: 'Potzneusiedl',
    abschnitt: 4,
  },
};
