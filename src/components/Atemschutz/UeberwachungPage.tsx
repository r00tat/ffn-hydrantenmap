'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  buildDruckabfrage,
  canTransition,
  erneuterEinsatz,
  newTruppKey,
  sammelplatzUebergabePatch,
  sanitizeMitglieder,
  sanitizeTruppGeraete,
  uebernahmePatch,
  type AtemschutzTrupp,
  type DruckabfrageInput,
  type TruppGeraet,
  type TruppInput,
  type TruppPatch,
} from '../../common/atemschutz';
import {
  sortierteAbfragen,
  vorgabeGeraetesatz,
} from '../../common/atemschutzUeberwachung';
import useAtemschutzEinsatzdaten from '../../hooks/useAtemschutzEinsatzdaten';
import useAtemschutzGeraete from '../../hooks/useAtemschutzGeraete';
import useAtemschutzPersonSuggestions from '../../hooks/useAtemschutzPersonSuggestions';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import useNotificationPermission, {
  pruefeNotificationErlaubnis,
  type NotificationErlaubnis,
} from '../../hooks/useNotificationPermission';
import useRegisterMessaging from '../../hooks/useRegisterMessaging';
import { requestPermission } from '../firebase/messaging';
import useTicker from '../../hooks/useTicker';
import useVehicles from '../../hooks/useVehicles';
import {
  addDruckabfrage,
  addTrupp,
  updateTrupp,
  updateUeberwachung,
  type AtemschutzActor,
} from './atemschutzStore';
import TruppDialog from './TruppDialog';
import TruppZeitDialog, { type TruppZeitModus } from './TruppZeitDialog';
import TruppGeraeteDialog from './TruppGeraeteDialog';
import DruckabfrageDialog from './DruckabfrageDialog';
import UeberwachungCard from './UeberwachungCard';
import UeberwachungDialog, {
  type UeberwachungEingabe,
} from './UeberwachungDialog';
import {
  ALLE_EINHEITEN as ALLE,
  ASSP_EINHEIT,
  einheitOptionen,
  einheitTabs,
  istEinheitName,
  truppPasstZuEinheit,
  type EinheitTab,
} from './einheiten';
import { planeUeberwachungWarnung } from './ueberwachungTaskAction';
import useUeberwachungHinweise from './useUeberwachungHinweise';

/**
 * Die **eigene** Einheit des Geräts steht im `localStorage` — nicht am
 * Benutzer und nicht am Einsatz.
 *
 * Nicht am Benutzer, weil auf einem Fahrzeug mehrere Leute ein Konto teilen —
 * das ist hier der Regelfall. Nicht je Einsatz, weil dasselbe Fahrzeug im
 * nächsten Einsatz dieselbe Einheit ist und die Wahl sonst in jedem Einsatz neu
 * zu treffen wäre, im ungünstigsten Moment.
 *
 * Sie ist eine Angabe über das Gerät und **kein Filter**: Sie stellt den
 * eigenen Reiter voran, wählt ihn beim Laden aus, ordnet neue Trupps zu und
 * entscheidet, für welche Trupps die offene Seite selbst warnt. Was angezeigt
 * wird, entscheidet dagegen der Reiter.
 */
const EINHEIT_STORAGE_KEY = 'asue-einheit';

function leseEinheit(): string {
  if (typeof window === 'undefined') return ALLE;
  try {
    return window.localStorage.getItem(EINHEIT_STORAGE_KEY) || ALLE;
  } catch {
    // Ein Browser mit gesperrtem Speicher darf die Seite nicht mitnehmen —
    // dann bleibt eben „alle Trupps".
    return ALLE;
  }
}

/** Welcher Hinweistext zu welchem Erlaubniszustand gehört. */
const PUSH_HINWEIS: Record<
  NotificationErlaubnis,
  'offen' | 'ein' | 'aus' | 'nichtMoeglich'
> = {
  unbekannt: 'offen',
  default: 'offen',
  granted: 'ein',
  denied: 'aus',
  nichtMoeglich: 'nichtMoeglich',
};

