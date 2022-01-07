export interface RohrIconOptions {
  color?: string;
}

export default function RohrIcon({ color = 'rgba(0, 0, 0, 0.6)' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill={color}>
      <line
        x1="2"
        y1="12"
        x2="20"
        y2="12"
        style={{ stroke: color, strokeWidth: 2 }}
      />
      <line
        x1="2"
        y1="12"
        x2="7"
        y2="7"
        style={{ stroke: color, strokeWidth: 2 }}
      />
      <line
        x1="2"
        y1="12"
        x2="7"
        y2="17"
        style={{ stroke: color, strokeWidth: 2 }}
      />
      <line
        x1="20"
        y1="7"
        x2="20"
        y2="17"
        style={{ stroke: color, strokeWidth: 2 }}
      />
    </svg>
  );
}
