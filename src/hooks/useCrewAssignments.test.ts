// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock firebase modules before importing
vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
    id: args[args.length - 1] || 'mock-id',
  })),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc-id' })),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
  query: vi.fn((col: unknown) => col),
}));

// Mock the hooks that useCrewAssignments depends on
const mockCrewAssignments: { recipientId: string; name: string }[] = [];
vi.mock('./useFirebaseCollection', () => ({
  default: vi.fn(() => mockCrewAssignments),
}));

vi.mock('./useFirecall', () => ({
  useFirecallId: vi.fn(() => 'test-firecall-id'),
}));

vi.mock('./useFirebaseLogin', () => ({
  default: vi.fn(() => ({ email: 'test@example.com' })),
}));

import useCrewAssignments, {
  type BlaulichtSmsRecipient,
} from './useCrewAssignments';
import {
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

const mockAddDoc = addDoc as unknown as ReturnType<typeof vi.fn>;
const mockUpdateDoc = updateDoc as unknown as ReturnType<typeof vi.fn>;
const mockDeleteDoc = deleteDoc as unknown as ReturnType<typeof vi.fn>;

describe('useCrewAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCrewAssignments.length = 0;
  });

  describe('syncFromAlarm', () => {
    it('creates docs for new yes recipients', async () => {
      const recipients: BlaulichtSmsRecipient[] = [
        { id: 'r1', name: 'Alice', participation: 'yes' },
        { id: 'r2', name: 'Bob', participation: 'yes' },
      ];

      const { result } = renderHook(() => useCrewAssignments());

      await act(async () => {
        await result.current.syncFromAlarm(recipients);
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(2);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('crew') }),
        expect.objectContaining({
          recipientId: 'r1',
          name: 'Alice',
          vehicleId: null,
          vehicleName: '',
          funktion: 'Feuerwehrmann',
          updatedBy: 'test@example.com',
        })
      );
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('crew') }),
        expect.objectContaining({
          recipientId: 'r2',
          name: 'Bob',
        })
      );
    });

    it('skips recipients with participation other than yes', async () => {
      const recipients: BlaulichtSmsRecipient[] = [
        { id: 'r1', name: 'Alice', participation: 'yes' },
        { id: 'r2', name: 'Bob', participation: 'no' },
        { id: 'r3', name: 'Carol', participation: 'pending' },
      ];

      const { result } = renderHook(() => useCrewAssignments());

      await act(async () => {
        await result.current.syncFromAlarm(recipients);
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'r1', name: 'Alice' })
      );
    });

    it('skips recipients that already exist in crew assignments', async () => {
      mockCrewAssignments.push({ recipientId: 'r1', name: 'Alice' });

      const recipients: BlaulichtSmsRecipient[] = [
        { id: 'r1', name: 'Alice', participation: 'yes' },
        { id: 'r2', name: 'Bob', participation: 'yes' },
      ];

      const { result } = renderHook(() => useCrewAssignments());

      await act(async () => {
        await result.current.syncFromAlarm(recipients);
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'r2', name: 'Bob' })
      );
    });
  });

  describe('assignVehicle', () => {
    it('calls updateDoc with correct vehicle data', async () => {
      const { result } = renderHook(() => useCrewAssignments());

      await act(async () => {
        await result.current.assignVehicle('crew-1', 'vehicle-1', 'TLF 4000');
      });

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('crew-1'),
        }),
        expect.objectContaining({
          vehicleId: 'vehicle-1',
          vehicleName: 'TLF 4000',
          updatedBy: 'test@example.com',
        })
      );
    });

    it('supports null vehicleId for unassigning', async () => {
      const { result } = renderHook(() => useCrewAssignments());

      await act(async () => {
        await result.current.assignVehicle('crew-1', null, '');
      });

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          vehicleId: null,
          vehicleName: '',
        })
      );
    });
  });

  describe('updateFunktion', () => {
    it('calls updateDoc with funktion', async () => {
      const { result } = renderHook(() => useCrewAssignments());

      await act(async () => {
        await result.current.updateFunktion('crew-1', 'Maschinist');
      });

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('crew-1'),
        }),
        expect.objectContaining({
          funktion: 'Maschinist',
          updatedBy: 'test@example.com',
        })
      );
    });
  });

  describe('removeAssignment', () => {
    it('calls deleteDoc for the assignment', async () => {
      const { result } = renderHook(() => useCrewAssignments());

      await act(async () => {
        await result.current.removeAssignment('crew-1');
      });

      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      expect(mockDeleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('crew-1'),
        })
      );
    });
  });
});
