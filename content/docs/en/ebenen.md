# Layers

Layers let you group and organise operation items on the map. Each layer can have its own visibility, appearance and data-field settings.

## Features

- Create and name custom layers
- Move items between layers via drag & drop
- **Reorder layers via drag & drop** Affects the rendering order on the map
- **Toggle visibility per layer** Controlled through the defaultVisible setting
- Set the z-index for rendering order
- **User-defined data fields (data schema)** With types: number, text, boolean, computed
- Configure heatmap visualisation
- **Interpolation rendering** IDW – Inverse Distance Weighting
- Import and export layers
- Show or hide labels
- Configure grouping and aggregation

## Instructions

### Create a new layer

1. Click the FAB (floating action button) at the bottom right
2. Enter a name for the layer
3. Set the options (visibility, z-index, etc.)
4. Save

### Assign items

1. Drag an item onto the desired layer
2. A green outline marks the drop target
3. Release to assign

:::info
Tip: Unassigned items appear in the "Items not assigned" column and can be dragged from there onto a layer.
:::

### Reorder layers

1. Grab the drag handle on the left of the layer
2. Drag up or down
3. Higher position = rendered further on top

### Define data fields

1. Edit the layer
2. Open the data schema
3. Add a field with name and type: number, text, boolean or computed

### Configure a heatmap

1. Edit the layer
2. Enable heatmap
3. Choose the data field to visualise
4. Set the colour mode to auto or manual
5. Adjust radius and blur

### Use interpolation

1. Set the visualisation mode to "Interpolation"
2. Specify the radius in metres
3. Adjust transparency
4. Configure algorithm and colour scale

:::info
Tip: Heatmaps are especially useful for measurement values (e.g. radiation levels, water levels). Interpolation estimates values between the measurement points.
:::

## Custom map layers (WMS/WMTS)

Besides layers for operation elements you can create **custom map layers**: external map services drawn on top of the base map — a neighbouring district's WMS, a flood service, an exercise plan. They appear in the map's layer control with a “Karte:” prefix and can be toggled there.

Map layers belong to the operation: everyone working on it sees them. Guests using the share link see them too but cannot change them.

### Creating a map layer

1. On the "Ebenen" page scroll down to the "Custom map layers" section
2. Click "Add map layer"
3. Enter a **name** — it is shown in the layer control
4. Pick the **type**:
   - **WMS** — GetMap endpoint of a map service
   - **Tile URL (WMTS/XYZ)** — tile template containing `{z}`, `{x}` and `{y}`
5. Enter the **URL** (`https://` only)
6. For WMS click "Load layers from the service" — the available layers are read from the service's `GetCapabilities` and offered for selection. You may also type the `LAYERS` value directly.
7. Set the **opacity** so the base map stays visible underneath
8. Optionally set **bounds** (`south,west,north,east`), **maxZoom/maxNativeZoom**, **attribution** and **order**
9. Turn on **on by default** if the layer should be visible when the map opens
10. Save

:::info
A broken or unreachable service cannot break the map: missing tiles stay empty and the base map remains visible.
:::

:::info
Custom map layers are **not** precached for offline use. Without a network they stay empty. The attribution is stored as plain text — HTML and links are not possible there.
:::
