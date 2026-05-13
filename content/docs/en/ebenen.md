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
