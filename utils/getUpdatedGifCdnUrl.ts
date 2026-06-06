/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Gif } from "../types";
import { cleanUrl } from "./cleanUrl";

/** Refresh stale saved proxy/cdn URLs by matching current favorites entries by normalized URL. */
export function getUpdatedGifCdnUrl(url: string, favoritesList: readonly Gif[]): string {
    const cleanedCandidate = cleanUrl(url);

    for (const gif of favoritesList) {
        if (cleanUrl(gif.src) === cleanedCandidate)
            return gif.src;
    }

    return url;
}

/** Same strategy as getUpdatedGifCdnUrl, but for canonical/original gif URLs. */
export function getUpdatedGifProxyCdnUrl(url: string, favoritesList: readonly Gif[]): string {
    const cleanedCandidate = cleanUrl(url);

    for (const gif of favoritesList) {
        if (cleanUrl(gif.url) === cleanedCandidate)
            return gif.url;
    }

    return url;
}
