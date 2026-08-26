'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  proposePersonUserLinks,
  savePersonUserLinks,
} from '../stammdatenActions';
import type { PersonUserMatch } from '../personUserMatch';

/**
 * Der Auswahlzustand: je Person die angehakten Konten.
 *
 * Getrennt von den Vorschlägen geführt, damit ein erneutes Laden die Arbeit des
 * Admins nicht wegwirft — und damit „nichts angehakt" ein aussagekräftiger
 * Zustand ist und nicht von „noch nicht geladen" zu unterscheiden wäre.
 */
type Selection = Record<string, string[]>;

/**
 * Vorbelegung: **nur eindeutige Treffer.** Alles, was eine Entscheidung
 * braucht, bleibt leer — ein vorgehakter mehrdeutiger Vorschlag würde genau
 * die Prüfung überspringen, für die dieser Dialog da ist.
 */
function initialSelection(matches: PersonUserMatch[]): Selection {
  const selection: Selection = {};
  for (const match of matches) {
    selection[match.personId] =
      match.status === 'unique'
        ? [...match.linkedUserIds, match.candidates[0]!.uid]
        : [...match.linkedUserIds];
  }
  return selection;
}

/** Was sich gegenüber dem gespeicherten Stand geändert hat. */
function changedLinks(matches: PersonUserMatch[], selection: Selection) {
  return matches
    .map((match) => ({
      personId: match.personId,
      userIds: selection[match.personId] ?? [],
      linked: match.linkedUserIds,
    }))
    .filter(
      ({ userIds, linked }) =>
        userIds.length !== linked.length ||
        userIds.some((uid) => !linked.includes(uid)),
    )
    .map(({ personId, userIds }) => ({ personId, userIds }));
}

/** Die Merkmale eines Kontos, die gegen eine Zuordnung sprechen könnten. */
function AccountFlags({
  candidate,
}: {
  candidate: PersonUserMatch['candidates'][number];
}) {
  const t = useTranslations('fahrtenbuch.userLinks');
  const flags = [
    candidate.disabled && t('disabled'),
    candidate.isAuthorized === false && t('notAuthorized'),
    candidate.inGroup === false && t('notInGroup'),
  ].filter((flag): flag is string => !!flag);
  if (flags.length === 0) return null;
  return (
    <>
      {flags.map((flag) => (
        <Chip key={flag} size="small" color="warning" label={flag} />
      ))}
    </>
  );
}

export interface PersonUserLinkDialogProps {
  open: boolean;
  groupId: string;
  onClose: () => void;
}

/**
 * „Bestehende Benutzer zuordnen" — der Weg, auf dem `person.userIds` entsteht.
 *
 * Ohne diese Verknüpfung darf ein Mitglied seine über den QR-Code am Fahrzeug
 * erfasste Fahrt nicht selbst korrigieren; der Namensvergleich, der sich
 * anbietet, wäre eine Rechteausweitung (siehe `personUserMatch.ts`). Hier
 * schlägt derselbe Vergleich vor und ein Admin bestätigt — das ist der
 * Unterschied.
 */
