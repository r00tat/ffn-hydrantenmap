export interface TaktischesZeichenIcon {
  url: string;
  width?: number;
  height?: number;
}

export interface TaktischeZeichen {
  [group: string]: { [name: string]: TaktischesZeichenIcon };
}

export const icons: TaktischeZeichen = {
  Einrichtungen: {
    Ständige_ortsfeste_Einrichtung: {
      url: '/icons/taktische_zeichen/Einrichtungen/Ständige_ortsfeste_Einrichtung.png',
    },
    Vorübergehende_anlassbezogene_Einrichtung: {
      url: '/icons/taktische_zeichen/Einrichtungen/Vorübergehende_anlassbezogene_Einrichtung.png',
    },
  },
  Führungsstelle: {
    Befehls_Führungs_Leitstelle: {
      url: '/icons/taktische_zeichen/Fuehrungsstelle/BefehlsFuehrungsLeitstelle.png',
    },
  },
  Formation_von_Kräften: {
    Einheit: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/Einheit.png',
    },
    Trupp: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/Trupp.png',
    },
    Gruppe: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/Gruppe.png',
    },
    Zug: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/Zug.png',
    },
    Bereitschaft: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/Bereitschaft.png',
    },
    Abschnitt: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/Abschnitt.png',
    },
    Bezirk: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/Bezirk.png',
    },
    LFV: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/LFV.png',
    },
    ÖBFV: {
      url: '/icons/taktische_zeichen/Formation_von_Kraeften/OEBFV.png',
    },
  },
  Gefahren: {
    Ansteckungsgefahr: {
      url: '/icons/taktische_zeichen/Gefahren/Ansteckungsgefahr.png',
    },
    Brandgefahr: {
      url: '/icons/taktische_zeichen/Gefahren/Brandgefahr.png',
    },
    Chemiegefahr: {
      url: '/icons/taktische_zeichen/Gefahren/Chemiegefahr.png',
    },
    Explosionsgefahr: {
      url: '/icons/taktische_zeichen/Gefahren/Explosionsgefahr.png',
    },
    Gasgefahr: {
      url: '/icons/taktische_zeichen/Gefahren/Gasgefahr.png',
    },
    Gefahr_allgemein: {
      url: '/icons/taktische_zeichen/Gefahren/Gefahr_allgemein.png',
    },
    Gefahr_durch_Elektrizität: {
      url: '/icons/taktische_zeichen/Gefahren/Gefahr_durch_Elektrizität.png',
    },
    Gefahr_durch_Verrauchung: {
      url: '/icons/taktische_zeichen/Gefahren/Gefahr_durch_Verrauchung.png',
    },
    'Lawinen-,_Muren-_oder_Felssturzgefahr': {
      url: '/icons/taktische_zeichen/Gefahren/Lawinen-,_Muren-_oder_Felssturzgefahr.png',
    },
    Strahlengefahr: {
      url: '/icons/taktische_zeichen/Gefahren/Strahlengefahr.png',
    },
    Überflutungsgefahr: {
      url: '/icons/taktische_zeichen/Gefahren/Überflutungsgefahr.png',
    },
  },
  Personen: {
    Person: {
      url: '/icons/taktische_zeichen/Personen/Person.png',
    },
    Person_in_Kommandantenfunktion: {
      url: '/icons/taktische_zeichen/Personen/Person_in_Kommandantenfunktion.png',
    },
    Person_in_Zwangslage: {
      url: '/icons/taktische_zeichen/Personen/Person_in_Zwangslage.png',
    },
    Person_tot: {
      url: '/icons/taktische_zeichen/Personen/Person_tot.png',
    },
    'Person_unter_Atem-_oder_Körperschutz': {
      url: '/icons/taktische_zeichen/Personen/Person_unter_Atem-_oder_Körperschutz.png',
    },
    Person_verletzt: {
      url: '/icons/taktische_zeichen/Personen/Person_verletzt.png',
    },
    Person_vermisst: {
      url: '/icons/taktische_zeichen/Personen/Person_vermisst.png',
    },
  },
  Schäden: {
    Beschädigt: {
      url: '/icons/taktische_zeichen/Schäden/Beschädigt.png',
    },
    Chemieaustritt: {
      url: '/icons/taktische_zeichen/Schäden/Chemieaustritt.png',
    },
    'Entstehungsbrand,_Schwelbrand': {
      url: '/icons/taktische_zeichen/Schäden/Entstehungsbrand_Schwelbrand.png',
    },
    Entwickelter_Brand: {
      url: '/icons/taktische_zeichen/Schäden/Entwickelter_Brand.png',
    },
    Gasaustritt: {
      url: '/icons/taktische_zeichen/Schäden/Gasaustritt.png',
    },
    'Lawine,_Mure,_Felssturz': {
      url: '/icons/taktische_zeichen/Schäden/Lawine_Mure_Felssturz.png',
    },
    Schaden_allgemein: {
      url: '/icons/taktische_zeichen/Schäden/Schaden_allgemein.png',
    },
    Strahlung_oder_radioaktive_Kontamination: {
      url: '/icons/taktische_zeichen/Schäden/Strahlung_oder_radioaktive_Kontamination.png',
    },
    Teilzerstört: {
      url: '/icons/taktische_zeichen/Schäden/Teilzerstört.png',
    },
    Überflutung: {
      url: '/icons/taktische_zeichen/Schäden/Überflutung.png',
    },
    'Unterbrochen,_blockiert,_gesperrt': {
      url: '/icons/taktische_zeichen/Schäden/unterbrochen_blockiert_gesperrt.png',
    },
    Verseuchung: {
      url: '/icons/taktische_zeichen/Schäden/Verseuchung.png',
    },
    Vollbrand: {
      url: '/icons/taktische_zeichen/Schäden/Vollbrand.png',
    },
    Zerstört: {
      url: '/icons/taktische_zeichen/Schäden/Zerstört.png',
    },
  },
  'Schiene,Wasser,Luft': {
    Flächenflugzeug: {
      url: '/icons/taktische_zeichen/Schiene_Wasser_Luft/Flaechenflugzeug.png',
    },
    Hubschrauber: {
      url: '/icons/taktische_zeichen/Schiene_Wasser_Luft/Hubschrauber.png',
    },
    Schienenfahrzeug: {
      url: '/icons/taktische_zeichen/Schiene_Wasser_Luft/Schienenfahrzeug.png',
    },
    Wasserfahrzeug: {
      url: '/icons/taktische_zeichen/Schiene_Wasser_Luft/Wasserfahrzeug.png',
    },
  },
};

export const iconKeys: { [name: string]: TaktischesZeichenIcon } =
  Object.fromEntries(
    Object.entries(icons)
      .map(([group, groupIcons]) => Object.entries(groupIcons))
      .flat()
  );
// console.info(`iconKeys: ${JSON.stringify(iconKeys)}`);
