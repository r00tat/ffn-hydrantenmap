import IconButton from '@mui/material/IconButton';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import { Moment } from 'moment';
import 'moment/locale/de';
import TimeIcon from '@mui/icons-material/AccessTime';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import moment from 'moment';

export interface DateTimePickerProps {
  value: Moment | null;
  setValue: (newValue: Moment | null) => void;
  label?: string;
}

export default function MyDateTimePicker({
  value,
  setValue,
  label,
}: DateTimePickerProps) {
  // const [value, setValue] = React.useState<Moment | null>(moment());
  return (
    <Grid container>
      <Grid item xs={11}>
        <LocalizationProvider dateAdapter={AdapterMoment} adapterLocale="de-DE">
          <DateTimePicker
            slotProps={{
              textField: { fullWidth: true, margin: 'dense' },
              field: { clearable: true },
            }}
            label={label}
            value={value}
            onChange={(newValue) => {
              setValue(newValue);
            }}
            ampm={false}
          />
        </LocalizationProvider>
      </Grid>
      <Grid item xs={1}>
        <Tooltip title="Auf aktuelle Uhrzeit setzten">
          <IconButton onClick={() => setValue(moment())}>
            <TimeIcon />
          </IconButton>
        </Tooltip>
      </Grid>
    </Grid>
  );
}
