/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI } from "@webpack/common";

import type { Gif } from "../types";
import { cleanUrl } from "./cleanUrl";
import { getUpdatedGifCdnUrl, getUpdatedGifProxyCdnUrl } from "./getUpdatedGifCdnUrl";

const DISCORD_CDN_HOSTS = new Set(["media.discordapp.net", "cdn.discordapp.com"]);

const refreshCache = new Map<string, string>();
const inFlightBatches = new Map<string, Promise<Map<string, string>>>();

export function isDiscordCdn(url: string): boolean {
    try {
        return DISCORD_CDN_HOSTS.has(new URL(url).host);
    } catch {
        return false;
    }
}

export function isExpired(url: string): boolean {
    if (!isDiscordCdn(url)) return false;

    try {
        const urlObject = new URL(url);
        const ex = urlObject.searchParams.get("ex");
        const hm = urlObject.searchParams.get("hm");
        if (!ex || !hm) return true;

        const expiryMs = parseInt(ex, 16) * 1000;
        return Number.isNaN(expiryMs) || expiryMs <= Date.now();
    } catch {
        return true;
    }
}

export function getCachedRefresh(url: string): string | undefined {
    return refreshCache.get(cleanUrl(url));
}

function resolveFromFavorites(url: string, favorites: readonly Gif[], forProxy: boolean): string {
    return forProxy
        ? getUpdatedGifProxyCdnUrl(url, favorites)
        : getUpdatedGifCdnUrl(url, favorites);
}

/** favorites match -> cached refresh -> stored url */
export function resolveUrl(url: string, favorites: readonly Gif[], forProxy = false): string {
    const fromFavorites = resolveFromFavorites(url, favorites, forProxy);
    if (!isExpired(fromFavorites)) return fromFavorites;

    const cached = getCachedRefresh(url);
    if (cached) return cached;

    return url;
}

/** True when a Discord CDN url is stale and not already covered by favorites or cache. */
export function needsRefresh(url: string, favorites: readonly Gif[], forProxy = false): boolean {
    if (getCachedRefresh(url)) return false;

    const fromFavorites = resolveFromFavorites(url, favorites, forProxy);
    if (!isExpired(fromFavorites)) return false;

    return isDiscordCdn(url);
}

async function fetchRefreshBatch(urls: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    try {
        const { body } = await RestAPI.post({
            url: "/attachments/refresh-urls",
            body: { attachment_urls: urls },
        });

        const refreshed = (body as { refreshed_urls?: { original: string; refreshed: string; }[]; })?.refreshed_urls ?? [];
        for (const entry of refreshed) {
            const key = cleanUrl(entry.original);
            result.set(key, entry.refreshed);
            refreshCache.set(key, entry.refreshed);
        }
    } catch (err) {
        console.warn("gifCategories: failed to refresh Discord URLs", err);
    }

    return result;
}

/** Batch-refresh stale Discord CDN urls; dedupes via cache and in-flight batch keys. */
export async function refreshUrls(urls: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uncached: string[] = [];

    for (const url of urls) {
        const key = cleanUrl(url);
        const cached = refreshCache.get(key);
        if (cached) {
            result.set(key, cached);
            continue;
        }

        if (!uncached.some(candidate => cleanUrl(candidate) === key))
            uncached.push(url);
    }

    if (uncached.length === 0) return result;

    const batchKey = uncached.map(cleanUrl).sort().join("|");
    let batch = inFlightBatches.get(batchKey);
    if (!batch) {
        batch = fetchRefreshBatch(uncached).finally(() => inFlightBatches.delete(batchKey));
        inFlightBatches.set(batchKey, batch);
    }

    const fetched = await batch;
    for (const [key, value] of fetched)
        result.set(key, value);

    return result;
}
