# Implementation Plan: Computed Fields

## Step 1: Install mathjs + create compute utility

- `npm install mathjs`
- Create `src/common/computeFieldValue.ts`:
  - `evaluateFormula(formula: string, fieldData: Record<string, string | number | boolean>, schema: DataSchemaField[]): number | undefined`
  - Replaces field keys with values from fieldData, evaluates with mathjs
  - Returns undefined if required fields are missing
  - `computeAllFields(fieldData, schema): Record<string, number>` - computes all computed fields
- Create `src/common/computeFieldValue.test.ts` with tests

## Step 2: Extend DataSchemaField type

- In `src/components/firebase/firestore.ts`:
  - Add `'computed'` to `DataSchemaField.type` union
  - Add optional `formula?: string` to `DataSchemaField`

## Step 3: Update DataSchemaEditor UI

- In `src/components/FirecallItems/DataSchemaEditor.tsx`:
  - Add 'computed' to type dropdown options
  - When type='computed': show formula input field instead of defaultValue
  - Show helper text listing available field keys from the same schema

## Step 4: Update ItemDataFields UI

- In `src/components/FirecallItems/ItemDataFields.tsx`:
  - Computed fields rendered as read-only (disabled TextField)
  - Show computed value from fieldData
  - Visual indicator (e.g., calculator icon or "berechnet" label)

## Step 5: Integrate computation in item save hooks

- In `src/hooks/useFirecallItemAdd.ts`:
  - After preparing item data, compute all computed fields using layer schema
  - Merge computed values into fieldData before saving

- In `src/hooks/useFirecallItemUpdate.ts`:
  - After preparing update data, recompute computed fields
  - When updating a layer's dataSchema (formula change): batch-recalculate all items in that layer

## Step 6: Run checks

- `npm run check` to verify everything compiles, lints, and tests pass
