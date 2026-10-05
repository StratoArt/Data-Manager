# Crop Expert Data Center v0.5 — OPT + Icon System

Canonical Data Manager upgrade based on the supplied PestiApps source snapshot.

## Migrated exact datasets
- Hama: 69
- Penyakit: 66
- Gulma: 16
- Crop: 30
- Crop ↔ OPT: explicit relations from `data/opt.json` → `crops[].related_opt`

## Icon system
- Canonical registry: `assets/icon-registry.json`
- PestiApps OPT SVG assets synchronized under `assets/icons/opt/`
- Crop icons under `assets/icons/crops/`
- Reusable UI icons under `assets/icons/ui/`
- `assets/icon-replacer.js` can replace legacy emoji icons at runtime without changing source data.

## Safety / provenance
- No Bayer/internal data added.
- Source records are preserved; this migration does not silently invent OPT records.
- Existing pesticide/product datasets remain preserved.
- Solid fertilizer rule remains unchanged.
