import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
} from '@mui/material';
import { Firecall } from '@shared/types';
import { useLocale, useTranslations } from '@shared/i18n';

interface FirecallSelectProps {
  firecalls: Firecall[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

export default function FirecallSelect({
  firecalls,
  selectedId,
  onSelect,
  loading,
}: FirecallSelectProps) {
  const t = useTranslations('firecall');
  const locale = useLocale();
  if (loading) {
    return <Skeleton variant="rectangular" height={56} />;
  }

  const dateLocale = locale === 'en' ? 'en-GB' : 'de-AT';

  return (
    <FormControl fullWidth size="small">
      <InputLabel>{t('label')}</InputLabel>
      <Select
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value)}
        label={t('label')}
      >
        {firecalls.map((fc) => (
          <MenuItem key={fc.id} value={fc.id}>
            {fc.name} — {fc.date ? new Date(fc.date).toLocaleDateString(dateLocale) : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
