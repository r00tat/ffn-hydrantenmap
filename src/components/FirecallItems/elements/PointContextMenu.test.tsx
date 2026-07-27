// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';
import PointContextMenu from './PointContextMenu';

describe('PointContextMenu', () => {
  const baseProps = {
    anchorPosition: { top: 100, left: 100 },
    pointIndex: 1,
    pointCount: 4,
    minPoints: 3,
    onClose: vi.fn(),
    onInsert: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
  };

  it('renders the point actions when open', () => {
    renderWithIntl(<PointContextMenu {...baseProps} />);
    expect(screen.getByText('Punkt einfügen')).toBeInTheDocument();
    expect(screen.getByText('Punkt löschen')).toBeInTheDocument();
    expect(screen.getByText('Element bearbeiten')).toBeInTheDocument();
  });

  it('does not render when there is no anchor position', () => {
    renderWithIntl(
      <PointContextMenu {...baseProps} anchorPosition={undefined} />
    );
    expect(screen.queryByText('Punkt einfügen')).not.toBeInTheDocument();
  });

  it('calls onInsert and onClose when inserting', () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(
      <PointContextMenu {...baseProps} onInsert={onInsert} onClose={onClose} />
    );
    fireEvent.click(screen.getByText('Punkt einfügen'));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when deleting is allowed', () => {
    const onDelete = vi.fn();
    renderWithIntl(
      <PointContextMenu {...baseProps} onDelete={onDelete} />
    );
    fireEvent.click(screen.getByText('Punkt löschen'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('disables delete when the minimum number of points is reached', () => {
    const onDelete = vi.fn();
    renderWithIntl(
      <PointContextMenu
        {...baseProps}
        pointCount={3}
        minPoints={3}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByText('Punkt löschen'));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
