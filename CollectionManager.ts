/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Toasts } from "@webpack/common";

import { DATA_COLLECTION_NAME, GIF_COLLECTION_PREFIX } from "./constants";
import { Collection, Gif } from "./types";
import { getFormat } from "./utils/getFormat";

export let cache_collections: Collection[] = [];

async function emptyPlaceholderThumb(): Promise<string> {
    const { settings } = await import("./settings");
    return settings.store.defaultEmptyCollectionImage;
}

export async function getCollections(): Promise<Collection[]> {
    return ((await DataStore.get<Collection[]>(DATA_COLLECTION_NAME)) ?? []) as Collection[];
}

export async function getCollection(name: string): Promise<Collection | undefined> {
    const collections = await getCollections();
    return collections.find(c => c.name === name);
}

export function getCachedCollection(name: string): Collection | undefined {
    return cache_collections.find(c => c.name === name);
}

export async function createCollection(name: string, gifs: Gif[]): Promise<void> {
    const collections = await getCollections();
    const duplicateCollection = collections.find(c => c.name === `${GIF_COLLECTION_PREFIX}${name}`);
    if (duplicateCollection) {
        Toasts.show({
            message: "That collection already exists",
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: {
                duration: 3000,
                position: Toasts.Position.BOTTOM,
            },
        });
        return;
    }

    const fallback = await emptyPlaceholderThumb();
    const latestGifSrc = gifs[gifs.length - 1]?.src ?? fallback;
    const collection: Collection = {
        name: `${GIF_COLLECTION_PREFIX}${name}`,
        src: latestGifSrc,
        format: getFormat(latestGifSrc),
        type: "Category",
        gifs,
    };

    await DataStore.set(DATA_COLLECTION_NAME, [...collections, collection]);
    await refreshCacheCollection();
}

export async function addToCollection(collectionName: string, gif: Gif): Promise<void> {
    const collections = await getCollections();
    const collectionIndex = collections.findIndex(c => c.name === collectionName);
    if (collectionIndex === -1) {
        console.warn("gifCategories: collection not found");
        return;
    }

    collections[collectionIndex]!.gifs.push(gif);
    collections[collectionIndex]!.src = gif.src;
    collections[collectionIndex]!.format = getFormat(gif.src);

    await DataStore.set(DATA_COLLECTION_NAME, collections);
    await refreshCacheCollection();
}

export async function removeFromCollection(id: string): Promise<void> {
    const collections = await getCollections();
    const collectionIndex = collections.findIndex(c => c.gifs.some(g => g.id === id));
    if (collectionIndex === -1) {
        console.warn("gifCategories: collection not found");
        return;
    }

    const col = collections[collectionIndex]!;
    col.gifs = col.gifs.filter(g => g.id !== id);

    const fallback = await emptyPlaceholderThumb();
    const latestGifSrc = col.gifs.length ? col.gifs[col.gifs.length - 1]!.src : fallback;
    col.src = latestGifSrc;
    col.format = getFormat(latestGifSrc);

    await DataStore.set(DATA_COLLECTION_NAME, collections);
    await refreshCacheCollection();
}

/** Moves a GIF from whatever folder currently holds it to `toName` (stored `gc:` id). */
export async function moveToCollection(gifId: string, toName: string): Promise<void> {
    const collections = await getCollections();

    const fromIndex = collections.findIndex(c => c.gifs.some(g => g.id === gifId));
    if (fromIndex === -1) {
        console.warn("gifCategories: moveToCollection — gif not found");
        return;
    }

    const toIndex = collections.findIndex(c => c.name === toName);
    if (toIndex === -1) {
        console.warn("gifCategories: moveToCollection — destination not found");
        return;
    }

    if (fromIndex === toIndex) return;

    const gif = collections[fromIndex]!.gifs.find(g => g.id === gifId)!;

    // Remove from source
    const fromCol = collections[fromIndex]!;
    fromCol.gifs = fromCol.gifs.filter(g => g.id !== gifId);
    const fallback = await emptyPlaceholderThumb();
    const latestFromSrc = fromCol.gifs.length ? fromCol.gifs[fromCol.gifs.length - 1]!.src : fallback;
    fromCol.src = latestFromSrc;
    fromCol.format = getFormat(latestFromSrc);

    // Add to destination
    const toCol = collections[toIndex]!;
    toCol.gifs.push(gif);
    toCol.src = gif.src;
    toCol.format = getFormat(gif.src);

    await DataStore.set(DATA_COLLECTION_NAME, collections);
    await refreshCacheCollection();
}

export async function deleteCollection(name: string): Promise<void> {
    const collections = await getCollections();
    const next = collections.filter(c => c.name !== name);
    await DataStore.set(DATA_COLLECTION_NAME, next);
    await refreshCacheCollection();
}

/** `oldFullName` / `newFullName` use stored ids, e.g. `gc:MyFolder`. */
export async function renameCollection(oldFullName: string, newDisplayName: string): Promise<boolean> {
    const trimmed = newDisplayName.trim();
    if (!trimmed) {
        Toasts.show({
            message: "Folder name can't be empty",
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: { duration: 3000, position: Toasts.Position.BOTTOM },
        });
        return false;
    }

    const withoutDuplicatePrefix = trimmed.startsWith(GIF_COLLECTION_PREFIX)
        ? trimmed.slice(GIF_COLLECTION_PREFIX.length)
        : trimmed;

    const newFullName = `${GIF_COLLECTION_PREFIX}${withoutDuplicatePrefix}`;

    if (newFullName === oldFullName) {
        await refreshCacheCollection();
        return true;
    }

    const collections = await getCollections();

    if (collections.some(c => c.name === newFullName)) {
        Toasts.show({
            message: "A folder with that name already exists",
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: { duration: 3000, position: Toasts.Position.BOTTOM },
        });
        return false;
    }

    const idx = collections.findIndex(c => c.name === oldFullName);
    if (idx === -1) {
        console.warn("gifCategories: renameCollection — folder not found");
        return false;
    }

    const col = collections[idx]!;
    collections[idx] = { ...col, name: newFullName };

    await DataStore.set(DATA_COLLECTION_NAME, collections);
    await refreshCacheCollection();
    return true;
}

export async function refreshCacheCollection(): Promise<void> {
    cache_collections = await getCollections();
}

export async function updateGifUrls(updates: { id: string; src: string; url: string; }[]): Promise<void> {
    if (!updates.length) return;

    const collections = await getCollections();
    let changed = false;

    for (const update of updates) {
        for (const col of collections) {
            const gif = col.gifs.find(g => g.id === update.id);
            if (!gif) continue;

            const oldSrc = gif.src;
            if (gif.src === update.src && gif.url === update.url) continue;

            gif.src = update.src;
            gif.url = update.url;
            changed = true;

            if (col.src === oldSrc) {
                col.src = update.src;
                col.format = getFormat(update.src);
            }
        }
    }

    if (changed) {
        await DataStore.set(DATA_COLLECTION_NAME, collections);
        await refreshCacheCollection();
    }
}

export async function updateCollectionSrc(name: string, src: string): Promise<void> {
    const collections = await getCollections();
    const col = collections.find(c => c.name === name);
    if (!col || col.src === src) return;

    col.src = src;
    col.format = getFormat(src);
    await DataStore.set(DATA_COLLECTION_NAME, collections);
    await refreshCacheCollection();
}
