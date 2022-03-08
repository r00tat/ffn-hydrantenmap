import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { addDoc, collection, orderBy } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { useFirecallId } from '../hooks/useFirecall';
import { firestore } from './firebase/firebase';
import FirecallItemCard from './FirecallItems/FirecallItemCard';
import FirecallItemDialog from './FirecallItems/FirecallItemDialog';
import {
  Diary,
  filterActiveItems,
  FirecallItem,
  Fzg,
} from './firebase/firestore';

export default function EinsatzTagebuch() {
  const [tagebuchDialogIsOpen, setTagebuchDialogIsOpen] = useState(false);
  const { email } = useFirebaseLogin();
  const firecallId = useFirecallId();

  const [diaries, setDiaries] = useState<Diary[]>([]);

  const diaryEntries = useFirebaseCollection<Diary>({
    collectionName: 'call',
    pathSegments: [firecallId, 'diary'],
    // queryConstraints: [where('type', '==', 'vehicle')],
    queryConstraints: [orderBy('datum', 'desc')],
    filterFn: filterActiveItems,
  });

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    pathSegments: [firecallId, 'item'],
    // queryConstraints: [where('type', '==', 'vehicle')],
    queryConstraints: [],
    filterFn: filterActiveItems,
  });

  useEffect(() => {
    const cars: Fzg[] = firecallItems.filter(
      (item) => item.type === 'vehicle'
    ) as Fzg[];
    const firecallEntries: Diary[] = [
      cars
        .filter((item) => item.alarmierung)
        .map(
          (item) =>
            ({
              id: 'alarmierung' + item.id,
              datum: item.alarmierung,
              type: 'diary',
              name: `${item.name} ${item.fw || ''} alarmiert`,
              beschreibung: `${item.besatzung ? '1:' + item.besatzung : ''} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
            } as Diary)
        ),
      cars
        .filter((item) => item.eintreffen)
        .map(
          (item) =>
            ({
              id: 'eintreffen' + item.id,
              datum: item.eintreffen,
              type: 'diary',
              name: `${item.name} ${item.fw || ''} eingetroffen`,
              beschreibung: `${item.besatzung ? '1:' + item.besatzung : ''} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
            } as Diary)
        ),
      cars
        .filter((item) => item.abruecken)
        .map(
          (item) =>
            ({
              id: 'abruecken' + item.id,
              datum: item.abruecken,
              type: 'diary',
              name: `${item.name} ${item.fw || ''} abgerückt`,
              beschreibung: `${item.besatzung ? '1:' + item.besatzung : ''} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
            } as Diary)
        ),
      firecallItems
        .filter((item) => item.type !== 'vehicle' && item.datum)
        .map(
          (item) =>
            ({
              ...item,
              type: 'diary',
              editable: false,
            } as Diary)
        ),
    ].flat();
    const diaries = [diaryEntries, firecallEntries]
      .flat()
      .sort((a, b) => b.datum.localeCompare(a.datum));
    setDiaries(diaries);
  }, [diaryEntries, firecallItems]);

  const diaryClose = useCallback(
    (item?: FirecallItem) => {
      setTagebuchDialogIsOpen(false);
      if (item) {
        addDoc(collection(firestore, 'call', firecallId, 'diary'), {
          ...item,
          user: email,
          created: new Date(),
        });
      }
    },
    [email, firecallId]
  );

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Einsatz Tagebuch
        </Typography>
        <Grid container spacing={2}>
          {diaries.map((item) => (
            <FirecallItemCard
              item={item}
              key={item.id}
              firecallId={firecallId}
            />
          ))}
        </Grid>
      </Box>

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        onClick={() => setTagebuchDialogIsOpen(true)}
      >
        <AddIcon />
      </Fab>

      {tagebuchDialogIsOpen && (
        <FirecallItemDialog
          type="diary"
          onClose={diaryClose}
          allowTypeChange={false}
        />
      )}
    </>
  );
}
