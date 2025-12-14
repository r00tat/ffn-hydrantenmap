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
import TextField from '@mui/material/TextField';
import { formatTimestamp } from '../../common/time-format';

interface HistoryDialogOptions {
  onClose: (history?: FirecallHistory) => void;
}

export default function HistoryDialog({ onClose }: HistoryDialogOptions) {
  const [open, setOpen] = useState(true);
  const { history, historyId } = useMapEditor();
  const [selectedHistory, setSelectedHistory] = useState<
    FirecallHistory | undefined
  >(historyId ? history.find((h) => h.id === historyId) : undefined);
  const { saveHistory } = useSaveHistory();

  const handleChange = (event: SelectChangeEvent<string>) => {
    const selected = history.find((h) => h.id === event.target.value);
    setSelectedHistory(selected);
  };
  const [historyTitle, setHistoryTitle] = useState(
    `Einsatzstatus ${formatTimestamp()}`
  );

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Historie</DialogTitle>
      <DialogContent>
        <Typography>
          Wähle den gewünschten Stand aus der Historie. Wird &quot;letzten Stand
          laden&quot; ausgewählt, so befindet man sich wieder im live Modus.
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
        <hr />
        <Typography marginTop={4}>
          Speichere den aktuellen Einsatzstatus in der Historie, so dass dieser
          später wieder aufgerufen werden kann.
        </Typography>
        <TextField
          margin="dense"
          id="history-name"
          label="Bezeichnung des neuen Zeitstempels"
          type="text"
          fullWidth
          variant="standard"
          onChange={(event) => {
            setHistoryTitle(event.target.value);
          }}
          value={historyTitle}
        />
        <Button
          onClick={async () => {
            await saveHistory(historyTitle);
            onClose();
          }}
        >
          Zeitpunkt speichern
        </Button>
      </DialogContent>
      <DialogActions>
        <Button color="secondary" onClick={() => onClose()}>
          Zurück zum Live Modus
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
