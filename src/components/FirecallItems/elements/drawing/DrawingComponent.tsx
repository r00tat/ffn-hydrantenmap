import React from 'react';
import { FirecallItem } from '../../../firebase/firestore';

interface DrawingComponentProps {
  item: FirecallItem;
  pane?: string;
}

// Stub — real implementation in Task 5
export default function DrawingComponent({
  item,
}: DrawingComponentProps): React.ReactNode {
  return null;
}
