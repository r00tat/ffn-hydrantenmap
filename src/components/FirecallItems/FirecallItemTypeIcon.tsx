'use client';

import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import SvgIcon from '@mui/material/SvgIcon';
import Image from 'next/image';
import { getItemClass } from './elements';

/**
 * Types that never appear on the map and therefore have no map icon of their
 * own; they would fall back to the generic marker icon, which says nothing
 * about what they are. `upload` is a pseudo type without an item class; diary
 * and Geschäftsbuch use the icons of their pages in the navigation.
 */
const MUI_TYPE_ICONS: Record<string, typeof SvgIcon> = {
  upload: PhotoCameraIcon,
  diary: LibraryBooksIcon,
  gb: MenuBookIcon,
};

export interface FirecallItemTypeIconOptions {
  /** firecall item type key, e.g. `vehicle` or `hydrant` */
  type: string;
  /** rendered width in px; the height follows the icon's aspect ratio */
  size?: number;
}

/**
 * Renders the map icon of a firecall item type. Non-square icons (Rohr,
 * Leitung, …) keep their aspect ratio instead of being squeezed into a box.
 */
export default function FirecallItemTypeIcon({
  type,
  size = 24,
}: FirecallItemTypeIconOptions) {
  const MuiIcon = MUI_TYPE_ICONS[type];
  if (MuiIcon) {
    return <MuiIcon sx={{ width: size, height: size }} />;
  }

  const icon = getItemClass(type).factory().icon();
  const [iw, ih] = icon.options.iconSize as [number, number];
  const iconUrl = icon.options.iconUrl;

  if (!iconUrl) {
    return null;
  }

  if (iw === ih) {
    return <Image src={iconUrl} alt="" width={size} height={size} />;
  }

  return (
    // next/image would need explicit dimensions per icon; a plain img keeps the
    // aspect ratio with a single rule.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt=""
      width={size}
      height={Math.round((size * ih) / iw)}
    />
  );
}
