/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Stored collection names use this prefix so they double as GIF picker queries.
 */
export const GIF_COLLECTION_PREFIX = "gc:";

/**
 * Prefix baked into gif ids tracked inside collections so we can distinguish them from native favorites.
 */
export const GIF_ITEM_PREFIX = "gc-moment:";

export const DATA_COLLECTION_NAME = "gif-collections-collections";

/** Default thumbnail when a folder has no gifs yet. */
export const DEFAULT_EMPTY_COLLECTION_IMAGE = "https://i.imgur.com/TFatP8r.png";