export default function PersonUserLinkDialog({
  open,
  groupId,
  onClose,
}: PersonUserLinkDialogProps) {
  const t = useTranslations('fahrtenbuch.userLinks');
  const [matches, setMatches] = useState<PersonUserMatch[]>();
  const [selection, setSelection] = useState<Selection>({});
  const [showLinked, setShowLinked] = useState(false);
  // Beim Mounten wird immer geladen — `true` als Anfangswert erspart ein
  // `setLoading` im Effektkörper (`react-hooks/set-state-in-effect`).
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<number>();

  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof proposePersonUserLinks>>) => {
      setLoading(false);
      if (!result.success || !result.matches) {
        setError(t('loadFailed'));
        return;
      }
      setMatches(result.matches);
      setSelection(initialSelection(result.matches));
    },
    [t],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await proposePersonUserLinks(groupId);
      if (!active) return;
      applyResult(result);
    })();
    return () => {
      active = false;
    };
  }, [groupId, applyResult]);

  /** Erneut laden — nur aus Ereignis-Handlern, nie aus einem Effekt. */
  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    applyResult(await proposePersonUserLinks(groupId));
  }, [groupId, applyResult]);

  const toggle = (personId: string, uid: string) =>
    setSelection((current) => {
      const chosen = current[personId] ?? [];
      return {
        ...current,
        [personId]: chosen.includes(uid)
          ? chosen.filter((id) => id !== uid)
          : [...chosen, uid],
      };
    });

  const pending = useMemo(
    () => (matches ? changedLinks(matches, selection) : []),
    [matches, selection],
  );

  const visible = useMemo(
    () =>
      (matches ?? []).filter(
        (match) => showLinked || match.status !== 'linked',
      ),
    [matches, showLinked],
  );

  const save = async () => {
    setSaving(true);
    setError(undefined);
    const result = await savePersonUserLinks(groupId, pending);
    setSaving(false);
    if (!result.success) {
      setError(t('saveFailed'));
      return;
    }
    setSaved(pending.length);
    // Neu laden statt den Zustand fortzuschreiben: Danach steht am Dialog, was
    // wirklich gespeichert ist, und ein zweites Speichern kann nichts doppeln.
    await reload();
  };

  /** Personen-IDs als Klartextnamen — für die Hinweise am Vorschlag. */
  const personNames = (ids: string[]) =>
    ids
      .map(
        (id) => matches?.find((m) => m.personId === id)?.personName ?? id,
      )
      .join(', ');

  const statusChip = (match: PersonUserMatch) => {
    if (match.status === 'linked') {
      return <Chip size="small" color="success" label={t('linked')} />;
    }
    if (match.status === 'none') {
      return (
        <Typography variant="body2" color="text.secondary">
          {t('noAccount')}
        </Typography>
      );
    }
    if (match.status === 'unique') {
      return <Chip size="small" color="info" label={t('proposed')} />;
    }
    return <Chip size="small" color="warning" label={t('needsDecision')} />;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{t('heading')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t('intro')}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {saved !== undefined && !error && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('saved', { count: saved })}
          </Alert>
        )}

        <FormControlLabel
          control={
            <Switch
              checked={showLinked}
              onChange={(e) => setShowLinked(e.target.checked)}
            />
          }
          label={t('showLinked')}
        />

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && visible.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            {t('nothingToDo')}
          </Typography>
        )}

        {!loading && visible.length > 0 && (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('person')}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }} />
                  <TableCell sx={{ width: '99%' }}>{t('account')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((match) => (
                  <TableRow key={match.personId}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {match.personName}
                    </TableCell>
                    <TableCell>{statusChip(match)}</TableCell>
                    <TableCell>
                      <Stack spacing={0.5}>
                        {match.linkedUserIds.length > 0 &&
                          match.candidates.length > 0 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {t('additional')}
                            </Typography>
                          )}
                        {match.candidates.map((candidate) => (
                          <Stack
                            key={candidate.uid}
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                          >
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={
                                    selection[match.personId]?.includes(
                                      candidate.uid,
                                    ) ?? false
                                  }
                                  onChange={() =>
                                    toggle(match.personId, candidate.uid)
                                  }
                                />
                              }
                              label={
                                // Die E-Mail ist das, was zwei gleichnamige
                                // Konten unterscheidbar macht — sie gehört
                                // deshalb in die Beschriftung, nicht in einen
                                // Tooltip.
                                `${candidate.displayName || '—'} · ${
                                  candidate.email || t('noEmail')
                                }`
                              }
                            />
                            <AccountFlags candidate={candidate} />
                          </Stack>
                        ))}
                        {match.contestedBy && (
                          <Typography variant="caption" color="warning.main">
                            {t('contested', {
                              names: personNames(match.contestedBy),
                            })}
                          </Typography>
                        )}
                        {/* Ohne diesen Hinweis fehlte das Konto unerklärt:
                            Es passt, ist aber schon vergeben. */}
                        {match.takenBy && (
                          <Typography variant="caption" color="text.secondary">
                            {t('takenBy', { names: personNames(match.takenBy) })}
                          </Typography>
                        )}
                        {match.status === 'linked' && (
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'center' }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {t('alreadyLinked', {
                                count: match.linkedUserIds.length,
                              })}
                            </Typography>
                            <Button
                              size="small"
                              color="warning"
                              onClick={() =>
                                setSelection((current) => ({
                                  ...current,
                                  [match.personId]: [],
                                }))
                              }
                              disabled={
                                (selection[match.personId]?.length ?? 0) === 0
                              }
                            >
                              {t('unlink')}
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || loading || pending.length === 0}
        >
          {pending.length > 0
            ? t('applyCount', { count: pending.length })
            : t('apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
