/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageStore, SnowflakeUtils } from "@webpack/common";
import { Message } from "discord-types/general";

import { Gif } from "../types";
import { cleanUrl } from "./cleanUrl";
import { isAudio } from "./isAudio";
import { uuidv4 } from "./uuidv4";

export function getGifByTarget(url: string, target?: HTMLDivElement | null): Gif | null {
    const liElement = target?.closest("li");
    if (!target || !liElement || !liElement.id) return null;

    const [channelId, messageId] = liElement.id.split("-").slice(2);
    if (!channelId || !messageId || !isValidSnowflake(channelId) || !isValidSnowflake(messageId)) return null;

    const message = MessageStore.getMessage(channelId, messageId);
    if (!message || (!message.embeds.length && !message.attachments.length)) return null;

    return getGifByMessageAndUrl(url, message);
}

export function getGifByMessageAndTarget(target: HTMLDivElement, message: Message): Gif | null {
    const url =
        target.closest('[class^="imageWrapper"]')?.querySelector("video")?.src ??
        target.closest('[class^="imageWrapper"]')?.querySelector("img")?.src;

    if (!url) return null;

    return getGifByMessageAndUrl(url, message);
}

export function getGifByMessageAndUrl(url: string, message: Message): Gif | null {
    if (!message.embeds.length && !message.attachments.length || isAudio(url))
        return null;

    const cleanedUrl = cleanUrl(url);

    const embed = message.embeds.find(e => {
        const hasMatchingUrl = e.url && cleanUrl(e.url) === cleanedUrl;
        const hasMatchingImage = e.image && cleanUrl(e.image.url) === cleanedUrl;
        const hasMatchingImageProxy = e.image?.proxyURL === cleanedUrl;
        const hasMatchingVideoProxy = e.video?.proxyURL === cleanedUrl;
        const hasMatchingThumbnailProxy = e.thumbnail?.proxyURL === cleanedUrl;

        return (
            Boolean(hasMatchingUrl) ||
            Boolean(hasMatchingImage) ||
            Boolean(hasMatchingImageProxy) ||
            Boolean(hasMatchingVideoProxy) ||
            Boolean(hasMatchingThumbnailProxy)
        );
    });
    if (embed) {
        if (embed.image)
            return {
                id: uuidv4(),
                height: embed.image.height,
                width: embed.image.width,
                src: embed.image.proxyURL ?? embed.image.url,
                url: embed.image.url,
            };

        if (embed.video?.proxyURL) {
            const videoUrl =
                embed.provider?.name === "Tenor"
                    ? (embed.url ?? embed.video.url)
                    : embed.video.url;

            return {
                id: uuidv4(),
                height: embed.video.height,
                width: embed.video.width,
                src: embed.video.proxyURL,
                url: videoUrl ?? "",
            };
        }

        if (embed.thumbnail?.proxyURL)
            return {
                id: uuidv4(),
                height: embed.thumbnail.height,
                width: embed.thumbnail.width,
                src: embed.thumbnail.proxyURL,
                url: embed.thumbnail.url,
            };
    }

    const attachment = message.attachments.find(a => cleanUrl(a.url) === cleanedUrl || a.proxy_url === cleanedUrl);
    if (attachment)
        return {
            id: uuidv4(),
            height: attachment.height ?? 50,
            width: attachment.width ?? 50,
            src: attachment.proxy_url,
            url: attachment.url,
        };

    return null;
}

export function getGif(
    message: Message | null | undefined,
    url: string | null | undefined,
    target: HTMLDivElement | null | undefined,
): Gif | null | undefined {
    if (message && url) {
        const gif = getGifByMessageAndUrl(url, message);
        if (!gif) return null;

        return gif;
    }

    if (message && target && !url) {
        const gif = getGifByMessageAndTarget(target, message);
        if (!gif) return null;

        return gif;
    }

    if (url && target && !message) {
        const fixedUrl =
            url.startsWith("https://discord.com/")
                ? (target.parentElement?.querySelector("img")?.src ?? url)
                : url;

        const gif = getGifByTarget(fixedUrl, target);
        if (!gif) return null;

        return gif;
    }

    return undefined;
}

function isValidSnowflake(snowflake: string): boolean {
    return !Number.isNaN(SnowflakeUtils.extractTimestamp(snowflake));
}
