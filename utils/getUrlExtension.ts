/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function getUrlExtension(url: string): string | undefined {
    let u = url;
    // Tenor CDN URLs sometimes omit scheme
    if (!u.startsWith("https:")) u = `https:${u}`;
    try {
        return new URL(u).pathname.split(".").pop();
    } catch {
        return undefined;
    }
}
