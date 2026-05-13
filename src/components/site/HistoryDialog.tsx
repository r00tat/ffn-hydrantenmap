import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import useMapEditor from '../../hooks/useMapEditor';
import { FirecallHistory, FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import Typography from '@mui/material/Typography';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import TextField from '@mui/material/TextField';
import { formatTimestamp } from '../../common/time-format';
import AutoSnapshotIntervalSelect from '../inputs/AutoSnapshotIntervalSelect';
import useFirecall from '../../hooks/useFirecall';
import { doc } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreClient';
import { firestore } from '../firebase/firebase';

interface HistoryDialogOptions {
  onClose: (history?: FirecallHistory) => void;
}

export default function HistoryDialog({ onClose }: HistoryDialogOptions) {
  const t = useTranslations();
  const [open, setOpen] = useState(true);
  const { history, historyId } = useMapEditor();
  const [selectedHistory, setSelectedHistory] = useState<
    FirecallHistory | undefined
  >(historyId ? history.find((h) => h.id === historyId) : undefined);
  const { saveHistory } = useSaveHistory();
  const firecall = useFirecall();

  const handleChange = (event: SelectChangeEvent<string>) => {
    const selected = history.find((h) => h.id === event.target.value);
    setSelectedHistory(selected);
  };
  const [historyTitle, setHistoryTitle] = useState(
    t('history.defaultTitle', { timestamp: formatTimestamp() }),
  );

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>{t('history.title')}</DialogTitle>
      <DialogContent>
        <AutoSnapshotIntervalSelect
          value={firecall.autoSnapshotInterval}
          onChange={async (value) => {
            if (firecall.id) {
              await setDoc(
                doc(firestore, FIRECALL_COLLECTION_ID, firecall.id),
                { autoSnapshotInterval: value },
                { merge: true }
              );
            }
          }}
        />
        <hr />
        <Typography>{t('history.instructionLoad')}</Typography>
        <Select
          labelId="history-select-label"
          id="history-select"
          value={selectedHistory?.id || ''}
          label={t('history.select')}
          onChange={handleChange}
          fullWidth
        >
          <MenuItem value="">{t('history.loadLatest')}</MenuItem>
          {history.map((item) => (
            <MenuItem value={item.id} key={item.id}>
              {item.description}
            </MenuItem>
          ))}
        </Select>
        <hr />
        <Typography sx={{ marginTop: 4 }}>
          {t('history.instructionSave')}
        </Typography>
        <TextField
          margin="dense"
          id="history-name"
          label={t('history.newTimestampLabel')}
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
          {t('history.saveTimestamp')}
        </Button>
      </DialogContent>
      <DialogActions>
        <Button color="secondary" onClick={() => onClose()}>
          {t('history.backToLive')}
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
          {t('common.cancel')}
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
          {t('common.ok')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
