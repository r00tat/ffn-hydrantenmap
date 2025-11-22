import { Button } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import useDrivePicker from './useDrivePicker';

export interface DrivePickerProps {
  onClose: (doc?: google.picker.DocumentObject) => void;
  onOpen?: () => void;
}

export default function DrivePickerComponent({
  onClose,
  onOpen,
}: DrivePickerProps) {
  const [openPicker] = useDrivePicker();
  const [apiKey, setApiKey] = useState<string>();

  useEffect(() => {
    try {
      if (process.env.NEXT_PUBLIC_FIREBASE_APIKEY) {
        (async () => {
          const newApiKey = JSON.parse(
            process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
          );
          setApiKey(newApiKey.apiKey);
        })();
      } else {
        console.warn(`NEXT_PUBLIC_FIREBASE_APIKEY empty!`);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // const customViewsArray = [new google.picker.DocsView()]; // custom view
  const handleOpenPicker = useCallback(() => {
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
            onClose();
          } else if (data.action === 'picked') {
            console.info(`picked ${data.docs && data.docs[0]?.id}`);
            if (data.docs && data.docs[0]?.id) {
              onClose(data.docs[0]);
            } else {
              onClose();
            }
          }
        },
        onOpen: onOpen,
      });
    }
  }, [apiKey, onClose, onOpen, openPicker]);

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        onClick={() => handleOpenPicker()}
      >
        Datei in Google Drive auswählen
      </Button>
    </>
  );
}
