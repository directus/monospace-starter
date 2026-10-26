# ReUI provenance

- Source: https://github.com/keenthemes/reui (the data grid, filters, and cascader, Base UI variant)
- License: MIT (`LICENSE`)
- Installed at: `apps/web/src/components/reui/` (`data-grid/`, `filters/`, `cascader/`)
- Status: maintained here, not synced with upstream. It has diverged on purpose, so don't pull upstream updates over it.
- Removed: the advanced filter builder and its drag and drop, filter groups and combinators, validation, the row-state store, the range, multiselect, and boolean operator sets, the non-virtual grid table, the column visibility menu, and the cascader parts nothing used.
- Changed: each filter operator carries the Monospace operator it runs as (`clause` in `filters/filters-operators.tsx`), which `apps/web/src/lib/filters.tsx` looks up. The grid takes monoERP's concrete table type (`DataGridTableInstance`). The code follows the repo's lint rules like the rest of the app.
