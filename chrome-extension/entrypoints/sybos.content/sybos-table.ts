export interface SybosPerson {
  id: string;
  name: string;
  checkbox: HTMLInputElement;
}

/**
 * Parse the SYBOS personnel table from the given root DOM.
 * Finds all hidden inputs with name pattern name_tbl[deleted[ID]]
 * and pairs them with their corresponding checkboxes.
 */
export function parseSybosPersonTable(
  root: ParentNode = document
): SybosPerson[] {
  const nameInputs = root.querySelectorAll<HTMLInputElement>(
    'input[type="hidden"][name^="name_tbl[deleted["]'
  );

  const persons: SybosPerson[] = [];

  for (const nameInput of nameInputs) {
    const name = nameInput.value;
    if (name === '{GEbez}') continue; // vehicle-list placeholder, not a person
    const match = nameInput.name.match(/name_tbl\[deleted\[(\d+)\]\]/);
    if (!match) continue;

    const id = match[1];
    if (!id) continue;

    const checkbox = root.querySelector<HTMLInputElement>(
      `input[type="checkbox"][name="selected[${id}]"]`
    );
    if (!checkbox) continue;

    persons.push({ id, name, checkbox });
  }

  return persons;
}

/**
 * Check if the given root contains a SYBOS personnel table.
 */
export function hasSybosPersonTable(root: ParentNode = document): boolean {
  return parseSybosPersonTable(root).length > 0;
}
