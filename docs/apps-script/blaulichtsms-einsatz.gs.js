/**
 * ============================================================================
 *  BlaulichtSMS → Einsatzkarte: Automatischer Einsatz-Import (Google Apps Script)
 * ============================================================================
 *
 *  Zweck
 *  -----
 *  Überwacht ein Gmail-Postfach auf neue Einsatz-E-Mails und legt bei jeder
 *  gefundenen Mail über die Einsatzkarte-API einen neuen Einsatz an.
 *  Die API holt dabei selbst den neuesten BlaulichtSMS-Alarm der Gruppe
 *  (POST /api/einsatz mit { group, latest: true }) und ist idempotent –
 *  d.h. mehrere Mails zum selben Alarm erzeugen nur EINEN Einsatz.
 *
 *  Ablauf
 *  ------
 *  1. Eine Gmail-Regel markiert eingehende Einsatz-Mails automatisch mit einem
 *     STERN (das richtest du einmalig in Gmail unter Einstellungen → Filter ein).
 *  2. Dieses Script läuft per Zeit-Trigger jede Minute (Gmail bietet keinen
 *     nativen "neue Mail"-Trigger – der Minuten-Trigger ist der Standardweg).
 *  3. Es sucht alle Mails, die dem Filter entsprechen (Standard: `is:starred`).
 *  4. Für jede gefundene Mail ruft es die API auf und legt den Einsatz an.
 *  5. War der API-Aufruf erfolgreich, wird der Stern entfernt (und optional ein
 *     Label gesetzt), damit die Mail nicht erneut verarbeitet wird.
 *     Schlägt der Aufruf fehl, bleibt der Stern – der nächste Lauf versucht es
 *     automatisch erneut.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  EINMALIGES SETUP
 *  ─────────────────────────────────────────────────────────────────────────
 *  1. Dieses gesamte Script in ein neues Apps-Script-Projekt einfügen
 *     (https://script.google.com → Neues Projekt).
 *  2. Unten in der Funktion `setup()` deine Werte eintragen
 *     (API-URL, Token, Group-ID; Filter/Label optional).
 *  3. `setup` im Editor über "Ausführen" starten und die Google-Berechtigungen
 *     bestätigen (Gmail-Zugriff + externe Aufrufe). Das speichert die
 *     Konfiguration sicher im PropertyService und installiert den Trigger.
 *  4. Danach kannst du die Werte in `setup()` wieder leeren – die Secrets liegen
 *     im PropertyService, nicht mehr im Code.
 *
 *  Nützliche Funktionen zum manuellen Ausführen im Editor:
 *    setup()                – Konfiguration speichern + Minuten-Trigger anlegen
 *    installTrigger()       – nur den Minuten-Trigger (neu) anlegen
 *    removeTriggers()       – alle Trigger dieses Scripts entfernen
 *    showConfig()           – aktuelle Konfiguration anzeigen (Token maskiert)
 *    testRun()              – Suche testen: zeigt Treffer, OHNE etwas anzulegen
 *    processEinsatzEmails() – der eigentliche Verarbeitungslauf (Trigger-Ziel)
 * ============================================================================
 */

// ── Konstanten ──────────────────────────────────────────────────────────────

/** Schlüssel im PropertyService. */
const PROP = {
  BASE_URL: 'API_BASE_URL',
  TOKEN: 'API_TOKEN',
  GROUP: 'GROUP_ID',
  QUERY: 'GMAIL_QUERY',
  LABEL: 'PROCESSED_LABEL',
};

/** Standard-Suchfilter, falls keiner konfiguriert ist. */
const DEFAULT_QUERY = 'is:starred';

/** Name der Handler-Funktion, die der Zeit-Trigger aufruft. */
const TRIGGER_HANDLER = 'processEinsatzEmails';

/** Maximale Anzahl Threads pro Lauf (Schutz vor Massen-Verarbeitung). */
const MAX_THREADS = 20;

// ── Setup ─────────────────────────────────────────────────────────────────

/**
 * EINMALIG ausführen. Trage deine Werte ein, führe die Funktion aus,
 * danach kannst du die Werte hier wieder leeren.
 *
 * Leere Werte werden NICHT gespeichert – bereits gesetzte Properties bleiben
 * dann erhalten. So kannst du setup() z.B. auch nur zum Neu-Anlegen des
 * Triggers erneut ausführen.
 */
