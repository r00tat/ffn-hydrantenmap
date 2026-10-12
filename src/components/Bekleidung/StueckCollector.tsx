'use client';

import CloseIcon from '@mui/icons-material/Close';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import type { BekleidungStueck } from '../../common/bekleidung';
import BekleidungScanDialog from './BekleidungScanDialog';
import { findStueckByCode, stueckLabel, type BekleidungView } from './bekleidungUi';

export interface StueckCollectorProps {
  view: BekleidungView;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Welche Stücke die Suchliste anbietet. */
  offer: (stueck: BekleidungStueck) => boolean;
  /** Darf ein gescanntes Stück dazu? Standard: dieselbe Regel wie `offer`. */
  accept?: (stueck: BekleidungStueck) => boolean;
  /** Zusatz je gewähltem Stück, etwa ein Warnchip. */
  renderExtra?: (stueck: BekleidungStueck) => ReactNode;
  label?: string;
}

/**
 * Stücke sammeln: per Scan, per Tag-Nummer oder über die Suche. Gemeinsam
 * für Ausgabe, Rücknahme und Wäsche — die Regeln, welches Stück passt,
 * bringt der Aufrufer mit.
 */
export default function StueckCollector({
  view,
  selectedIds,
  onChange,
  offer,
  accept = offer,
  renderExtra,
  label,
}: StueckCollectorProps) {
  const t = useTranslations('bekleidung');
  const [scanOpen, setScanOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const [inputValue, setInputValue] = useState('');

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => view.stueckById.get(id))
        .filter((s): s is BekleidungStueck => !!s),
    [selectedIds, view.stueckById],
  );
  const options = useMemo(
    () => view.stuecke.filter((s) => s.id && !selectedIds.includes(s.id) && offer(s)),
    [view.stuecke, selectedIds, offer],
  );
  const labelOf = (s: BekleidungStueck) => stueckLabel(s, view.artikelById);

  const add = (stueck: BekleidungStueck) => {
    if (!stueck.id) return;
    if (selectedIds.includes(stueck.id)) {
      setMessage(t('collector.alreadyAdded', { stueck: labelOf(stueck) }));
      return;
    }
    if (!accept(stueck)) {
      setMessage(
        t('collector.notAvailable', {
          stueck: labelOf(stueck),
          status: t(`status.${stueck.status}`),
        }),
      );
      return;
    }
    setMessage(undefined);
    onChange([...selectedIds, stueck.id]);
  };

  const handleCode = (code: string) => {
    const stueck = findStueckByCode(view.stuecke, code);
    if (!stueck) {
      setMessage(t('collector.notFound', { code }));
      return;
    }
    add(stueck);
  };

  return (
    <Stack spacing={1}>
      {label && <Typography variant="subtitle2">{label}</Typography>}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Autocomplete
          size="small"
          sx={{ flexGrow: 1 }}
          options={options}
          value={null}
          inputValue={inputValue}
          onInputChange={(_, value, reason) => {
            if (reason !== 'reset') setInputValue(value);
          }}
          onChange={(_, value) => {
            if (value) add(value);
            setInputValue('');
          }}
          getOptionLabel={labelOf}
          getOptionKey={(o) => o.id ?? ''}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('collector.search')}
              onKeyDown={(e) => {
                // Ein Handscanner tippt die Nummer und schickt Enter.
                if (e.key === 'Enter' && inputValue.trim() && findStueckByCode(view.stuecke, inputValue)) {
                  e.preventDefault();
                  handleCode(inputValue);
                  setInputValue('');
                }
              }}
            />
          )}
        />
        <Button
          variant="outlined"
          startIcon={<QrCodeScannerIcon />}
          onClick={() => setScanOpen(true)}
        >
          {t('actions.scan')}
        </Button>
      </Stack>
      {message && (
        <Alert severity="warning" onClose={() => setMessage(undefined)}>
          {message}
        </Alert>
      )}
      {selected.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('collector.empty')}
        </Typography>
      ) : (
        <List dense disablePadding>
          {selected.map((s) => (
            <ListItem
              key={s.id}
              divider
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label={t('actions.remove')}
                  onClick={() => onChange(selectedIds.filter((id) => id !== s.id))}
                >
                  <CloseIcon />
                </IconButton>
              }
            >
              <ListItemText
                primary={labelOf(s)}
                secondary={renderExtra?.(s)}
                slotProps={{ secondary: { component: 'div' } }}
              />
            </ListItem>
          ))}
        </List>
      )}
      <BekleidungScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onCode={handleCode}
      />
    </Stack>
  );
}
