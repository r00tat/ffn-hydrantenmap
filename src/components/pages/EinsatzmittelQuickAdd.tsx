'use client';

import AddIcon from '@mui/icons-material/Add';
import GroupsIcon from '@mui/icons-material/Groups';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTranslations } from 'next-intl';
import { FormEvent, useCallback, useMemo, useRef, useState } from 'react';
import useFirecall from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
import { DEFAULT_EINSATZ_FW } from '../FirecallItems/einsatzDefaults';
import VehicleQuickAddChips from '../FirecallItems/VehicleQuickAddChips';
import {
  FirecallItem,
  Fzg,
  TacticalUnit,
  TACTICAL_UNIT_LABELS,
  TACTICAL_UNIT_TYPES,
  TacticalUnitType,
} from '../firebase/firestore';
import { useSnackbar } from '../providers/SnackbarProvider';
import { buildQuickAddItem, collectFwOptions, QuickAddKind } from './quick-add-utils';

// Ohne expliziten Hint wählt Chromium unter Android IME_ACTION_NEXT, behandelt
// die Aktion selbst und schickt kein Tastenereignis — Enter erreichte das
// Formular dann nie (vgl. #712 im Personal-Board).
const ENTER_HINT = { enterKeyHint: 'done' } as const;

/**
 * Schnelleingabe für weitere Kräfte auf der Seite „Einsatzmittel".
 *
 * Eine Zeile statt eines Dialogs: Bezeichnung tippen, Enter — das Element
 * steht im Einsatz und der Fokus wieder auf der Bezeichnung. Feuerwehr,
 * Fremd-Schalter und „eingetroffen" bleiben stehen, weil nachrückende Kräfte
 * meist mehrere Fahrzeuge derselben Organisation sind. Alles Weitere
 * (Alarmierungszeit, Beschreibung, Position) bleibt dem Bearbeiten-Dialog.
 */