function setup() {
  const config = {
    apiBaseUrl: 'https://einsatz.ffnd.at', // Basis-URL OHNE /api
    apiToken: 'DEIN_API_TOKEN', // API-Token (Bearer)
    groupId: 'DEINE_GROUP_ID', // Firecall-Gruppe
    gmailQuery: DEFAULT_QUERY, // optional: eigener Gmail-Suchfilter
    processedLabel: '', // optional: Label nach Erfolg, z.B. 'Einsatz angelegt'
  };

  saveConfig_(config);
  installTrigger();
  console.log(
    'Setup abgeschlossen: Konfiguration gespeichert und Minuten-Trigger installiert.',
  );
  showConfig();
}

/**
 * Speichert die Konfiguration im PropertyService. Leere/Platzhalter-Werte
 * werden übersprungen, damit ein erneuter setup()-Lauf vorhandene Secrets
 * nicht versehentlich überschreibt.
 */
function saveConfig_(config) {
  const props = PropertiesService.getScriptProperties();
  const placeholders = [
    'DEIN_API_TOKEN',
    'DEINE_GROUP_ID',
    'https://einsatz.ffnd.at',
  ];
  const setIfPresent = (key, value) => {
    const v = (value || '').trim();
    if (v && placeholders.indexOf(v) === -1) props.setProperty(key, v);
  };

  setIfPresent(PROP.BASE_URL, config.apiBaseUrl);
  setIfPresent(PROP.TOKEN, config.apiToken);
  setIfPresent(PROP.GROUP, config.groupId);
  // Query/Label dürfen auch leer bleiben; nur setzen, wenn angegeben.
  if ((config.gmailQuery || '').trim())
    props.setProperty(PROP.QUERY, config.gmailQuery.trim());
  if ((config.processedLabel || '').trim())
    props.setProperty(PROP.LABEL, config.processedLabel.trim());
}

// ── Trigger-Verwaltung ──────────────────────────────────────────────────────

/** Legt den Minuten-Trigger neu an (entfernt vorher vorhandene). */
function installTrigger() {
  removeTriggers();
  ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(1).create();
  console.log('Minuten-Trigger für ' + TRIGGER_HANDLER + '() installiert.');
}

/** Entfernt alle Trigger, die auf diese Handler-Funktion zeigen. */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  }
  if (removed) console.log(removed + ' Trigger entfernt.');
}

// ── Konfiguration lesen ─────────────────────────────────────────────────────

/**
 * Liest und validiert die Konfiguration. Wirft einen Fehler mit klarer
 * Meldung, wenn Pflichtwerte fehlen.
 */
function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const cfg = {
    baseUrl: (props.getProperty(PROP.BASE_URL) || '').replace(/\/+$/, ''),
    token: props.getProperty(PROP.TOKEN) || '',
    group: props.getProperty(PROP.GROUP) || '',
    query: props.getProperty(PROP.QUERY) || DEFAULT_QUERY,
    label: props.getProperty(PROP.LABEL) || '',
  };

  const missing = [];
  if (!cfg.baseUrl) missing.push(PROP.BASE_URL);
  if (!cfg.token) missing.push(PROP.TOKEN);
  if (!cfg.group) missing.push(PROP.GROUP);
  if (missing.length) {
    throw new Error(
      'Fehlende Konfiguration: ' +
        missing.join(', ') +
        '. Bitte zuerst setup() ausführen.',
    );
  }
  return cfg;
}

// ── Hauptverarbeitung (Trigger-Ziel) ─────────────────────────────────────────

/**
 * Der eigentliche Verarbeitungslauf. Wird vom Minuten-Trigger aufgerufen.
 * Sucht passende Mails, legt pro Mail einen Einsatz an und entfernt bei Erfolg
 * den Stern.
 */
