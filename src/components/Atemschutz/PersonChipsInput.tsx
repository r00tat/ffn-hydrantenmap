'use client';

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { sanitizePersonen } from '../../common/atemschutz';

export interface PersonChipsInputProps {
  label: string;
  value: string[];
  options: string[];
  helperText?: string;
  /** Höchstzahl der Namen; ohne Angabe unbegrenzt. */
  max?: number;
  /** Hinweistext, sobald `max` erreicht ist. */
  vollText?: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
  /**
   * Ein per Klick korrigierter Name ist wieder übernommen — `alt` ist der Name
   * vor der Korrektur. Wird der Text dabei geleert, ist es keine Korrektur
   * mehr, sondern ein Austausch der Person, und es kommt keine Meldung.
   */
  onUmbenennen?: (alt: string, neu: string) => void;
}

/**
 * Eine Namensliste als Chips: tippen, Enter, nächster Name.
 *
 * Der Vorgänger war eine Zeile je Person mit „Person hinzufügen" darunter —
 * am Sammelplatz ein Klick zu viel je Name. Hier läuft die Eingabe in einem
 * Feld durch; die Vorschläge sorgen weiter dafür, dass derselbe Name nicht
 * zweimal unterschiedlich geschrieben wird.
 *
 * Ein Klick auf einen Namen holt ihn zum Korrigieren zurück ins Eingabefeld:
 * Am Sammelplatz wird oft erst der Vorname erfasst, und den Nachnamen
 * nachzutragen soll nicht heißen, den Chip zu löschen und alles neu zu tippen.
 * Ein noch offener Text wird dabei zuerst übernommen, damit er nicht verloren
 * geht.
 *
 * Drei Feinheiten, ohne die das Feld Eingaben verlöre:
 * - `autoSelect`: Wer den letzten Namen tippt und direkt auf „Speichern"
 *   klickt, verliert ihn sonst — MUI verwirft bei `freeSolo` den offenen Text
 *   beim Verlassen des Feldes.
 * - Komma und Strichpunkt trennen ebenfalls, weil Namenslisten oft aus einer
 *   Nachricht kopiert werden.
 * - `sanitizePersonen` läuft über jede Änderung: Dubletten und Leerzeichen
 *   entstehen beim schnellen Tippen von selbst.
 */
export default function PersonChipsInput({
  label,
  value,
  options,
  helperText,
  max,
  vollText,
  disabled,
  onChange,
  onUmbenennen,
}: PersonChipsInputProps) {
  const [eingabe, setEingabe] = useState('');
  /** Der Name, der gerade zum Korrigieren im Eingabefeld steht. */
  const [korrektur, setKorrektur] = useState<string>();

  const meldeKorrektur = (next: string[]) => {
    if (korrektur == null) return;
    const neu = next.find((n) => !value.includes(n));
    if (neu == null) return;
    if (neu !== korrektur) onUmbenennen?.(korrektur, neu);
    setKorrektur(undefined);
  };

  const uebernehmen = (namen: string[]) => {
    const geteilt = namen.flatMap((n) => (n ?? '').split(/[,;]/));
    const next = sanitizePersonen(geteilt, max);
    meldeKorrektur(next);
    onChange(next);
  };

  const voll = max != null && value.length >= max;

  const korrigieren = (index: number) => {
    const name = value[index];
    const rest = value.filter((_, i) => i !== index);
    const next = sanitizePersonen([...rest, ...eingabe.split(/[,;]/)], max);
    meldeKorrektur(next);
    onChange(next);
    setEingabe(name);
    setKorrektur(name);
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      fullWidth
      disabled={disabled}
      // Bereits gewählte Namen verschwinden aus der Liste: Ein Vorschlag, der
      // schon als Chip dasteht, ist nur noch im Weg. Bereinigt, weil der Name
      // der Schlüssel der Option ist — zweimal darin, und React warnt („two
      // children with the same key") und kann Einträge verschlucken.
      options={
        voll
          ? []
          : sanitizePersonen(options).filter((o) => !value.includes(o))
      }
      value={value}
      inputValue={eingabe}
      onInputChange={(_, next, reason) => {
        setEingabe(next ?? '');
        // Selbst geleert heißt: Dieser Name ist weg, was danach kommt, ist
        // eine andere Person.
        if (reason === 'input' && !next?.trim()) setKorrektur(undefined);
      }}
      onChange={(_, next) => uebernehmen(next as string[])}
      renderValue={(namen, getItemProps, ownerState) =>
        namen.map((name, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return (
            <Chip
              key={key}
              {...itemProps}
              label={name}
              size={ownerState.size}
              onClick={disabled ? undefined : () => korrigieren(index)}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          // Ist die Höchstzahl erreicht, nimmt `sanitizePersonen` nichts mehr
          // an. Damit das nicht wie ein Fehler wirkt, sagt der Hinweistext,
          // warum der getippte Name nicht als Chip erscheint.
          helperText={voll ? vollText ?? helperText : helperText}
        />
      )}
    />
  );
}
