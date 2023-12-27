import { Button, Paper, Typography } from '@mui/material';
import useRegisterMessaging from '../../hooks/useRegisterMessaging';
import { useState } from 'react';
import { UserRecordExtended } from '../../common/users';


export default function ChatUi() {

    const [result, setResult] = useState<UserRecordExtended>()

    const registerMessaging = useRegisterMessaging()
    return <>
        <Typography variant="h3">Chat</Typography>
        <Button onClick={async () => { setResult(await registerMessaging()) }}>Register</Button>
        <Typography>{JSON.stringify(result)}</Typography>
    </>;
}