function processEinsatzEmails() {
  // Verhindert parallele Läufe (ein Lauf kann länger als 1 Minute dauern).
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    console.log('Vorheriger Lauf läuft noch – dieser Lauf wird übersprungen.');
    return;
  }

  try {
    const cfg = getConfig_();
    const threads = GmailApp.search(cfg.query, 0, MAX_THREADS);

    if (!threads.length) {
      console.log('Keine passenden E-Mails für Filter "' + cfg.query + '".');
      return;
    }
    console.log(
      threads.length +
        ' passende(r) Thread(s) gefunden (Filter: "' +
        cfg.query +
        '").',
    );

    const label = cfg.label ? getOrCreateLabel_(cfg.label) : null;

    for (const thread of threads) {
      try {
        const result = createEinsatz_(cfg);
        const status = result.created
          ? 'angelegt'
          : 'bereits vorhanden (idempotent)';
        console.log(
          'Einsatz ' +
            status +
            ': ' +
            (result.id || '?') +
            (result.name ? ' – ' + result.name : '') +
            (result.url ? ' (' + result.url + ')' : ''),
        );

        // Erfolg → Stern entfernen und Mail als verarbeitet markieren.
        unstarThread_(thread);
        if (label) thread.addLabel(label);
      } catch (err) {
        console.error(
          'Fehler bei Thread ' +
            thread.getId() +
            ': ' +
            err.message +
            ' – Stern bleibt gesetzt, nächster Lauf versucht es erneut.',
        );
      }
    }
  } finally {
    lock.releaseLock();
  }
}

// ── API-Aufruf ───────────────────────────────────────────────────────────────

/**
 * Ruft POST /api/einsatz mit { group, latest: true } auf.
 * Gibt bei Erfolg das JSON-Ergebnis zurück, sonst wird ein Fehler geworfen.
 */
function createEinsatz_(cfg) {
  const url = cfg.baseUrl + '/api/einsatz';
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg.token },
    payload: JSON.stringify({ group: cfg.group, latest: true }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  let json = {};
  try {
    json = body ? JSON.parse(body) : {};
  } catch (e) {
    // Antwort war kein JSON – body bleibt für die Fehlermeldung erhalten.
  }

  if (code < 200 || code >= 300) {
    throw new Error(
      'API ' + code + ': ' + (json.error || body || 'Unbekannter Fehler'),
    );
  }
  return json;
}

// ── Gmail-Helfer ──────────────────────────────────────────────────────────────

/** Entfernt den Stern von allen Nachrichten eines Threads. */
function unstarThread_(thread) {
  const messages = thread.getMessages();
  for (const message of messages) {
    if (message.isStarred()) message.unstar();
  }
}

/** Holt ein Gmail-Label oder legt es an, falls es noch nicht existiert. */
function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// ── Diagnose ───────────────────────────────────────────────────────────────

/** Zeigt die aktuelle Konfiguration an (Token maskiert). */
function showConfig() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(PROP.TOKEN) || '';
  console.log('Konfiguration:');
  console.log(
    '  ' +
      PROP.BASE_URL +
      ': ' +
      (props.getProperty(PROP.BASE_URL) || '(nicht gesetzt)'),
  );
  console.log(
    '  ' + PROP.TOKEN + ': ' + (token ? maskToken_(token) : '(nicht gesetzt)'),
  );
  console.log(
    '  ' +
      PROP.GROUP +
      ': ' +
      (props.getProperty(PROP.GROUP) || '(nicht gesetzt)'),
  );
  console.log(
    '  ' +
      PROP.QUERY +
      ': ' +
      (props.getProperty(PROP.QUERY) || DEFAULT_QUERY + ' (Standard)'),
  );
  console.log(
    '  ' + PROP.LABEL + ': ' + (props.getProperty(PROP.LABEL) || '(keins)'),
  );

  const triggers = ScriptApp.getProjectTriggers().filter(
    (t) => t.getHandlerFunction() === TRIGGER_HANDLER,
  );
  console.log(
    '  Trigger aktiv: ' +
      (triggers.length ? 'ja (' + triggers.length + ')' : 'nein'),
  );
}

/**
 * Testet die Suche, OHNE einen Einsatz anzulegen: zeigt an, wie viele Mails
 * der aktuelle Filter findet und deren Betreff. Gut zum Prüfen des Filters.
 */
function testRun() {
  const cfg = getConfig_();
  const threads = GmailApp.search(cfg.query, 0, MAX_THREADS);
  console.log(
    'Filter "' + cfg.query + '" findet ' + threads.length + ' Thread(s):',
  );
  for (const thread of threads) {
    console.log('  • ' + thread.getFirstMessageSubject());
  }
  console.log(
    '(testRun legt bewusst KEINEN Einsatz an – dazu processEinsatzEmails() ausführen.)',
  );
}

/** Maskiert ein Token für die Log-Ausgabe. */
function maskToken_(token) {
  if (token.length <= 6) return '***';
  return (
    token.slice(0, 3) +
    '…' +
    token.slice(-2) +
    ' (' +
    token.length +
    ' Zeichen)'
  );
}
