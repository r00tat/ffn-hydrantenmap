# Cost recovery

Create and manage cost recovery (Kostenersatz) invoices for operations according to the tariff ordinance.

![Cost recovery](/docs-assets/screenshots/kostenersatz.png)

## Features

- Create invoices
- Add line items (vehicles, material, personnel)
- Export invoices as PDF

## Instructions

### Create a new invoice

1. Open the cost recovery section of the operation
2. Click "New calculation"
3. The calculation has three tabs: Operation, Calculation and Recipient

### Use a template

To save time you can load a stored template:

1. Click "Load template" at the top right
2. Pick an existing template from the list
3. Vehicles and line items are imported automatically
4. Adjust hours or units as needed

You can also save your current calculation as a template by clicking "Save as template".

:::info
Tip: Templates are especially useful for recurring operation types (e.g. fire watch). Save a template once and load it for similar operations.
:::

### Add line items

You add the individual line items in the "Calculation" tab:

![Cost recovery calculation tab](/docs-assets/screenshots/kostenersatz-berechnung.png)

- **Add vehicles quickly** At the top of the panel you can select vehicles with one click – the matching tariffs are added automatically
- **Browse categories** Open the categories (vehicles, personnel, material, etc.) and enter the number of units
- **Other line items** For costs that are not part of the tariff click "Add line item" in category 12

### Calculation

Costs are calculated automatically:

- **Hours × units × tariff** For most line items: number of hours times number of units times hourly rate
- **Flat rates** Some line items have a flat rate for the first hours, then the hourly rate applies
- **Total** The total is shown at the bottom and updates automatically

:::info
Tip: The PDF invoice is formatted according to the municipality's current tariff ordinance and contains all line items with their individual prices.
:::

### Enter the recipient

In the "Recipient" tab you enter the billing address:

1. Recipient name (required)
2. Address (street, postcode, city)
3. Email address (required for sending by email)

### Send the invoice by email

You can send the invoice directly by email:

1. Make sure an email address is entered for the recipient
2. Click "Email"
3. The email opens with a pre-filled text (from the template)
4. Adjust subject and body as needed
5. Optionally add CC recipients
6. Click "Send"

The PDF invoice is added automatically as an attachment.

Sending closes the calculation; its status is then **Sent and completed**. You
can send it again at any time. If you change the recipient address in the
dialog, the new address is saved with the recipient.

In the "Recipient" tab, **Dispatch** lists when and to whom the invoice was
sent, including CC recipients and who sent it. This also shows how often it has
been sent.

### Save and close

- **Save** Stores the calculation as a draft – you can keep editing it later
- **Close** Finalises the calculation – no further changes are possible afterwards
- **Copy** For finalised calculations you can create a copy to make changes

## Permissions

Cost recovery applies **per fire brigade**: you only see and edit the cost
recovery of an operation if you hold the **cost recovery** role in the
operation's brigade. The same applies to billing cylinder fillings and to the
email templates.

- **Assigning the role** Administrators; group admins who hold the cost
  recovery role themselves — in the "Members and roles" view of the brigade
- **Being group admin is not enough** Whoever issues invoices gets that
  assigned explicitly
- **Operation guests** see no cost recovery, even if they may edit the
  operation
- **Without the role** the calculations are also left out of the operation
  export, the backup and the Sybos transfer
