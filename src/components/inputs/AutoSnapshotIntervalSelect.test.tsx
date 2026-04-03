// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AutoSnapshotIntervalSelect from './AutoSnapshotIntervalSelect';

describe('AutoSnapshotIntervalSelect', () => {
  it('renders with default value', () => {
    render(<AutoSnapshotIntervalSelect value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders with disabled value', () => {
    render(<AutoSnapshotIntervalSelect value={0} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
