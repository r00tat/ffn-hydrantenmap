import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { CircularProgress, Typography } from '@mui/material';
import Button from '@mui/material/Button';
import { styled } from '@mui/material/styles';
import { useCallback, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { FirecallExport, importFirecall } from '../../hooks/useExport';

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

async function readFileAsJson(file: File): Promise<FirecallExport> {
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', (ev) => {
      if (!reader.result) {
        console.warn('failed to read file, reader empty');
        reject('failed to read file, reader empty');
      } else {
        resolve(reader.result?.toString());
      }
    });
    reader.addEventListener('error', (ev) => {
      reject('load error');
    });
    console.log(`reading as text`);
    reader.readAsText(file, 'utf8');
    console.log(`text read`);
  });
  console.log(`json parsing`);
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
