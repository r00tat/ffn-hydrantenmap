'use client';

import {
  CODE128_QUIET_ZONE,
  code128Path,
} from '../../../common/code128';

export interface Code128SvgProps {
  value: string;
  /** Höhe am Bildschirm in Pixeln. Beim Druck zählt die CSS der Druckseite. */
  height?: number;
}

/**
 * Ein Code-128-Symbol als SVG.
 *
 * Die Ruhezone steckt **in der `viewBox`**, nicht in einem Rand des
 * umgebenden Elements: Gedruckt wird das serialisierte SVG allein, und ohne
 * die zehn hellen Module links und rechts findet kein Decoder den Anfang des
 * Symbols — das Etikett wäre stumm.
 *
 * `preserveAspectRatio="none"`, weil ein Strichcode in der Höhe beliebig
 * dehnbar ist; nur die Breitenverhältnisse der Striche dürfen sich nicht
 * ändern. Bei „meet" würde der Code stattdessen mittig eingepasst und
 * schrumpfte auf die Höhe zusammen.
 */
export default function Code128Svg({ value, height = 96 }: Code128SvgProps) {
  const { path, width } = code128Path(value);
  const gesamt = width + 2 * CODE128_QUIET_ZONE;

  return (
    <svg
      viewBox={`0 0 ${gesamt} 1`}
      preserveAspectRatio="none"
      role="img"
      aria-label={value}
      style={{ display: 'block', width: '100%', height }}
    >
      <title>{value}</title>
      <rect width={gesamt} height={1} fill="#ffffff" />
      <path
        d={path}
        fill="#000000"
        transform={`translate(${CODE128_QUIET_ZONE} 0)`}
      />
    </svg>
  );
}
