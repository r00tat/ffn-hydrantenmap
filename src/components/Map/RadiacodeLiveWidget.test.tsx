// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RadiacodeLiveWidget from './RadiacodeLiveWidget';

describe('RadiacodeLiveWidget', () => {
  it('does not render when not active', () => {
    const { container } = render(
      <RadiacodeLiveWidget
        active={false}
        measurement={{ dosisleistung: 0.14, cps: 5, timestamp: 1 }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render when measurement is null', () => {
    const { container } = render(
      <RadiacodeLiveWidget active={true} measurement={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows dosisleistung with µSv/h unit', () => {
    render(
      <RadiacodeLiveWidget
        active={true}
        measurement={{ dosisleistung: 0.14, cps: 5, timestamp: 1 }}
      />,
    );
    expect(screen.getByText(/µSv\/h/)).toBeInTheDocument();
    expect(screen.getByText(/0\.14/)).toBeInTheDocument();
  });

  it('shows cps', () => {
    render(
      <RadiacodeLiveWidget
        active={true}
        measurement={{ dosisleistung: 0.14, cps: 42, timestamp: 1 }}
      />,
    );
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText(/cps/i)).toBeInTheDocument();
  });

  it('has green background for low dose (< 1 µSv/h)', () => {
    const { container } = render(
      <RadiacodeLiveWidget
        active={true}
        measurement={{ dosisleistung: 0.5, cps: 5, timestamp: 1 }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-dose-level')).toBe('low');
  });

  it('has yellow background for medium dose (1–10 µSv/h)', () => {
    const { container } = render(
      <RadiacodeLiveWidget
        active={true}
        measurement={{ dosisleistung: 5, cps: 5, timestamp: 1 }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-dose-level')).toBe('medium');
  });

  it('has red background for high dose (> 10 µSv/h)', () => {
    const { container } = render(
      <RadiacodeLiveWidget
        active={true}
        measurement={{ dosisleistung: 25, cps: 5, timestamp: 1 }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-dose-level')).toBe('high');
  });
});
