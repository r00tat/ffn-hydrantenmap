'use client';

import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import VisuallyHiddenInput from '../upload/VisuallyHiddenInput';

export interface FileUploadProps {
  /**
   * File types to accept (e.g., ".har", ".csv")
   */
  accept: string;
  /**
   * Callback when a file is selected
   */
  onFileSelect: (file: File) => void;
  /**
   * Button label text
   */
  label: string;
  /**
   * Whether the upload button is disabled
   */
  disabled?: boolean;
  /**
   * Currently selected file (to show filename)
   */
  selectedFile?: File | null;
}

/**
 * Simple file upload component using MUI Button with hidden input.
 * Displays the selected filename after selection.
 */
export default function FileUpload({
  accept,
  onFileSelect,
  label,
  disabled = false,
  selectedFile,
}: FileUploadProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Button
        component="label"
        variant="contained"
        startIcon={<CloudUploadIcon />}
        disabled={disabled}
      >
        {label}
        <VisuallyHiddenInput
          type="file"
          accept={accept}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onFileSelect(file);
            }
            // Reset input value to allow selecting the same file again
            event.target.value = '';
          }}
        />
      </Button>
      {selectedFile && (
        <Typography variant="body2" color="text.secondary">
          {selectedFile.name}
        </Typography>
      )}
    </Box>
  );
}
