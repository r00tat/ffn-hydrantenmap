import TextField from '@mui/material/TextField';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import moment, { Moment } from 'moment';
import React from 'react';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import 'moment/locale/de';

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
    <LocalizationProvider dateAdapter={AdapterMoment} adapterLocale="de-DE">
      <DateTimePicker
        renderInput={(props) => (
          <TextField {...props} fullWidth margin="dense" />
        )}
        label={label}
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
        }}
        ampm={false}
      />
    </LocalizationProvider>
  );
}
