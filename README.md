# Crop Expert Data Center v0.3

Canonical data layer for PestiApps and Crop Expert.

## Baseline
- Source: `pesticide_database_cleaned_2026-10-04-no-TC(1).json`
- Source records: 1084
- Clean records: 1062
- Canonical pesticide/product records: 1058
- Canonical solid fertilizer records: 4

## Rules
- Data Center is canonical source.
- No legacy PestiApps/Crop Expert data is deleted in this phase.
- No Bayer/internal data is included.
- Solid fertilizers only go to `data/products/pupuk.json`.
- Liquid biostimulants/PGR/etc remain in product database unless explicitly reclassified.
- OPT/crop master datasets are placeholders until exact current app datasets are migrated.

## Integration order
1. Validate Data Center.
2. Push to StratoArt/Data-Manager.
3. Add read-only adapter to PestiApps.
4. Add DataService adapter to Crop Expert.
5. Compare output against legacy data.
6. Switch canonical source.
7. Only then retire duplicate legacy datasets.
