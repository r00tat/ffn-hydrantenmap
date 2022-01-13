import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { addDoc, collection, orderBy } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import useFirecall from '../hooks/useFirecall';
import { firestore } from './firebase';
import FirecallItemCard from './FirecallItemCard';
import FirecallItemDialog from './FirecallItemDialog';
import { Diary, filterActiveItems, FirecallItem } from './firestore';

export default function EinsatzTagebuch() {
  const [tagebuchDialogIsOpen, setTagebuchDialogIsOpen] = useState(false);
  const { email } = useFirebaseLogin();
  const firecall = useFirecall();

  const diaryEntries = useFirebaseCollection<Diary>({
    collectionName: 'call',
    pathSegments: [firecall?.id || 'unkown', 'diary'],
    // queryConstraints: [where('type', '==', 'vehicle')],
    queryConstraints: [orderBy('datum', 'desc')],
    filterFn: filterActiveItems,
  });

  const diaryClose = useCallback(
    (item?: FirecallItem) => {
      setTagebuchDialogIsOpen(false);
      if (item) {
        addDoc(
          collection(firestore, 'call', firecall?.id || 'unkown', 'diary'),
          {
            ...item,
            user: email,
            created: new Date(),
          }
        );
      }
    },
    [email, firecall?.id]
  );

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Einsatz Tagebuch
        </Typography>
        <Grid container spacing={2}>
          {diaryEntries.map((item) => (
            <FirecallItemCard
              item={item}
              key={item.id}
              firecallId={firecall?.id}
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
