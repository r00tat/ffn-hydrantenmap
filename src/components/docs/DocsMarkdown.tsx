'use client';

import Alert, { AlertColor } from '@mui/material/Alert';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { Children, ReactNode, isValidElement, useMemo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import Screenshot from './Screenshot';

interface DocsMarkdownProps {
  markdown: string;
}

const ALERT_SEVERITIES: AlertColor[] = ['info', 'warning', 'success', 'error'];

function remarkDirectivesToAlerts() {
  return (tree: unknown) => {
    visit(tree as never, (node: any) => {
      if (
        node.type === 'containerDirective' ||
        node.type === 'leafDirective' ||
        node.type === 'textDirective'
      ) {
        const data = node.data || (node.data = {});
        data.hName = 'div';
        data.hProperties = {
          ...(node.attributes || {}),
          'data-directive': node.name,
        };
      }
    });
  };
}

function flattenText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string') return child;
      if (typeof child === 'number') return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return flattenText(child.props.children);
      }
      return '';
    })
    .join('');
}

export default function DocsMarkdown({ markdown }: DocsMarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <Typography variant="h3" gutterBottom>
          {children}
        </Typography>
      ),
      h2: ({ children }) => (
        <Typography variant="h4" gutterBottom sx={{ mt: 3 }}>
          {children}
        </Typography>
      ),
      h3: ({ children }) => (
        <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
          {children}
        </Typography>
      ),
      h4: ({ children }) => (
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          {children}
        </Typography>
      ),
      p: ({ children }) => (
        <Typography component="p" sx={{ mb: 2 }}>
          {children}
        </Typography>
      ),
      ul: ({ children }) => <List dense>{children}</List>,
      ol: ({ children }) => (
        <Box component="ol" sx={{ pl: 3, mb: 2 }}>
          {children}
        </Box>
      ),
      li: ({ children, node }) => {
        const parentTag = (node as any)?.parent?.tagName;
        if (parentTag === 'ol') {
          return (
            <Typography component="li" sx={{ mb: 0.5 }}>
              {children}
            </Typography>
          );
        }
        const childArray = Children.toArray(children).filter(
          (c) => !(typeof c === 'string' && c.trim() === '')
        );
        const [first, ...rest] = childArray;
        const firstIsStrong =
          isValidElement(first) &&
          ((first as any).type === 'strong' || (first as any).props?.node?.tagName === 'strong');
        if (firstIsStrong) {
          const primary = flattenText((first as any).props.children);
          const secondary = rest;
          return (
            <ListItem disableGutters>
              <ListItemText primary={primary} secondary={<>{secondary}</>} />
            </ListItem>
          );
        }
        return (
          <ListItem disableGutters>
            <ListItemText primary={<>{children}</>} />
          </ListItem>
        );
      },
      a: ({ children, href }) => (
        <a href={href} style={{ color: 'inherit', textDecoration: 'underline' }}>
          {children}
        </a>
      ),
      img: ({ src, alt }) => {
        if (!src || typeof src !== 'string') return null;
        return <Screenshot src={src} alt={alt || ''} />;
      },
      div: ({ children, ...props }) => {
        const directive = (props as { 'data-directive'?: string })[
          'data-directive'
        ];
        if (directive && ALERT_SEVERITIES.includes(directive as AlertColor)) {
          return (
            <Alert severity={directive as AlertColor} sx={{ my: 2 }}>
              {children}
            </Alert>
          );
        }
        return <div {...props}>{children}</div>;
      },
      strong: ({ children }) => <strong>{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      code: ({ children }) => (
        <Box
          component="code"
          sx={{
            fontFamily: 'monospace',
            backgroundColor: 'action.hover',
            px: 0.5,
            borderRadius: 0.5,
          }}
        >
          {children}
        </Box>
      ),
    }),
    []
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkDirective, remarkDirectivesToAlerts]}
      components={components}
    >
      {markdown}
    </ReactMarkdown>
  );
}
