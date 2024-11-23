import { Button } from '@mui/material';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useFirecallUpdateSheet } from '../../../hooks/useFirecall';
import useDrivePicker from './useDrivePicker';

export default function DrivePickerComponent() {
  const [openPicker] = useDrivePicker();
  const updateFirecallSheet = useFirecallUpdateSheet();
  const [apiKey, setApiKey] = useState<string>();
  useEffect(() => {
    try {
      if (process.env.NEXT_PUBLIC_FIREBASE_APIKEY) {
        const newApiKey = JSON.parse(
          process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
        );
        setApiKey(newApiKey.apiKey);
      } else {
        console.warn(`NEXT_PUBLIC_FIREBASE_APIKEY empty!`);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // const customViewsArray = [new google.picker.DocsView()]; // custom view
  const handleOpenPicker = useCallback(() => {
    console.info(`fb api key: `, process.env.NEXT_PUBLIC_FIREBASE_APIKEY);
    console.info(`api key: ${apiKey}`);
    console.info(`client id:`, process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID);

    if (apiKey && process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID) {
      openPicker({
        clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '',
        developerKey: apiKey,
        viewId: 'SPREADSHEETS',
        // token: token, // pass oauth token in case you already have one
        multiselect: false,
        addRecentView: true,
        // setIncludeFolders: true,
        viewMimeTypes: 'application/vnd.google-apps.spreadsheet',
        addMyDrive: true,

        // customViews: customViewsArray, // custom view
        callbackFunction: (data: google.picker.ResponseObject) => {
          console.log(data);
          if (data.action === 'cancel') {
            console.log('User clicked cancel/close button');
          } else {
            console.info(`picked ${data.docs && data.docs[0]?.id}`);
            if (data.docs && data.docs[0]?.id) {
              console.info(`upadte firecallsheet`);
              updateFirecallSheet(data.docs[0].id);
            }
          }
        },
      });
    }
  }, [apiKey, openPicker, updateFirecallSheet]);

  return (
    <>
      <Typography>Driver Picker</Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={() => handleOpenPicker()}
      >
        Open Picker
      </Button>
    </>
  );
}
