'use client';

import React from 'react';
import { recordError } from '../firebase/crashlytics';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void recordError(error, {
      source: 'react-error-boundary',
      componentStack: info.componentStack ?? '',
    });
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h2>Etwas ist schiefgelaufen</h2>
          <p>Die Anwendung konnte nicht angezeigt werden. Bitte neu laden.</p>
          <button onClick={this.handleReload}>Neu laden</button>
        </div>
      );
    }
    return this.props.children;
  }
}