type Dialog =
  | { art: 'trupp'; trupp?: AtemschutzTrupp }
  | { art: 'ueberwachung'; trupp: AtemschutzTrupp }
  | { art: 'druckabfrage'; trupp: AtemschutzTrupp }
  | { art: 'geraete'; trupp: AtemschutzTrupp }
  | {
      art: 'zeit';
      trupp: AtemschutzTrupp;
      modus: TruppZeitModus;
      /** Der Abmarsch legt eine *neue* Bereitstellung an (Trupp war zurück). */
      neueZeile?: boolean;
    };

/**
 * Atemschutzüberwachung — die Einsatzzeitkontrolle des Gruppenkommandanten.
 *
 * Eine eigene Seite und **kein Reiter des Sammelplatzes**: „Diese übergeordnete
 * Atemschutzüberwachung [am ASSP] hat ausschließlich logistische Aufgaben; sie
 * führt KEINE ZEITKONTROLLE durch." (FH-06 5.3.4). Die Zeitkontrolle beginnt
 * mit dem ersten Trupp und muss deshalb ohne eingerichteten Sammelplatz
 * funktionieren — hier lässt sich ein Trupp auch dann erfassen, wenn er nie
 * über einen ASSP lief.
 *
 * Gearbeitet wird auf derselben Sammlung wie am Sammelplatz
 * (`call/{id}/atemschutzTrupp`): Ein am ASSP bereitgestellter Trupp taucht
 * damit von selbst hier auf, sobald er entsendet ist — „nicht erst, wenn ich
 * ihn suche".
 */
