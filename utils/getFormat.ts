/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Format } from "../types";
import { getUrlExtension } from "./getUrlExtension";

const VIDEO_EXTENSIONS = ["mp4", "ogg", "webm", "avi", "wmv", "flv", "mov", "mkv", "m4v"];

export function getFormat(url: string): Format {
    const extension = getUrlExtension(url);
    return url.startsWith("https://media.tenor") || extension == null || VIDEO_EXTENSIONS.includes(extension)
        ? Format.VIDEO
        : Format.IMAGE;
}
