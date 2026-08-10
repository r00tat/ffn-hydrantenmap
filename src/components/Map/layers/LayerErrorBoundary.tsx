'use client';

import React from 'react';
import { recordError } from '../../firebase/crashlytics';

interface Props {
  /** Layer name as shown in the layers control — used for error reporting. */
  name: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary around a single map layer.
 *
 * A layer that fails to render (bad upstream data, invalid coordinates, …) must
 * not take down the whole map. The boundary renders nothing in that case, so
 * the remaining layers keep working, and reports the failure to Crashlytics
 * once per layer instance.
 */
export default class LayerErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  private reported = false;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (this.reported) return;
    this.reported = true;
    console.error(`Layer "${this.props.name}" failed to render`, error);
    void recordError(error, {
      source: 'map-layer-error-boundary',
      layer: this.props.name,
      componentStack: info.componentStack ?? '',
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