export default function EinsatzmittelQuickAdd({ items }: { items: FirecallItem[] }) {
  const t = useTranslations('einsatzmittel.quickAdd');
  const firecall = useFirecall();
  const addFirecallItem = useFirecallItemAdd();
  const showSnackbar = useSnackbar();
  const { vehicles: fleet } = useKostenersatzVehicles();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const ownFw = firecall?.fw || DEFAULT_EINSATZ_FW;

  const [kind, setKind] = useState<QuickAddKind>('vehicle');
  const [name, setName] = useState('');
  // Bewusst leer: Im Einsatz kommen genauso Nachbarwehren und andere
  // Organisationen — die eigene Feuerwehr steht als erster Vorschlag in der Liste.
  const [fw, setFw] = useState('');
  const [strength, setStrength] = useState('');
  const [ats, setAts] = useState('');
  const [unitType, setUnitType] = useState<TacticalUnitType>('zug');
  // „Fremd" heißt Fremdorganisation (Rettung, Polizei …) — eine Nachbarwehr ist
  // es nicht. Deshalb aus, bis jemand den Schalter anklickt.
  const [fremd, setFremd] = useState(false);
  const [arrived, setArrived] = useState(true);
  // Die Einheit, unter der neue Fahrzeuge angelegt werden. Bleibt stehen wie
  // die Feuerwehr: Meist folgen einer Einheit mehrere Fahrzeuge.
  const [tacticalUnitId, setTacticalUnitId] = useState('');
  // Eine eben angelegte Einheit steht erst nach dem Snapshot in `items` —
  // bis dahin hält sie die Auswahl selbst.
  const [pendingUnit, setPendingUnit] = useState<TacticalUnit>();

  // Beim Wechsel auf „Fahrzeug" beginnt die Feuerwehr wieder leer.
  const switchKind = useCallback((value: QuickAddKind) => {
    setKind(value);
    if (value === 'vehicle') {
      setFw('');
      setFremd(false);
    }
  }, []);

  const fwOptions = useMemo(() => collectFwOptions(items, ownFw), [items, ownFw]);
  const nameOptions = useMemo(
    () => (kind === 'vehicle' ? fleet.map((v) => v.name) : []),
    [fleet, kind],
  );
  const units = useMemo(() => {
    const list = items.filter((i): i is TacticalUnit => i.type === 'tacticalUnit' && !!i.id);
    if (pendingUnit && !list.some((u) => u.id === pendingUnit.id)) {
      list.push(pendingUnit);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [items, pendingUnit]);
  const existingOwnVehicleNames = useMemo(
    () => items.filter((i) => i.type === 'vehicle' && (i as Fzg).fw === ownFw).map((i) => i.name),
    [items, ownFw],
  );

  const add = useCallback(
    async (overrides: {
      name: string;
      fw?: string;
      fremd?: boolean;
      strength?: string;
      ats?: string;
    }) => {
      const item = buildQuickAddItem(
        {
          kind,
          name: overrides.name,
          fw: overrides.fw ?? fw,
          strength: overrides.strength ?? strength,
          ats: overrides.ats ?? ats,
          unitType,
          fremd: overrides.fremd ?? fremd,
          arrived,
          tacticalUnitId,
        },
        {
          now: new Date(),
          lat: firecall?.lat ?? 0,
          lng: firecall?.lng ?? 0,
        },
      );
      if (!item) return false;
      let id: string | undefined;
      try {
        id = (await addFirecallItem(item))?.id;
      } catch {
        // Die Meldung zeigt `useFirecallItemAdd` selbst.
        return false;
      }
      showSnackbar(t('added', { name: item.name }), 'success');
      // Nach einer Einheit kommen ihre Fahrzeuge: gleich auf „Fahrzeug" unter
      // der neuen Einheit umschalten.
      if (item.type === 'tacticalUnit' && id) {
        setPendingUnit({ ...item, id } as TacticalUnit);
        setTacticalUnitId(id);
        switchKind('vehicle');
      }
      return true;
    },
    [
      addFirecallItem,
      arrived,
      ats,
      firecall,
      fremd,
      fw,
      kind,
      showSnackbar,
      strength,
      switchKind,
      t,
      tacticalUnitId,
      unitType,
    ],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (await add({ name })) {
        setName('');
        setStrength('');
        setAts('');
      }
      nameInputRef.current?.focus();
    },
    [add, name],
  );

  // Die Chips legen die eigenen Fahrzeuge mit einem Klick an — immer als
  // eigene Kräfte, auch wenn im Feld gerade eine Nachbarwehr steht, und ohne
  // die Stärke, die womöglich schon für das nächste Fahrzeug getippt ist.
  const handleChip = useCallback(
    (vehicleName: string) => {
      void add({
        name: vehicleName,
        fw: ownFw,
        fremd: false,
        strength: '',
        ats: '',
      });
    },
    [add, ownFw],
  );

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 3 }}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        aria-label={t('title')}
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          onChange={(_, value: QuickAddKind | null) => {
            if (value) switchKind(value);
          }}
        >
          <ToggleButton value="vehicle">
            <LocalShippingIcon fontSize="small" sx={{ mr: 0.5 }} />
            {t('vehicle')}
          </ToggleButton>
          <ToggleButton value="tacticalUnit">
            <GroupsIcon fontSize="small" sx={{ mr: 0.5 }} />
            {t('tacticalUnit')}
          </ToggleButton>
        </ToggleButtonGroup>

        <Autocomplete
          freeSolo
          size="small"
          options={nameOptions}
          inputValue={name}
          onInputChange={(_, value) => setName(value)}
          sx={{ flex: '2 1 180px' }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('name')}
              inputRef={nameInputRef}
              slotProps={{
                ...params.slotProps,
                htmlInput: { ...params.slotProps.htmlInput, ...ENTER_HINT },
              }}
            />
          )}
        />

        {kind === 'tacticalUnit' && (
          <TextField
            select
            size="small"
            label={t('unitType')}
            value={unitType}
            onChange={(e) => setUnitType(e.target.value as TacticalUnitType)}
            sx={{ flex: '0 1 140px' }}
          >
            {TACTICAL_UNIT_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {TACTICAL_UNIT_LABELS[type]}
              </MenuItem>
            ))}
          </TextField>
        )}

        {kind === 'vehicle' && units.length > 0 && (
          <TextField
            select
            size="small"
            label={t('unit')}
            value={tacticalUnitId}
            onChange={(e) => setTacticalUnitId(e.target.value)}
            sx={{ flex: '1 1 160px' }}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value="">
              <em>{t('noUnit')}</em>
            </MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        {kind === 'vehicle' && (
          <Autocomplete
            freeSolo
            size="small"
            options={fwOptions}
            inputValue={fw}
            onInputChange={(_, value) => {
              setFw(value);
            }}
            sx={{ flex: '2 1 180px' }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('fw')}
                slotProps={{
                  ...params.slotProps,
                  htmlInput: { ...params.slotProps.htmlInput, ...ENTER_HINT },
                }}
              />
            )}
          />
        )}

        <TextField
          size="small"
          label={kind === 'vehicle' ? t('crew') : t('strength')}
          placeholder={kind === 'vehicle' ? '8' : '1:8'}
          value={strength}
          onChange={(e) => setStrength(e.target.value)}
          sx={{ flex: '0 1 120px' }}
          slotProps={{ htmlInput: ENTER_HINT }}
        />

        <TextField
          size="small"
          label={t('ats')}
          value={ats}
          onChange={(e) => setAts(e.target.value)}
          sx={{ flex: '0 1 80px' }}
          slotProps={{ htmlInput: { ...ENTER_HINT, inputMode: 'numeric' } }}
        />

        {kind === 'vehicle' && (
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={fremd}
                onChange={(e) => setFremd(e.target.checked)}
              />
            }
            label={t('fremd')}
          />
        )}

        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={arrived}
              onChange={(e) => setArrived(e.target.checked)}
            />
          }
          label={t('arrived')}
        />

        <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={!name.trim()}>
          {t('add')}
        </Button>
      </Box>

      {kind === 'vehicle' && (
        <VehicleQuickAddChips
          selectedNames={[]}
          existingNames={existingOwnVehicleNames}
          onToggle={handleChip}
        />
      )}
    </Paper>
  );
}
