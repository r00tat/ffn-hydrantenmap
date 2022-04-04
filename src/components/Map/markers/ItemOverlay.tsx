import Container from '@mui/material/Container';
import { FirecallItem } from '../../firebase/firestore';
import FirecallItemCard from '../../FirecallItems/FirecallItemCard';

export interface ItemOverlayOptions {
  item: FirecallItem;
  close: () => void;
}
export default function ItemOverlay({ item, close }: ItemOverlayOptions) {
  return (
    <Container
      sx={{
        minWidth: 200,
        height: '40%',
        zIndex: 'modal',
        position: 'absolute',
        top: '55%',
        left: '5%',
        width: '90%',
      }}
    >
      <FirecallItemCard item={item} close={close} />
    </Container>
  );
}
