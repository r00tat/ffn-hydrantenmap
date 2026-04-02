import EinsatzClient from './EinsatzClient';

export default function EinsatzLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EinsatzClient>{children}</EinsatzClient>;
}
