import { useCallback, useMemo } from 'react';
import { FirecallItem } from '../components/firebase/firestore';
import useFirecallItemUpdate from './useFirecallItemUpdate';
import { sortByZIndex } from './useFirecallLayers';

export interface ZOrderActions {
  handleBringToFront: () => void;
  handleSendToBack: () => void;
  handleBringForward: () => void;
  handleSendBackward: () => void;
}

/**
 * Provides z-order manipulation actions for a firecall item within a set of siblings.
 * @param item The item to reorder
 * @param siblings All items in the same layer (including the item itself)
 * @param onZIndexChanged Optional callback after the zIndex has been updated
 */
export default function useZOrderActions(
  item: FirecallItem | undefined,
  siblings: FirecallItem[],
  onZIndexChanged?: (newZIndex: number) => void
): ZOrderActions {
  const updateItem = useFirecallItemUpdate();
  const sortedSiblings = useMemo(() => sortByZIndex(siblings), [siblings]);

  const handleZIndexChange = useCallback(
    async (newZIndex: number, swapItem?: FirecallItem) => {
      if (!item) return;
      await updateItem({ ...item, zIndex: newZIndex });
      if (swapItem && swapItem.id) {
        await updateItem({
          ...swapItem,
          zIndex: item.zIndex ?? 0,
        });
      }
      onZIndexChanged?.(newZIndex);
    },
    [item, updateItem, onZIndexChanged]
  );

  const handleBringToFront = useCallback(() => {
    const maxZ =
      sortedSiblings.length > 0
        ? Math.max(...sortedSiblings.map((s) => s.zIndex ?? 0))
        : 0;
    handleZIndexChange(maxZ + 1);
  }, [sortedSiblings, handleZIndexChange]);

  const handleSendToBack = useCallback(() => {
    const minZ =
      sortedSiblings.length > 0
        ? Math.min(...sortedSiblings.map((s) => s.zIndex ?? 0))
        : 0;
    handleZIndexChange(minZ - 1);
  }, [sortedSiblings, handleZIndexChange]);

  const handleBringForward = useCallback(() => {
    if (!item) return;
    const currentIndex = sortedSiblings.findIndex((s) => s.id === item.id);
    if (currentIndex < 0 || currentIndex >= sortedSiblings.length - 1) {
      handleZIndexChange((item.zIndex ?? 0) + 1);
      return;
    }
    const nextItem = sortedSiblings[currentIndex + 1];
    if ((nextItem.zIndex ?? 0) === (item.zIndex ?? 0)) {
      handleZIndexChange((item.zIndex ?? 0) + 1);
    } else {
      handleZIndexChange(nextItem.zIndex ?? 0, nextItem);
    }
  }, [sortedSiblings, item, handleZIndexChange]);

  const handleSendBackward = useCallback(() => {
    if (!item) return;
    const currentIndex = sortedSiblings.findIndex((s) => s.id === item.id);
    if (currentIndex <= 0) {
      handleZIndexChange((item.zIndex ?? 0) - 1);
      return;
    }
    const prevItem = sortedSiblings[currentIndex - 1];
    if ((prevItem.zIndex ?? 0) === (item.zIndex ?? 0)) {
      handleZIndexChange((item.zIndex ?? 0) - 1);
    } else {
      handleZIndexChange(prevItem.zIndex ?? 0, prevItem);
    }
  }, [sortedSiblings, item, handleZIndexChange]);

  return {
    handleBringToFront,
    handleSendToBack,
    handleBringForward,
    handleSendBackward,
  };
}
