/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { DEFAULT_EMPTY_COLLECTION_IMAGE } from "./constants";
import { ExportCollectionsButton, ImportCollectionsButton } from "./settingsComponents";

export const settings = definePluginSettings({
    defaultEmptyCollectionImage: {
        description: "Image/GIF thumbnail shown when a folder has no GIFs yet",
        type: OptionType.STRING,
        default: DEFAULT_EMPTY_COLLECTION_IMAGE,
    },
    importGifs: {
        type: OptionType.COMPONENT,
        description: "Import collections from a backup JSON file (overwrites current data)",
        component: ImportCollectionsButton,
    },
    exportGifs: {
        type: OptionType.COMPONENT,
        description: "Export collections to JSON",
        component: ExportCollectionsButton,
    },
});
