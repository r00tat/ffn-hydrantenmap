// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReactNode } from 'react';
import { BleAdapter } from '../../hooks/radiacode/bleAdapter';
import { RadiacodeMeasurement } from '../../hooks/radiacode/types';

// RadiacodeProvider now calls useFirecallItemAdd which pulls in firestore.
// Mock it so tests don't need a live Firebase app.
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => vi.fn(async () => ({ id: 'mock-doc' })),
}));

import { RadiacodeProvider } from '../providers/RadiacodeProvider';
import RadiacodeLiveWidget from './RadiacodeLiveWidget';

function nullAdapter(): BleAdapter {
  return {
    isSupported: () => true,
    requestDevice: vi.fn(async () => ({ id: 'dev', name: 'RC-103', serial: 'SN' })),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    onNotification: vi.fn(async () => () => {}),
    write: vi.fn(async () => {}),
  };
}

function renderWithMeasurement(
  children: ReactNode,
  measurement: RadiacodeMeasurement | null,
) {
  const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
  const result = render(
    <RadiacodeProvider
      adapter={nullAdapter()}
      feedMeasurement={(fn) => feeds.push(fn)}
    >
      {children}
    </RadiacodeProvider>,
  );
  if (measurement) {
    act(() => {
      feeds[0](measurement);
    });
  }
  return result;
}

describe('RadiacodeLiveWidget', () => {
  it('does not render when not visible', () => {
    const { container } = renderWithMeasurement(
      <RadiacodeLiveWidget visible={false} />,
      { dosisleistung: 0.14, cps: 5, timestamp: 1 },
    );
    expect(container.querySelector('[data-dose-level]')).toBeNull();
  });

  it('does not render when no measurement in context', () => {
    const { container } = renderWithMeasurement(
      <RadiacodeLiveWidget />,
      null,
    );
    expect(container.querySelector('[data-dose-level]')).toBeNull();
  });

  it('shows dosisleistung with µSv/h unit', () => {
    renderWithMeasurement(
      <RadiacodeLiveWidget />,
      { dosisleistung: 0.14, cps: 5, timestamp: 1 },
    );
    expect(screen.getByText(/µSv\/h/)).toBeInTheDocument();
    expect(screen.getByText(/0\.14/)).toBeInTheDocument();
  });

  it('shows cps', () => {
    renderWithMeasurement(
      <RadiacodeLiveWidget />,
      { dosisleistung: 0.14, cps: 42, timestamp: 1 },
    );
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText(/cps/i)).toBeInTheDocument();
  });

  it('has green background for low dose (< 1 µSv/h)', () => {
    const { container } = renderWithMeasurement(
      <RadiacodeLiveWidget />,
      { dosisleistung: 0.5, cps: 5, timestamp: 1 },
    );
    const root = container.querySelector('[data-dose-level]') as HTMLElement;
    expect(root.getAttribute('data-dose-level')).toBe('low');
  });

  it('has yellow background for medium dose (1–10 µSv/h)', () => {
    const { container } = renderWithMeasurement(
      <RadiacodeLiveWidget />,
      { dosisleistung: 5, cps: 5, timestamp: 1 },
    );
    const root = container.querySelector('[data-dose-level]') as HTMLElement;
    expect(root.getAttribute('data-dose-level')).toBe('medium');
  });

  it('has red background for high dose (> 10 µSv/h)', () => {
    const { container } = renderWithMeasurement(
      <RadiacodeLiveWidget />,
      { dosisleistung: 25, cps: 5, timestamp: 1 },
    );
    const root = container.querySelector('[data-dose-level]') as HTMLElement;
    expect(root.getAttribute('data-dose-level')).toBe('high');
  });
});
