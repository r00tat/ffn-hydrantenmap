// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useZOrderActions', () => ({
  default: vi.fn(() => ({
    handleBringToFront: vi.fn(),
    handleSendToBack: vi.fn(),
    handleBringForward: vi.fn(),
    handleSendBackward: vi.fn(),
  })),
}));

import ZOrderContextMenu from '../ZOrderContextMenu';

const baseProps = {
  item: { id: '1', name: 'Test', type: 'marker' } as any,
  siblings: [],
  anchorPosition: { top: 100, left: 100 },
  onClose: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe('ZOrderContextMenu', () => {
  it('renders edit and delete menu items', () => {
    render(<ZOrderContextMenu {...baseProps} />);
    expect(screen.getByText('Bearbeiten')).toBeInTheDocument();
    expect(screen.getByText('Löschen')).toBeInTheDocument();
  });

  it('renders customActions when provided', () => {
    render(
      <ZOrderContextMenu
        {...baseProps}
        customActions={<li data-testid="custom-action">Custom Action</li>}
      />
    );
    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
    expect(screen.getByText('Custom Action')).toBeInTheDocument();
  });

  it('does not render extra divider when customActions is not provided', () => {
    render(<ZOrderContextMenu {...baseProps} />);
    const dividers = document.querySelectorAll('.MuiDivider-root');
    expect(dividers.length).toBe(1);
  });

  it('renders extra divider when customActions is provided', () => {
    const { container } = render(
      <ZOrderContextMenu
        {...baseProps}
        customActions={<li>Custom</li>}
      />
    );
    const dividers = document.querySelectorAll('.MuiDivider-root');
    expect(dividers.length).toBe(2);
  });
});
