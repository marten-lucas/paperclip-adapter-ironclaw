export interface AdapterModelOption {
  id: string;
  label: string;
}

// Keep at least one model visible in adapter metadata so UI does not show 0 models
// before first successful live discovery.
export const adapterModels: AdapterModelOption[] = [
  { id: "default", label: "default" },
];

export function refreshAdapterModels(modelIds: string[]): void {
  const normalized = Array.from(
    new Set(
      modelIds
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );

  if (normalized.length === 0) {
    return;
  }

  adapterModels.splice(
    0,
    adapterModels.length,
    ...normalized.map((id) => ({ id, label: id })),
  );
}
