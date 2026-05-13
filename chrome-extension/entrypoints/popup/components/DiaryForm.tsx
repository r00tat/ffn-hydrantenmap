import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import { addDoc, collection } from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import { auth } from '@shared/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '@shared/types';
import { useTranslations } from '@shared/i18n';

interface DiaryFormProps {
  firecallId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function DiaryForm({
  firecallId,
  onClose,
  onSaved,
}: DiaryFormProps) {
  const t = useTranslations('diaryForm');
  const [art, setArt] = useState<'M' | 'B' | 'F'>('M');
  const [name, setName] = useState('');
  const [von, setVon] = useState('');
  const [an, setAn] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      await addDoc(
        collection(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_ITEMS_COLLECTION_ID
        ),
        {
          type: 'diary',
          art,
          name: name.trim(),
          von: von.trim(),
          an: an.trim(),
          beschreibung: beschreibung.trim(),
          datum: now,
          editable: true,
          created: now,
          creator: auth.currentUser?.email || '',
          zIndex: Date.now(),
        }
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <ToggleButtonGroup
          value={art}
          exclusive
          onChange={(_, v) => v && setArt(v)}
          size="small"
        >
          <ToggleButton value="M">{t('M')}</ToggleButton>
          <ToggleButton value="B">{t('B')}</ToggleButton>
          <ToggleButton value="F">{t('F')}</ToggleButton>
        </ToggleButtonGroup>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </Box>

      <TextField
        label={t('message')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        multiline
        rows={2}
        size="small"
        fullWidth
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={t('fromLabel')}
          value={von}
          onChange={(e) => setVon(e.target.value)}
          size="small"
          fullWidth
        />
        <TextField
          label={t('toLabel')}
          value={an}
          onChange={(e) => setAn(e.target.value)}
          size="small"
          fullWidth
        />
      </Box>

      <TextField
        label={t('description')}
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
        size="small"
        fullWidth
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={saving || !name.trim()}
        startIcon={saving ? <CircularProgress size={20} /> : null}
      >
        {saving ? t('saving') : t('create')}
      </Button>
    </Box>
  );
}
