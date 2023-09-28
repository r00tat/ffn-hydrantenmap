import ConnectionMarker, { ConnectionMarkerProps } from './ConnectionMarker';

export interface LineMarkerProps extends ConnectionMarkerProps {}

export default function LineMarker({ record, selectItem }: LineMarkerProps) {
  return <ConnectionMarker record={record} selectItem={selectItem} />;
}
