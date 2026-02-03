import Box from '@mui/material/Box';
import Image from 'next/image';

interface ScreenshotProps {
  src: string;
  alt: string;
}

export default function Screenshot({ src, alt }: ScreenshotProps) {
  return (
    <Box
      sx={{
        my: 3,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: 1,
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={1280}
        height={800}
        style={{ width: '100%', height: 'auto' }}
      />
    </Box>
  );
}
