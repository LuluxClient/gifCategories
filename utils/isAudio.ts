/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getUrlExtension } from "./getUrlExtension";

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "aac", "m4a", "wma", "flac"];

export function isAudio(url: string): boolean {
    const extension = getUrlExtension(url);
    return Boolean(extension && AUDIO_EXTENSIONS.includes(extension));
}
