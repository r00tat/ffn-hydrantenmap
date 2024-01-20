import CloudUploadIcon from '@mui/icons-material/CloudUpload';

import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { FirecallExport, importFirecall } from '../../hooks/useExport';
import VisuallyHiddenInput from '../upload/VisuallyHiddenInput';
import readFileAsText from '../upload/readFile';

async function readFileAsJson(file: File): Promise<FirecallExport> {
  const result = await readFileAsText(file);
  const firecallData = JSON.parse(result);
  return firecallData;
}

export default function FirecallImport() {
  const [uploadInProgress, setUploadInProgress] = useState(false);

  const handleUpload = useCallback(async (files: FileList): Promise<void> => {
    console.log(`firecall import upload change `, files);

    if (files) {
      setUploadInProgress(true);

      const refs = await Promise.allSettled(
        Array.from(files).map(async (file) => {
          console.log(`uploading ${file.name}`);
          const firecallData = await readFileAsJson(file);

          console.log(`importing firecall ${firecallData.name}`);
          const ref = await importFirecall({
            ...firecallData,
            name: `${firecallData.name} Kopie ${formatTimestamp(new Date())}`,
          });

          console.debug(`import finished with ID: ${ref.id}`);
          return ref;
        })
      );
      // .filter((p) => p.status === 'fulfilled');
      // .map((p) => (p as PromiseFulfilledResult<StorageReference>).value);
      setUploadInProgress(false);
    }
  }, []);

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={<CloudUploadIcon />}
      >
        Einsatz importieren
        <VisuallyHiddenInput
          type="file"
          accept="application/json"
          // multiple
          onChange={(event) => {
            (async () => {
              if (event.target.files) {
                await handleUpload(event.target.files);
                event.target.value = '';
              }
            })();
          }}
        />
      </Button>
      {uploadInProgress && (
        <>
          <Typography>Uploading ... </Typography>
          <CircularProgress />
        </>
      )}
    </>
  );
}
