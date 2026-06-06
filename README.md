# GifCategories (UserPlugin)

Organize GIFs into custom **folders/categories** in Discord’s GIF picker. Folder tiles show **your chosen name**; internally each folder still uses a `gc:` id so searches route correctly. Right‑click GIFs to add them to a folder, or manage folders from inside the picker.

Originally based on **[vc-gif-collections](https://github.com/Syncxv/vc-gif-collections)** by Syncxv, updated for modern Vencord.

## Requirements

1. **[Build Vencord from source](https://docs.vencord.dev/installing)** (`pnpm`; use `pnpm install`, not npm).
2. Plugin path: [`src/userplugins/gifCategories/`](./) (camelCase folder, see [creating plugins](https://docs.vencord.dev/plugins/)).

## Build & inject

From the Vencord repo root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm inject   # pick Discord / Vesktop in the installer
```

Restart Discord → **Plugins** → enable **GifCategories**.

If `pnpm` is missing from PATH: `corepack prepare pnpm@latest --activate` or `npx pnpm …`.

## Usage

- **Messages:** right‑click an image/GIF → **Add to folder…** → existing folder or **Create new folder…**.
- **GIF picker:** custom folders appear with trending tiles (labels match what you typed—no `gc:` prefix).
- **Right‑click a folder tile** → rename or delete. **Right‑click a GIF in a folder** → remove.

If your GIF search text **exactly matches** a folder name (ignoring capitalization), that query opens the folder instead of Tenor — click “Trending” or change the wording if you meant a Tenor search.

## Backup

Enable **Export collections** / **Import collections** in the plugin settings. Import overwrites stored data unless you cancel the confirmation prompt.

Uses the same `DATA_STORE` key and `gc:` naming as vc-gif-collections, so backups are interchangeable.

## Author

Set `authors` on **`definePlugin(...)`** in [`index.tsx`](./index.tsx): `name`, numeric `id` as a BigInt (e.g. `123…n`), or `0n` for anonymous.

## Troubleshooting patches

Patches use regex on **minified** Discord bundles (`renderCategoryExtras`, `renderEmptyFavorite`, `renderHeaderContent()`, `GIF_PICKER_QUERY`). If Discord updates, Vencord may toast that a patch failed:

1. Open DevTools (**Ctrl+Shift+I**), search Sources for the **`find:`** string.
2. Adjust the **`match`** in `index.tsx` and rebuild with `pnpm build`.

If conflicts appear with **FavoriteGifSearch**, try disabling other GIF‑picker tweaks while testing.
