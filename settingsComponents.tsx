/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Alerts, Button } from "@webpack/common";

import * as CollectionManager from "./CollectionManager";
import { downloadCollections, uploadGifCollections } from "./utils/settingsUtils";

export function ImportCollectionsButton() {
    return (
        <ErrorBoundary noop>
            <Button
                onClick={async () =>
                    (await CollectionManager.getCollections()).length
                        ? Alerts.show({
                            title: "Are you sure?",
                            body: "Importing collections will overwrite your current collections.",
                            confirmText: "Import",
                            confirmColor: Button.Colors.RED,
                            cancelText: "Nevermind",
                            onConfirm: async () => uploadGifCollections(),
                        })
                        : uploadGifCollections()
                }
            >
                Import Collections
            </Button>
        </ErrorBoundary>
    );
}

export function ExportCollectionsButton() {
    return (
        <ErrorBoundary noop>
            <Button onClick={() => downloadCollections()}>Export Collections</Button>
        </ErrorBoundary>
    );
}
