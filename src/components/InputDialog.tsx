import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

export interface AlertDialogOptions {
    title: string;
    text?: string;
    ok?: string;
    label?: string;
    cancel?: string;
    open?: boolean;
    defaultValue?: string;
    onClose: (value?: string) => void;
    children?: React.ReactNode
}

export default function InputDialog({
    title,
    text,
    ok = 'Ok',
    cancel = 'Abbrechen',
    label = 'Eingabe',
    open: openDefault = true,
    defaultValue = '',
    onClose,
    children,
}: AlertDialogOptions) {
    const [open, setOpen] = React.useState(openDefault);
    const [value, setValue] = React.useState(defaultValue);

    const handleClose = (result: boolean) => {
        setOpen(false);

        onClose(result ? value : undefined);
    };

    return (
        <Dialog
            open={open}
            onClose={() => handleClose(false)}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
        >
            <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
            <DialogContent>
                {text &&
                    (<DialogContentText id="alert-dialog-description">
                        {text}
                    </DialogContentText>)}
                {children && (
                    <DialogContentText id="alert-dialog-description">
                        {children}
                    </DialogContentText>
                )}
                <TextField
                    autoFocus
                    margin="dense"
                    id="input"
                    label={label}
                    type="text"
                    fullWidth
                    variant="standard"
                    inputProps={{ tabIndex: 1 }}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        setValue(event.target.value);
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => handleClose(false)} tabIndex={3}>{cancel}</Button>
                <Button onClick={() => handleClose(true)} color="primary" tabIndex={2}>
                    {ok}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
