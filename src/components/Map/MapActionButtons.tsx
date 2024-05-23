import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import L from "leaflet";
import React, { useCallback, useState } from "react";
import { useMapEvent } from "react-leaflet";
import useFirecallItemAdd from "../../hooks/useFirecallItemAdd";
import FirecallItemDialog from "../FirecallItems/FirecallItemDialog";
import { fcItemClasses, getItemInstance } from "../FirecallItems/elements";
import { Connection, FirecallItem } from "../firebase/firestore";
import { useLeitungen } from "./Leitungen/context";
import RecordButton from "./RecordButton";
import SearchButton from "./SearchButton";

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const [fzgDialogIsOpen, setFzgDialogIsOpen] = useState(false);
  const leitungen = useLeitungen();
  const addFirecallItem = useFirecallItemAdd();
  const [fzgDrawing, setFzgDrawing] = useState<FirecallItem>();

  const saveItem = useCallback(
    (item?: FirecallItem) => {
      if (item) {
        const { eventHandlers, ...rest } = item;

        addFirecallItem({
          datum: new Date().toISOString(),
          lat: map.getCenter().lat,
          lng: map.getCenter().lng,
          ...rest,
        });
      }
    },
    [addFirecallItem, map]
  );

  useMapEvent("mousemove", (e) => {
    if (fzgDrawing) {
      // console.info(`moving marker to ${e.latlng.lat}, ${e.latlng.lng}`);
      setFzgDrawing({
        ...fzgDrawing,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    }
  });

  useMapEvent("click", (e) => {
    if (fzgDrawing) {
      console.info(`dropping marker to ${e.latlng.lat}, ${e.latlng.lng}`);

      const fzgUpdated = {
        ...fzgDrawing,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };
      saveItem(fzgUpdated);
      setFzgDrawing(undefined);
    }
  });

  const fzgDialogClose = useCallback(
    (fzg?: FirecallItem) => {
      setFzgDialogIsOpen(false);
      if (fcItemClasses[fzg?.type || ""]?.isPolyline()) {
        leitungen.setIsDrawing(true);
        leitungen.setFirecallItem(fzg as Connection);
      } else {
        if (fzg) {
          console.info(`set fzg is drawing`);
          setFzgDrawing({
            ...fzg,
            lat: map.getCenter().lat,
            lng: map.getCenter().lng,
            eventHandlers: {
              click: (e) => {
                console.info(`clicked on ${e.latlng.lat}, ${e.latlng.lng}`);
                saveItem({ ...fzg, lat: e.latlng.lat, lng: e.latlng.lng });
                setFzgDrawing(undefined);
              },
            },
          });
        }
        // saveItem(fzg);
      }
    },
    [leitungen, map, saveItem]
  );

  return (
    <>
      <Box
        sx={{
          // '& > :not(style)': { m: 1 },
          position: "absolute",
          bottom: 24,
          right: 16,
        }}
      >
        <Fab
          color="primary"
          aria-label="add"
          size="medium"
          onClick={(event) => {
            event.preventDefault();
            setFzgDialogIsOpen(true);
          }}
        >
          <AddIcon />
        </Fab>
      </Box>

      <RecordButton />
      <SearchButton />

      {fzgDialogIsOpen && (
        <FirecallItemDialog onClose={fzgDialogClose} type="marker" />
      )}

      {fzgDrawing && (
        <React.Fragment>
          {getItemInstance(fzgDrawing).renderMarker(() => {})}
        </React.Fragment>
      )}
    </>
  );
}
