'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';
import {
  isAtemschutztraeger,
  isExtern,
  isKraftfahrer,
  memberPersons,
  type PersonFlagField,
} from '../../common/personal';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import type { PersonUserCandidate } from '../Fahrtenbuch/personUserMatch';
import {
  deleteFahrtenbuchPerson,
  listPersonUserCandidates,
  saveFahrtenbuchPerson,
  savePersonUserLinks,
  setPersonFlag,
} from '../Fahrtenbuch/stammdatenActions';
import PersonImportDialog from './PersonImportDialog';
import PersonUserLinkDialog from './PersonUserLinkDialog';

/** Zwei Kontenlisten gleich, unabhängig von der Reihenfolge? */
function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * Der Personalstand einer Gruppe: eine Liste für Fahrtenbuch, Bekleidung und
 * Atemschutz. Hier werden Name, Kontakt, BlaulichtSMS-ID, Benutzerkonten und
 * die Qualifikationen gepflegt (siehe docs/personal.md).
 *
 * Aktiv, Kraftfahrer und Atemschutzträger lassen sich direkt in der Liste
 * umschalten — das Freischalten der Atemschutzträger nach der Einführung ist
 * ein Haken je Person, kein Dialog je Person.
 */
export default function PersonalAdmin({
  groupId,
  groupName,
}: {
  groupId: string;
  /** Zielgruppe im Klartext — der Import-Dialog verdeckt die Gruppenauswahl. */
  groupName: string;
}) {
  const t = useTranslations('personal');
  const tFb = useTranslations('fahrtenbuch');
  const tUserLinks = useTranslations('fahrtenbuch.userLinks');
  const { persons } = useFahrtenbuchPersons(groupId);

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showExtern, setShowExtern] = useState(false);
  const [candidates, setCandidates] = useState<PersonUserCandidate[]>();
  const [candidatesError, setCandidatesError] = useState(false);

  const [editing, setEditing] = useState<FahrtenbuchPerson | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [active, setActive] = useState(true);
  const [kraftfahrer, setKraftfahrer] = useState(true);
  const [atemschutztraeger, setAtemschutztraeger] = useState(false);
  const [extern, setExtern] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [dialogError, setDialogError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkingUsers, setLinkingUsers] = useState(false);
  const [error, setError] = useState<string>();

  // Die Konten kommen nur über eine Server Action — die Benutzerdokumente
  // sind für Clients gesperrt. Neu geladen nach dem Zuordnungsdialog, damit
  // ein dort gefundenes Konto auch hier mit Namen erscheint.
  useEffect(() => {
    if (linkingUsers) return;
    let cancelled = false;
    listPersonUserCandidates(groupId)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setCandidates(result.candidates ?? []);
          setCandidatesError(false);
        } else {
          setCandidatesError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setCandidatesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, linkingUsers]);

  const candidateById = useMemo(
    () => new Map((candidates ?? []).map((c) => [c.uid, c])),
    [candidates],
  );

  const accountLabel = (uid: string) => {
    const c = candidateById.get(uid);
    return c?.email || c?.displayName || t('unknownAccount', { uid });
  };

  const activePersons = persons.filter((p) => p.active !== false);
  const members = memberPersons(persons);
  const summary = t('summary', {
    active: members.length,
    drivers: members.filter(isKraftfahrer).length,
    atemschutz: members.filter(isAtemschutztraeger).length,
    extern: activePersons.filter(isExtern).length,
  });

  const visible = useMemo(() => {
    // Jedes Suchwort muss im Namen vorkommen, in beliebiger Reihenfolge —
    // BlaulichtSMS liefert „Nachname Vorname", gepflegt ist oft umgekehrt.
    const query = search.trim();
    const words = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
    return persons.filter((p) => {
      if (!showInactive && p.active === false) return false;
      if (!showExtern && isExtern(p)) return false;
      if (words.length === 0) return true;
      const personName = p.name.toLocaleLowerCase('de');
      return (
        words.every((word) => personName.includes(word)) ||
        (p.blaulichtSmsRecipientId ?? '').includes(query) ||
        (p.phone ?? '').includes(query)
      );
    });
  }, [persons, search, showInactive, showExtern]);

  const openDialog = (person?: FahrtenbuchPerson) => {
    setEditing(person ?? ({} as FahrtenbuchPerson));
    setDialogError(undefined);
    setName(person?.name ?? '');
    setNote(person?.note ?? '');
    setActive(person?.active !== false);
    // Die gespeicherten Qualifikationen, nicht die ausgelegten: Wer extern
    // abwählt, bekommt sie so unverändert zurück.
    setKraftfahrer(person?.kraftfahrer !== false);
    setAtemschutztraeger(person?.atemschutztraeger === true);
    setExtern(person ? isExtern(person) : false);
    setRecipientId(person?.blaulichtSmsRecipientId ?? '');
    setPhone(person?.phone ?? '');
    setEmail(person?.email ?? '');
    setUserIds(person?.userIds ?? []);
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveFahrtenbuchPerson(groupId, editing?.id, {
        name,
        active,
        kraftfahrer,
        atemschutztraeger,
        extern,
        blaulichtSmsRecipientId: recipientId,
        phone,
        email,
        note,
      });
      if (!result.success || !result.id) {
        // Dialog bleibt offen, damit die Eingaben nicht verloren gehen.
        setDialogError(tFb('errors.saveFailed', { message: result.error ?? '' }));
        return;
      }
      // Die Konten gehen über `savePersonUserLinks`, das prüft, ob es die
      // Konten gibt und ob sie schon einer anderen Person gehören. Nur bei
      // einer Änderung — sonst scheiterte ein Gerätemeister an einem Konto
      // außerhalb seiner Gruppe, das ein Admin zugeordnet hat.
      if (!sameIds(userIds, editing?.userIds ?? [])) {
        const links = await savePersonUserLinks(groupId, [
          { personId: result.id, userIds },
        ]);
        if (!links.success) {
          // Die Person ist angelegt; der Dialog zeigt sie nun als bestehende,
          // damit ein zweites Speichern sie nicht doppelt anlegt.
          setEditing({ ...(editing ?? {}), id: result.id } as FahrtenbuchPerson);
          setDialogError(t('linkSaveFailed', { message: links.error ?? '' }));
          return;
        }
      }
      setEditing(null);
    } catch (err) {
      setDialogError(
        tFb('errors.saveFailed', { message: (err as Error).message }),
      );
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (
    person: FahrtenbuchPerson,
    field: PersonFlagField,
    value: boolean,
  ) => {
    if (!person.id) return;
    try {
      const result = await setPersonFlag(groupId, person.id, field, value);
      if (!result.success) {
        setError(t('flagSaveFailed', { message: result.error ?? '' }));
      }
    } catch (err) {
      setError(t('flagSaveFailed', { message: (err as Error).message }));
    }
  };

  const remove = async (person: FahrtenbuchPerson) => {
    if (!person.id) return;
    if (!window.confirm(tFb('admin.deletePersonConfirm'))) return;
    try {
      const result = await deleteFahrtenbuchPerson(groupId, person.id);
      if (!result.success) {
        setError(tFb('admin.deleteFailed', { message: result.error ?? '' }));
      }
    } catch (err) {
      setError(tFb('admin.deleteFailed', { message: (err as Error).message }));
    }
  };

  const flagCell = (
    person: FahrtenbuchPerson,
    field: PersonFlagField,
    checked: boolean,
    label: string,
    disabled = false,
  ) => (
    <TableCell padding="checkbox" align="center">
      <Checkbox
        size="small"
        checked={checked}
        disabled={disabled}
        onChange={(e) => toggle(person, field, e.target.checked)}
        slotProps={{ input: { 'aria-label': `${label}: ${person.name}` } }}
      />
    </TableCell>
  );

  // Gespeicherte Konten, die der Verwalter nicht sehen darf (etwa außerhalb
  // seiner Gruppe), bleiben als Option erhalten, sonst fielen sie aus der
  // Auswahl und damit beim Speichern weg.
  const accountOptions = useMemo(() => {
    const known = (candidates ?? []).map((c) => c.uid);
    return [...known, ...userIds.filter((uid) => !known.includes(uid))];
  }, [candidates, userIds]);

  return (
    <>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ mb: 2, alignItems: { md: 'center' }, flexWrap: 'wrap' }}
      >
        <Button variant="contained" onClick={() => openDialog()}>
          {tFb('admin.addPerson')}
        </Button>
        <Button onClick={() => setImporting(true)}>
          {tFb('admin.importPersons')}
        </Button>
        {/* Wer welche Konten zu sehen bekommt, entscheidet
            `proposePersonUserLinks`, nicht diese Ansicht. */}
        <Button onClick={() => setLinkingUsers(true)}>
          {tUserLinks('open')}
        </Button>
        <TextField
          size="small"
          label={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220, flexGrow: 1 }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
          }
          label={t('showInactive')}
        />
        <FormControlLabel
          control={
            <Switch
              checked={showExtern}
              onChange={(e) => setShowExtern(e.target.checked)}
            />
          }
          label={t('showExtern')}
        />
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {summary}
      </Typography>

      {error !== undefined && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}

      {persons.length === 0 ? (
        <Typography color="text.secondary">{tFb('admin.noPersons')}</Typography>
      ) : visible.length === 0 ? (
        <Typography color="text.secondary">{t('noMatches')}</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tFb('admin.name')}</TableCell>
                <TableCell>{tFb('admin.recipientId')}</TableCell>
                <TableCell>{tFb('admin.phone')}</TableCell>
                <TableCell>{t('userAccounts')}</TableCell>
                <TableCell align="center">{tFb('admin.active')}</TableCell>
                <TableCell align="center">{t('kraftfahrer')}</TableCell>
                <TableCell align="center">{t('atemschutztraeger')}</TableCell>
                <TableCell align="center">{t('extern')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>
                    {person.name}
                    {person.note && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {person.note}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{person.blaulichtSmsRecipientId}</TableCell>
                  <TableCell>{person.phone}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      {(person.userIds ?? []).map((uid) => (
                        <Chip key={uid} size="small" label={accountLabel(uid)} />
                      ))}
                    </Stack>
                  </TableCell>
                  {flagCell(person, 'active', person.active !== false, tFb('admin.active'))}
                  {flagCell(
                    person,
                    'kraftfahrer',
                    isKraftfahrer(person),
                    t('kraftfahrer'),
                    isExtern(person),
                  )}
                  {flagCell(
                    person,
                    'atemschutztraeger',
                    isAtemschutztraeger(person),
                    t('atemschutztraeger'),
                    isExtern(person),
                  )}
                  {flagCell(person, 'extern', isExtern(person), t('extern'))}
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={tFb('admin.editPerson')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`${tFb('admin.editPerson')}: ${person.name}`}
                          onClick={() => openDialog(person)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={tFb('admin.deletePersonConfirm')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`${tFb('admin.deletePersonConfirm')} ${person.name}`}
                          onClick={() => remove(person)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editing?.id ? tFb('admin.editPerson') : tFb('admin.addPerson')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <TextField
              label={tFb('admin.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label={tFb('admin.recipientId')}
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              fullWidth
            />
            <TextField
              label={tFb('admin.phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />
            <TextField
              label={tFb('admin.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label={tFb('admin.note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
            />
            <Autocomplete
              multiple
              options={accountOptions}
              value={userIds}
              onChange={(_, value) => setUserIds(value)}
              getOptionLabel={(uid) => {
                const c = candidateById.get(uid);
                return c?.displayName && c.email
                  ? `${c.displayName} (${c.email})`
                  : accountLabel(uid);
              }}
              renderOption={(props, uid) => {
                const { key, ...rest } = props as typeof props & { key: string };
                const c = candidateById.get(uid);
                const marks = [
                  c && c.isAuthorized === false ? t('accountNotAuthorized') : undefined,
                  c && c.inGroup === false ? t('accountNotInGroup') : undefined,
                ].filter(Boolean);
                return (
                  <li key={key} {...rest}>
                    {c?.displayName && c.email
                      ? `${c.displayName} (${c.email})`
                      : accountLabel(uid)}
                    {marks.length > 0 && ` – ${marks.join(', ')}`}
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('userAccounts')}
                  helperText={
                    candidatesError ? t('userAccountsUnavailable') : t('userAccountsHint')
                  }
                />
              )}
            />
            <div>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                }
                label={tFb('admin.active')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={kraftfahrer && !extern}
                    disabled={extern}
                    onChange={(e) => setKraftfahrer(e.target.checked)}
                  />
                }
                label={t('kraftfahrer')}
              />
              <FormHelperText sx={{ mt: -0.5, ml: 4 }}>{t('kraftfahrerHint')}</FormHelperText>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={atemschutztraeger && !extern}
                    disabled={extern}
                    onChange={(e) => setAtemschutztraeger(e.target.checked)}
                  />
                }
                label={t('atemschutztraeger')}
              />
              <FormHelperText sx={{ mt: -0.5, ml: 4 }}>
                {t('atemschutztraegerHint')}
              </FormHelperText>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={extern}
                    onChange={(e) => setExtern(e.target.checked)}
                  />
                }
                label={t('extern')}
              />
              <FormHelperText sx={{ mt: -0.5, ml: 4 }}>{t('externHint')}</FormHelperText>
            </div>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{tFb('cancel')}</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving || !name.trim()}
          >
            {tFb('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {importing && (
        <PersonImportDialog
          groupId={groupId}
          groupName={groupName}
          onClose={() => setImporting(false)}
        />
      )}

      {linkingUsers && (
        <PersonUserLinkDialog
          open
          groupId={groupId}
          onClose={() => setLinkingUsers(false)}
        />
      )}
    </>
  );
}
