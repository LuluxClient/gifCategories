/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { showToast } from "@webpack/common";

import * as CollectionManager from "../CollectionManager";
import { DATA_COLLECTION_NAME } from "../constants";

export async function downloadCollections(): Promise<void> {
    const filename = "gif-collections.json";
    const exportData = await exportCollections();
    const data = new TextEncoder().encode(exportData);

    if (IS_DISCORD_DESKTOP) {
        DiscordNative.fileManager.saveWithDialog(data, filename);
    } else {
        const file = new File([data], filename, { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        setImmediate(() => {
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        });
    }
}

export async function exportCollections(): Promise<string> {
    const collections = await CollectionManager.getCollections();
    return JSON.stringify({ collections }, null, 4);
}

export async function importCollections(data: string): Promise<void> {
    let parsed: unknown;

    try {
        parsed = JSON.parse(data);
    } catch (err) {
        console.log(data);
        throw new Error("Failed to parse JSON: " + String(err));
    }

    const obj = parsed as { collections?: unknown };
    if (obj.collections != null && Array.isArray(obj.collections)) {
        await DataStore.set(DATA_COLLECTION_NAME, obj.collections);
        await CollectionManager.refreshCacheCollection();
    } else
        throw new Error("Invalid Collections");
}

export async function uploadGifCollections(showToast = true): Promise<void> {
    if (IS_DISCORD_DESKTOP) {
        const [file] = await DiscordNative.fileManager.openFiles({
            filters: [
                { name: "Gif Collections", extensions: ["json"] },
                { name: "all", extensions: ["*"] },
            ],
        });

        if (file) {
            try {
                await importCollections(new TextDecoder().decode(file.data));
                if (showToast) toastSuccess();
            } catch (err) {
                console.error(err);
                if (showToast) toastFailure(err);
            }
        }
    } else {
        const input = document.createElement("input");
        input.type = "file";
        input.style.display = "none";
        input.accept = "application/json";
        input.onchange = async () => {
            const selected = input.files?.[0];
            if (!selected) return;

            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    await importCollections(reader.result as string);
                    if (showToast) toastSuccess();
                } catch (err) {
                    console.error(err);
                    if (showToast) toastFailure(err);
                }
            };
            reader.readAsText(selected);
        };

        document.body.appendChild(input);
        input.click();
        setImmediate(() => document.body.removeChild(input));
    }
}

function toastSuccess() {
    showToast({ text: "Collections imported successfully.", variant: "success" });
}

function toastFailure(err: unknown) {
    showToast({ text: `Failed to import collections: ${String(err)}`, variant: "critical" });
}
