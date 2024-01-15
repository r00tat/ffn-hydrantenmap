import React, { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@mui/material';

export interface DraggableCardProps {
  children: ReactNode;
  id: string;
}

export default function DraggableCard({ children, id }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
  });
  const style = {
    // Outputs `translate3d(x, y, 0)`
    transform: CSS.Translate.toString(transform),
  };

  return (
    <Card ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </Card>
  );
}
