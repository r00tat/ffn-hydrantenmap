import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { useState } from 'react';
import useMapEditor from '../../hooks/useMapEditor';
import { FirecallHistory } from '../firebase/firestore';
import Typography from '@mui/material/Typography';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';

interface HistoryDialogOptions {
  onClose: (history?: FirecallHistory) => void;
}

export default function HistoryDialog({ onClose }: HistoryDialogOptions) {
  const [open, setOpen] = useState(true);
  const { history, historyId } = useMapEditor();
  const [selectedHistory, setSelectedHistory] = useState<
    FirecallHistory | undefined
  >(undefined);
  const { saveHistory } = useSaveHistory();

  const handleChange = (event: SelectChangeEvent<string>) => {
    const selected = history.find((h) => h.id === event.target.value);
    setSelectedHistory(selected);
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Historie</DialogTitle>
      <DialogContent>
        <Typography>
          Wähle den gewünschten Stand aus der Historie. Wird "letzten Stand
          laden" ausgewählt, so befindet man sich wieder im live Modus.
        </Typography>
        <Select
          labelId="history-select-label"
          id="history-select"
          value={selectedHistory?.id || ''}
          label="Historie"
          onChange={handleChange}
          fullWidth
        >
          <MenuItem value="">letzten Stand laden</MenuItem>
          {history.map((item) => (
            <MenuItem value={item.id} key={item.id}>
              {item.description}
            </MenuItem>
          ))}
        </Select>
      </DialogContent>
      <DialogActions>
        <Button color="secondary" onClick={() => onClose()}>
          Zurück zum Live Modus
        </Button>
        <Button
          onClick={async () => {
            await saveHistory();
            onClose();
          }}
        >
          Zeitpunkt speichern
        </Button>
        <Button
          color="warning"
          onClick={() => {
            setOpen(false);
            onClose(
              historyId
                ? { id: historyId, description: '', createdAt: '' }
                : undefined
            );
          }}
        >
          Abbrechen
        </Button>
        <Button
          color="primary"
          variant="contained"
          onClick={() => {
            setOpen(false);
            onClose(selectedHistory);
          }}
          // disabled={!selectedHistory}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