export default function UeberwachungPage() {
  const t = useTranslations('atemschutz');
  const firecallId = useFirecallId();
  const firecall = useFirecall();
  const hatEinsatz = !!firecallId && firecallId !== 'unknown';
  // Ohne Einsatz kein Schreiben: `firecallId` ist dann die Platzhalter-ID
  // `unknown`, und jeder Schreibvorgang darauf endet in permission-denied.
  const canWrite = useFirecallWriteAccess() && hatEinsatz;
  const { uid, displayName, email } = useFirebaseLogin();
  const jetzt = useTicker();
  const registerMessaging = useRegisterMessaging();

  const groupId = firecall?.group;
  const { flaschen, activeGeraete, feuerwehren } =
    useAtemschutzGeraete(groupId);
  const { trupps } = useAtemschutzEinsatzdaten(firecallId);
  const { vehicles, tacticalUnits } = useVehicles();

  const suggestions = useAtemschutzPersonSuggestions(groupId, {
    trupps: trupps.protokoll,
    asspLeiter: firecall?.asspLeiter,
    asspFuellpersonal: firecall?.asspFuellpersonal,
  });

  // Der Gerätesatz, mit dem gerechnet wird, solange am Trupp keiner steht —
  // abgelesen aus dem eigenen Flaschenbestand.
  const vorgabe = useMemo(() => vorgabeGeraetesatz(flaschen), [flaschen]);

  const [meineEinheit, setMeineEinheit] = useState<string>(leseEinheit);
  // Der Reiter startet auf der eigenen Einheit: Der Fokus gehört auf die
  // eigenen Trupps, nicht auf die Gesamtlage.
  const [tab, setTab] = useState<string>(leseEinheit);

  const waehleMeineEinheit = useCallback((wert: string) => {
    setMeineEinheit(wert);
    // Beides in einem Aufruf und nicht in einem Effekt: Wer seine Einheit
    // wechselt, will deren Trupps sehen — und `set-state-in-effect` verbietet
    // die nachgelagerte Variante ohnehin.
    setTab(wert);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(EINHEIT_STORAGE_KEY, wert);
    } catch {
      // s.o. — die Wahl gilt dann nur für diese Sitzung.
    }
  }, []);

  /** Fahrzeuge und taktische Einheiten des Einsatzes. */
  const bekannteEinheiten = useMemo(() => {
    const namen: string[] = [];
    const gesehen = new Set<string>();
    const add = (value?: string) => {
      const v = value?.trim();
      if (!v || gesehen.has(v.toLowerCase())) return;
      gesehen.add(v.toLowerCase());
      namen.push(v);
    };
    for (const fzg of vehicles) add(fzg.name);
    for (const e of tacticalUnits) add(e.name);
    return namen;
  }, [vehicles, tacticalUnits]);

  /**
   * Die Einheiten zur Wahl und als Vorschlag: die am Trupp vergebenen *und* die
   * Fahrzeuge des Einsatzes. Nur die vergebenen wären beim ersten Trupp eine
   * leere Liste — genau dann, wenn die Einheit zu wählen ist.
   */
  const einheiten = useMemo(
    () =>
      einheitOptionen({
        trupps: trupps.protokoll,
        bekannt: bekannteEinheiten,
        gewaehlt: meineEinheit,
      }),
    [bekannteEinheiten, meineEinheit, trupps.protokoll],
  );

  /** Die Reiter: eigene Einheit zuerst, dann die anderen, dann die Gesamtlage. */
  const tabs = useMemo(
    () =>
      einheitTabs({
        trupps: trupps.protokoll,
        aktuell: trupps.aktuell,
        gewaehlt: meineEinheit,
      }),
    [meineEinheit, trupps.aktuell, trupps.protokoll],
  );

  // Ein Reiter kann verschwinden — der letzte Trupp einer Einheit wird
  // abgemeldet, ein Einsatz gewechselt. Dann gilt die Gesamtlage, statt eine
  // leere Seite unter einem Reiter zu zeigen, den es nicht mehr gibt.
  const aktiverTab = tabs.some((x) => x.key === tab) ? tab : ALLE;

  const passt = useCallback(
    (trupp: AtemschutzTrupp) => truppPasstZuEinheit(trupp, aktiverTab),
    [aktiverTab],
  );

  /**
   * Die Einheit, der ein hier erfasster oder entsendeter Trupp zufällt.
   *
   * Der Reiter zuerst: Wer unter „RLFA-ND" einen Trupp anlegt, erwartet ihn
   * dort und nicht unter einem Reiter, den er gerade nicht ansieht. Steht dort
   * eine Sammelkategorie („ASSP", „alle"), gilt die eigene Einheit.
   */
  const zielEinheit = istEinheitName(aktiverTab)
    ? aktiverTab
    : istEinheitName(meineEinheit)
      ? meineEinheit
      : undefined;

  // Gemerkt und nicht bei jedem Render neu: Die Liste hängt am Effekt der
  // Warnhinweise, und ein neues Array je Render ließe ihn jedes Mal laufen.
  const imEinsatz = useMemo(
    () => trupps.imEinsatz.filter(passt),
    [passt, trupps.imEinsatz],
  );
  const bereit = useMemo(
    () => trupps.bereit.filter(passt),
    [passt, trupps.bereit],
  );
  const zurueck = useMemo(
    () => trupps.zurueck.filter(passt),
    [passt, trupps.zurueck],
  );
  const protokoll = useMemo(
    () => trupps.protokoll.filter(passt),
    [passt, trupps.protokoll],
  );
  const aktuellIds = useMemo(
    () => new Set(trupps.aktuell.map((x) => x.id)),
    [trupps.aktuell],
  );

  /**
   * Für welche Trupps die **offene Seite** selbst warnt.
   *
   * Bewusst nicht die angezeigte Liste: Ein Blick auf den Reiter des
   * Sammelplatzes darf die Warnungen der eigenen Trupps nicht abschalten. Die
   * Zuständigkeit entscheidet, nicht die Ansicht — also die Trupps der eigenen
   * Einheit und die, an denen dieses Konto schon gearbeitet hat
   * (`ueberwachungUids`, dieselbe Liste, die der Push-Versand verwendet).
   *
   * Ohne eigene Einheit bleibt es bei allen Trupps im Einsatz: Wer die
   * Gesamtlage offen hat, soll nicht weniger sehen als vorher.
   */
  const zuUeberwachen = useMemo(() => {
    if (!istEinheitName(meineEinheit)) return trupps.imEinsatz;
    return trupps.imEinsatz.filter(
      (t) =>
        truppPasstZuEinheit(t, meineEinheit) ||
        (!!uid && !!t.ueberwachungUids?.includes(uid)),
    );
  }, [meineEinheit, trupps.imEinsatz, uid]);

  // Warnungen aus der offenen Seite heraus — der Serverlauf erreicht nur
  // Geräte mit Push-Token, und in der Entwicklung gibt es keinen Zeitplan.
  useUeberwachungHinweise({
    firecallId,
    firecallName: firecall?.name,
    trupps: zuUeberwachen,
    jetzt,
    vorgabe,
  });

  const [dialog, setDialog] = useState<Dialog>();
  // Nur die einmalige Bestätigung nach dem Einschalten — kein Dauerzustand.
  const [pushBestaetigung, setPushBestaetigung] = useState(false);

  /**
   * Der Zustand kommt vom **Gerät** und nicht aus dieser Sitzung.
   *
   * Vorher stand er in einem `useState`, das mit „offen" begann: Nach jedem
   * Neuladen forderte die Seite erneut auf, Benachrichtigungen einzuschalten,
   * obwohl die Erlaubnis längst erteilt war. Siehe `useNotificationPermission`.
   */
  const pushErlaubnis = useNotificationPermission();

  /**
   * Ist die Erlaubnis schon erteilt, wird der Push-Token ohne Zutun
   * nachgetragen.
   *
   * Ohne das hätte ein Gerät die Erlaubnis, aber keinen registrierten Token —
   * die Warnung käme dann nur, solange die Seite offen ist. Ein Dialog erscheint
   * dabei nicht (die Erlaubnis liegt vor), und `registerMessaging` tut nichts,
   * wenn der Token schon eingetragen ist.
   */
  useEffect(() => {
    if (pushErlaubnis !== 'granted') return;
    registerMessaging().catch((err) => {
      console.warn('Push-Registrierung fehlgeschlagen', err);
    });
  }, [pushErlaubnis, registerMessaging]);

  /** Benachrichtigungen einschalten — als Handlung und nicht beim Laden. */
  const handlePushErlauben = useCallback(async () => {
    const erlaubt = await requestPermission().catch(() => false);
    if (erlaubt) {
      await registerMessaging().catch((err) => {
        console.warn('Push-Registrierung fehlgeschlagen', err);
      });
    }
    // Nachlesen statt merken: In Safari und in der App gibt es kein
    // `change`-Ereignis, auf das der Hook warten könnte.
    await pruefeNotificationErlaubnis();
    setPushBestaetigung(erlaubt);
  }, [registerMessaging]);

  /**
   * Ob überhaupt ein Hinweis nötig ist.
   *
   * Bei erteilter Erlaubnis nicht: Dann kommen die Warnungen an, und das ist
   * der Normalfall — dafür braucht es keine dauerhafte Zeile.
   */
  const braucheHinweis =
    pushErlaubnis !== 'granted' && pushErlaubnis !== 'unbekannt';

  const actorNow = useCallback(
    (): AtemschutzActor => ({
      userId: uid ?? '',
      now: new Date().toISOString(),
    }),
    [uid],
  );

  /**
   * Den Termin der nächsten Warnung neu planen (Cloud Tasks, serverseitig).
   *
   * Nach jedem Schreibvorgang, der die Fristen verschiebt — der Client schreibt
   * direkt in Firestore, der Server bekommt das sonst nicht mit. Fehler bleiben
   * im Log: Der Zeitplan ist das Netz darunter, und diese Seite warnt selbst.
   */
  const planeWarnung = useCallback(
    async (truppId?: string) => {
      if (!truppId || !hatEinsatz) return;
      await planeUeberwachungWarnung(firecallId, truppId).catch((err) => {
        console.warn('Terminplanung der Atemschutzwarnung fehlgeschlagen', err);
      });
    },
    [firecallId, hatEinsatz],
  );

  const handleSaveTrupp = useCallback(
    async (input: TruppInput, trupp?: AtemschutzTrupp) => {
      const stamp = actorNow();
      const basis = {
        feuerwehr: input.feuerwehr.trim(),
        mitglieder: sanitizeMitglieder(input.mitglieder),
        ...(input.truppName?.trim()
          ? { truppName: input.truppName.trim() }
          : {}),
        ...(input.bemerkung?.trim()
          ? { bemerkung: input.bemerkung.trim() }
          : {}),
        // Aus dem Dialog, sonst aus dem Reiter bzw. der eigenen Einheit: Wer
        // bei seinem Fahrzeug einen Trupp erfasst, erfasst ihn für dieses.
        ...(input.entsendetAn?.trim()
          ? { entsendetAn: input.entsendetAn.trim() }
          : zielEinheit
            ? { entsendetAn: zielEinheit }
            : {}),
      };
      if (trupp?.id) {
        await updateTrupp(firecallId, trupp.id, basis, stamp);
        return;
      }
      await addTrupp(
        firecallId,
        {
          ...basis,
          truppKey: newTruppKey(),
          laufendeNummer: 1,
          status: 'bereit',
          bereitSeit: stamp.now,
          // Wer den Trupp hier erfasst, hat damit auch die Zeitkontrolle — der
          // Umweg über ein zweites „Übernehmen" wäre ein Klick ohne Erkenntnis.
          ueberwachungSeit: stamp.now,
          ueberwachungUids: stamp.userId ? [stamp.userId] : [],
        },
        stamp,
      );
      // Wer hier einen Trupp erfasst, überwacht ihn ab sofort — und braucht
      // damit die Warnungen. Ohne diesen Aufruf gäbe es für einen Trupp, der
      // nie über eine Übernahme lief, weder Erlaubnis noch Push-Token.
      await registerMessaging().catch((err) => {
        console.warn('Push-Registrierung fehlgeschlagen', err);
      });
    },
    [actorNow, firecallId, registerMessaging, zielEinheit],
  );

  const handleUebernahme = useCallback(
    async (trupp: AtemschutzTrupp, input: UeberwachungEingabe) => {
      if (!trupp.id) return;
      const stamp = actorNow();
      await updateUeberwachung(
        firecallId,
        trupp.id,
        uebernahmePatch({
          trupp,
          jetzt: stamp.now,
          uid: stamp.userId,
          ueberwachtVon: input.ueberwachtVon,
          einsatzziel: input.einsatzziel,
          entsendetAn: input.entsendetAn,
          paTyp: input.paTyp,
          satz: input.satz,
        }),
        stamp,
      );
      // Erst hier den Push-Token holen und nicht beim Laden der Seite: Der
      // Browser fragt dabei nach der Erlaubnis für Benachrichtigungen, und
      // diese Frage soll zu einer Handlung gehören, die sie erklärt.
      await registerMessaging().catch((err) => {
        console.warn('Push-Registrierung fehlgeschlagen', err);
      });
      // Ein anderer Gerätesatz heißt eine andere rechnerische Einsatzdauer und
      // damit andere Fristen.
      await planeWarnung(trupp.id);
    },
    [actorNow, firecallId, planeWarnung, registerMessaging],
  );

  const handleDruckabfrage = useCallback(
    async (trupp: AtemschutzTrupp, input: DruckabfrageInput) => {
      if (!trupp.id) return;
      const stamp = actorNow();
      await addDruckabfrage(
        firecallId,
        trupp,
        buildDruckabfrage(input, { uid: stamp.userId, jetzt: stamp.now }),
        stamp,
      );
      // Der gemessene Verbrauch verschiebt den Rückzugszeitpunkt, und eine
      // Meldung erledigt die nächste Drittelmarke.
      await planeWarnung(trupp.id);
    },
    [actorNow, firecallId, planeWarnung],
  );

  const handleGeraete = useCallback(
    async (trupp: AtemschutzTrupp, truppGeraete: TruppGeraet[]) => {
      if (!trupp.id) return;
      await updateUeberwachung(
        firecallId,
        trupp.id,
        // Bereinigt, weil Firestore `undefined` auch innerhalb der Objekte
        // eines Arrays ablehnt — ein geleertes Namensfeld im Dialog ließe sonst
        // den ganzen Schreibvorgang scheitern.
        { truppGeraete: sanitizeTruppGeraete(truppGeraete) },
        actorNow(),
      );
    },
    [actorNow, firecallId],
  );

  const handleErneuterEinsatz = useCallback(
    async (trupp: AtemschutzTrupp, entsendung: TruppPatch) => {
      const stamp = actorNow();
      // Eine *neue* Zeile und kein Wechsel zurück nach `imEinsatz`: Die alte
      // Bereitstellung ist der Nachweis über den ersten Einsatz — mit ihren
      // Drücken, ihren Abfragen und ihrer Rückkehrzeit.
      const id = await addTrupp(
        firecallId,
        erneuterEinsatz({
          vorherige: trupp,
          jetzt: stamp.now,
          entsendung,
          uid: stamp.userId,
        }),
        stamp,
      );
      await planeWarnung(id);
    },
    [actorNow, firecallId, planeWarnung],
  );

  const handleAnSammelplatz = useCallback(
    async (trupp: AtemschutzTrupp) => {
      if (!trupp.id) return;
      const stamp = actorNow();
      // Kein Zustandswechsel: `zurueck` bleibt `zurueck`. Die neue
      // Bereitstellung entsteht am Sammelplatz über „wieder bereitstellen" —
      // dort wird regeneriert, und dort steht, wer das tut.
      await updateUeberwachung(
        firecallId,
        trupp.id,
        sammelplatzUebergabePatch({ jetzt: stamp.now }),
        stamp,
      );
    },
    [actorNow, firecallId],
  );

  const handlePatch = useCallback(
    async (trupp: AtemschutzTrupp, patch: TruppPatch) => {
      // Dieselbe Schranke wie am Sammelplatz: Zwei Geräte sehen dieselbe Karte,
      // und wer eine Sekunde später drückt, arbeitet auf einem überholten Zustand.
      if (!trupp.id || !canTransition(trupp.status, patch.status)) return;
      await updateTrupp(firecallId, trupp.id, patch, actorNow());
      // Beim Abmarsch entstehen die Fristen überhaupt erst; bei der Rückkehr
      // fällt der Termin weg, und die Planung meldet das mit `nothingDue`.
      await planeWarnung(trupp.id);
    },
    [actorNow, firecallId, planeWarnung],
  );

  const karte = (trupp: AtemschutzTrupp) => (
    <UeberwachungCard
      key={trupp.id}
      trupp={trupp}
      jetzt={jetzt}
      vorgabe={vorgabe}
      canWrite={canWrite}
      istAktuell={aktuellIds.has(trupp.id)}
      onUebernehmen={() => setDialog({ art: 'ueberwachung', trupp })}
      onBearbeiten={() => setDialog({ art: 'ueberwachung', trupp })}
      onDruckabfrage={() => setDialog({ art: 'druckabfrage', trupp })}
      onGeraete={() => setDialog({ art: 'geraete', trupp })}
      onAbmarsch={() => setDialog({ art: 'zeit', trupp, modus: 'entsenden' })}
      onRueckkehr={() => setDialog({ art: 'zeit', trupp, modus: 'rueckkehr' })}
      onErneutEinsatz={() =>
        setDialog({ art: 'zeit', trupp, modus: 'entsenden', neueZeile: true })
      }
      onAnSammelplatz={() => void handleAnSammelplatz(trupp)}
    />
  );

  /** Benannte Einheiten stehen für sich; die Kategorien werden übersetzt. */
  const tabLabel = (eintrag: EinheitTab) =>
    eintrag.name ??
    (eintrag.key === ALLE
      ? t('ueberwachung.einheitAlle')
      : t(
          `ueberwachung.zuordnung.${
            eintrag.key === ASSP_EINHEIT ? 'assp' : 'keine'
          }` as 'ueberwachung.zuordnung.assp',
        ));

  const abschnitt = (
    key: 'imEinsatz' | 'bereit' | 'zurueck',
    liste: AtemschutzTrupp[],
  ) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t(`ueberwachung.sections.${key}`)}
        {liste.length > 0 && ` (${liste.length})`}
      </Typography>
      {liste.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t(`ueberwachung.empty.${key}`)}
        </Typography>
      ) : (
        <Stack spacing={1}>{liste.map(karte)}</Stack>
      )}
    </Box>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 3, pb: 12 }}>
      <Typography variant="h4" gutterBottom>
        {t('ueberwachung.title')}
      </Typography>

      {!hatEinsatz && (
        // Ohne gewählten Einsatz gibt es keine Sammlung, in die geschrieben
        // werden könnte — ein Formular anzubieten führte in ein
        // permission-denied auf die Platzhalter-ID `unknown`.
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('ueberwachung.keinEinsatz')}
        </Alert>
      )}

      {hatEinsatz && !canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('readOnly')}
        </Alert>
      )}

      {canWrite && braucheHinweis && (
        // Nur, wenn etwas zu tun oder zu wissen ist. Bei erteilter Erlaubnis
        // steht hier **nichts**: Ein dauerhaftes „ist eingeschaltet" nimmt auf
        // einem Handy die Zeile weg, in der der erste Trupp stehen soll — die
        // Bestätigung kommt einmal kurz als Einblendung. Solange die Erlaubnis
        // noch nicht gelesen ist (Server-Render, erster Moment nach dem Laden),
        // ebenfalls nichts, sonst blitzte die Aufforderung auf, obwohl längst
        // alles eingeschaltet ist.
        <Alert
          severity={pushErlaubnis === 'default' ? 'info' : 'warning'}
          sx={{ mb: 2 }}
          action={
            // Bei „denied" hilft der Knopf nicht mehr: Der Browser fragt nach
            // einer Ablehnung nicht wieder, das geht nur über seine
            // Website-Einstellungen. Genauso bei einem Gerät ohne
            // Benachrichtigungen.
            pushErlaubnis === 'default' ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => void handlePushErlauben()}
              >
                {t('ueberwachung.actions.pushErlauben')}
              </Button>
            ) : undefined
          }
        >
          {t(
            `ueberwachung.pushHinweis.${PUSH_HINWEIS[pushErlaubnis]}` as 'ueberwachung.pushHinweis.offen',
          )}
        </Alert>
      )}

      <Snackbar
        open={pushBestaetigung}
        autoHideDuration={4000}
        onClose={() => setPushBestaetigung(false)}
        message={t('ueberwachung.pushHinweis.ein')}
      />

      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
      >
        {/* Die eigene Einheit ist eine Angabe über *dieses Gerät* und kein
            Filter: Sie stellt den eigenen Reiter voran und ordnet neue Trupps
            zu. Zur Wahl stehen deshalb alle Fahrzeuge des Einsatzes, nicht nur
            die, an denen schon ein Trupp hängt. */}
        <TextField
          select
          size="small"
          label={t('ueberwachung.einheit')}
          helperText={t('ueberwachung.einheitHint')}
          value={einheiten.includes(meineEinheit) ? meineEinheit : ALLE}
          onChange={(e) => waehleMeineEinheit(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value={ALLE}>{t('ueberwachung.einheitKeine')}</MenuItem>
          {einheiten.map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialog({ art: 'trupp' })}
          >
            {t('ueberwachung.actions.truppErfassen')}
          </Button>
        )}
      </Stack>

      {/* Ein Reiter je Einheit statt eines Filters über einer Liste: Die Wahl
          wirkt damit auf *alle* Abschnitte — vorher blieben „Zurück" und
          „Protokoll" unverändert stehen, und niemand konnte mehr sagen, welche
          Trupps die eigenen sind und welche am Sammelplatz stehen. Scrollbar,
          weil an einem größeren Einsatz mehr Einheiten zusammenkommen, als in
          eine Handy-Zeile passen. */}
      <Tabs
        value={aktiverTab}
        onChange={(_, wert: string) => setTab(wert)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((eintrag) => (
          <Tab
            key={eintrag.key}
            value={eintrag.key}
            label={`${tabLabel(eintrag)}${eintrag.anzahl > 0 ? ` (${eintrag.anzahl})` : ''}`}
          />
        ))}
      </Tabs>

      {abschnitt('imEinsatz', imEinsatz)}
      {abschnitt('bereit', bereit)}
      {abschnitt('zurueck', zurueck)}

      <Divider sx={{ my: 3 }} />
      {/* Eingeklappt, und zwar standardmäßig: Das Protokoll wächst mit jeder
          Bereitstellung und schob die laufende Lage nach oben aus dem Blick.
          `unmountOnExit`, damit die eingeklappten Karten samt ihrer Kurven gar
          nicht gezeichnet werden. */}
      <Accordion
        disableGutters
        variant="outlined"
        slotProps={{ transition: { unmountOnExit: true } }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">
            {t('trupp.sections.protokoll')}
            {protokoll.length > 0 && ` (${protokoll.length})`}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* Auf die *gefilterte* Liste geprüft: Sonst blieb unter einem Reiter
              ohne eigene Zeilen eine leere Fläche ohne Erklärung stehen. */}
          {protokoll.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('trupp.empty.protokoll')}
            </Typography>
          ) : (
            <Stack spacing={1}>{protokoll.map(karte)}</Stack>
          )}
        </AccordionDetails>
      </Accordion>

      {canWrite && (
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          aria-label={t('ueberwachung.actions.truppErfassen')}
          onClick={() => setDialog({ art: 'trupp' })}
        >
          <AddIcon />
        </Fab>
      )}

      {dialog?.art === 'trupp' && (
        <TruppDialog
          key={dialog.trupp?.id ?? 'new'}
          open
          trupp={dialog.trupp}
          feuerwehren={feuerwehren}
          personSuggestions={suggestions}
          // Anders als am Sammelplatz: Wer den Trupp bei seiner eigenen Einheit
          // erfasst, weiß in derselben Sekunde, zu welcher er gehört.
          einheitVorschlaege={einheiten}
          einheitVorgabe={zielEinheit}
          onClose={() => setDialog(undefined)}
          onSave={(input) => handleSaveTrupp(input, dialog.trupp)}
        />
      )}

      {dialog?.art === 'ueberwachung' && (
        <UeberwachungDialog
          key={dialog.trupp.id}
          open
          trupp={dialog.trupp}
          vorgabe={vorgabe}
          personSuggestions={[
            ...dialog.trupp.mitglieder,
            displayName ?? email ?? '',
            ...suggestions,
          ].filter(Boolean)}
          einheitVorschlaege={einheiten}
          istUebernahme={!dialog.trupp.ueberwachungSeit}
          onClose={() => setDialog(undefined)}
          onSave={(input) => handleUebernahme(dialog.trupp, input)}
        />
      )}

      {dialog?.art === 'druckabfrage' && (
        <DruckabfrageDialog
          key={dialog.trupp.id}
          open
          trupp={dialog.trupp}
          zielMeldungFehlt={
            !sortierteAbfragen(dialog.trupp).some((a) => a.amZiel)
          }
          onClose={() => setDialog(undefined)}
          onSave={(input) => handleDruckabfrage(dialog.trupp, input)}
        />
      )}

      {dialog?.art === 'geraete' && (
        <TruppGeraeteDialog
          key={dialog.trupp.id}
          open
          trupp={dialog.trupp}
          geraete={activeGeraete}
          personSuggestions={[...dialog.trupp.mitglieder, ...suggestions]}
          onClose={() => setDialog(undefined)}
          onSave={(geraete) => handleGeraete(dialog.trupp, geraete)}
        />
      )}

      {dialog?.art === 'zeit' && (
        <TruppZeitDialog
          key={`${dialog.trupp.id}-${dialog.modus}`}
          open
          modus={dialog.modus}
          // Beim Gruppenkommandanten heißt das Feld „Taktische Einheit" statt
          // „Entsendet an" — dieselbe Angabe, aber keine Übergabe.
          kontext="ueberwachung"
          entsendetAnVorschlag={
            dialog.trupp.entsendetAn ?? zielEinheit
          }
          entsendetAnVorschlaege={einheiten}
          onClose={() => setDialog(undefined)}
          onConfirm={(patch) =>
            dialog.neueZeile
              ? handleErneuterEinsatz(dialog.trupp, patch)
              : handlePatch(dialog.trupp, patch)
          }
        />
      )}
    </Container>
  );
}
