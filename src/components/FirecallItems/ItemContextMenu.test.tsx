// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../hooks/useZOrderActions', () => ({
  default: vi.fn(() => ({
    handleBringToFront: vi.fn(),
    handleSendToBack: vi.fn(),
    handleBringForward: vi.fn(),
    handleSendBackward: vi.fn(),
  })),
}));

import ItemContextMenu from './ItemContextMenu';

const baseProps = {
  item: { id: '1', name: 'Test', type: 'marker' } as any,
  siblings: [],
  anchorPosition: { top: 100, left: 100 },
  onClose: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe('ItemContextMenu', () => {
  it('renders edit and delete menu items', () => {
    render(<ItemContextMenu {...baseProps} />);
    expect(screen.getByText('Bearbeiten')).toBeInTheDocument();
    expect(screen.getByText('Löschen')).toBeInTheDocument();
  });

  it('renders copy menu item when onCopy is provided', () => {
    render(<ItemContextMenu {...baseProps} onCopy={vi.fn()} />);
    expect(screen.getByText('Kopieren')).toBeInTheDocument();
  });

  it('does not render copy menu item when onCopy is not provided', () => {
    render(<ItemContextMenu {...baseProps} />);
    expect(screen.queryByText('Kopieren')).not.toBeInTheDocument();
  });

  it('renders customActions when provided', () => {
    render(
      <ItemContextMenu
        {...baseProps}
        customActions={<li data-testid="custom-action">Custom Action</li>}
      />
    );
    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
    expect(screen.getByText('Custom Action')).toBeInTheDocument();
  });

  it('does not render extra divider when customActions is not provided', () => {
    render(<ItemContextMenu {...baseProps} />);
    const dividers = document.querySelectorAll('.MuiDivider-root');
    expect(dividers.length).toBe(1);
  });

  it('renders extra divider when customActions is provided', () => {
    const { container } = render(
      <ItemContextMenu
        {...baseProps}
        customActions={<li>Custom</li>}
      />
    );
    const dividers = document.querySelectorAll('.MuiDivider-root');
    expect(dividers.length).toBe(2);
  });
});
