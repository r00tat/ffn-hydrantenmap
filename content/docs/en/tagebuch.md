# Operation log

The operation log documents all important events during an operation in chronological order. It serves as a complete record of all messages, orders and queries throughout the operation.

![Operation log](/docs-assets/screenshots/tagebuch.png)

## Features

- Create entries with an automatic timestamp
- **Entry types: M (message), B (command), F (question)** Classification according to the command staff scheme
- **From/To fields for sender and recipient** Documents the communication paths in the operation
- Automatic numbering of entries
- **Chronological timeline with sorting** Sortable by number, date, type, name and description
- **Automatic entries for vehicles and units** Alert, arrival and departure are generated automatically from the data of vehicles and tactical units, including strength or crew and breathing apparatus wearers
- **AI-assisted summary** Automatic summary of the whole operation based on all log entries
- CSV export of the log
- Edit and delete entries

## Instructions

### Create an entry

On desktop an inline form is available right in the table. On mobile use the FAB (floating action button) at the bottom right.

1. The number is assigned automatically and does not need to be entered
2. Choose the type of entry: **M** (message), **B** (command) or **F** (question)
3. Fill in the **From** and **To** fields (sender and recipient)
4. Enter the **name** – this is the main text of the entry
5. Optional: add a **description** with additional details
6. Click the button to save the entry

:::info
Tip: The entry types follow the command staff scheme: M = message (information), B = command (instruction), F = question (query).
:::

### Sort entries

1. Click a column heading (number, date, type, name or description)
2. An arrow indicates the current sort direction (ascending or descending)
3. Clicking the same column again reverses the sort direction

### Create an AI summary

1. Click the "Summary" button in the toolbar
2. The AI automatically analyses all log entries and generates a summary of the entire operation

### Export as CSV

1. Click the download button in the toolbar
2. The CSV file with all log entries is downloaded

### Edit or delete an entry

1. Click the edit icon next to the desired entry to change it
2. Click the delete icon to remove an entry

:::info
Tip: Vehicle timestamps (alert, arrival, departure) are generated automatically as log entries. You do not need to create them manually.
:::

These automatic entries are not stored on their own but derived from the times of the vehicle or unit. Their edit icon therefore opens the vehicle's or unit's dialog: change alert, arrival, departure or strength there and the entry follows. Clearing the time removes the entry. There is no delete icon here – it would delete the whole vehicle.
