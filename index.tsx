/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Alerts, ContextMenuApi, FluxDispatcher, Menu, Modal, openModal, React, TextInput, useState } from "@webpack/common";

import * as CollectionManager from "./CollectionManager";
import { GIF_COLLECTION_PREFIX, GIF_ITEM_PREFIX } from "./constants";
import { settings } from "./settings";
import type { Category, Collection, Gif, Props } from "./types";
import { cleanUrl } from "./utils/cleanUrl";
import { getFormat } from "./utils/getFormat";
import { getGif } from "./utils/getGif";
import { needsRefresh, refreshUrls, resolveUrl } from "./utils/refreshDiscordUrls";
import { uuidv4 } from "./utils/uuidv4";

/** Stored ids use `gc:`; picker tiles only show the user-chosen suffix. Query is re-canonicalized in `normalizeGifPickerQuery`. */
function folderDisplayName(fullName: string) {
    return fullName.startsWith(GIF_COLLECTION_PREFIX)
        ? fullName.slice(GIF_COLLECTION_PREFIX.length)
        : fullName;
}

/** Discord often sends uppercased / normalized GIF search queries; folders must match case-insensitively. */
function displayNameMatchesQuery(folderGcName: string, queryOrLabel: string): boolean {
    const disp = folderDisplayName(folderGcName).trim().normalize("NFKC");
    const q = queryOrLabel.trim().normalize("NFKC");
    return disp.localeCompare(q, undefined, { sensitivity: "base" }) === 0;
}

/** Tile `name` is display-only; map back to persisted `gc:…` id for context menus and storage. */
function resolveGcFolderId(label: string | undefined): string | undefined {
    if (!label) return;
    if (label.startsWith(GIF_COLLECTION_PREFIX)) return label;
    const hit = CollectionManager.cache_collections.find(c => displayNameMatchesQuery(c.name, label));
    return hit?.name;
}

const addCollectionContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props) return;

    const { message, itemSrc, itemHref, target } = props;

    const gif = getGif(message, itemSrc ?? itemHref, target);

    if (!gif) return;

    const group = findGroupChildrenByChildId("open-native-link", children) ?? findGroupChildrenByChildId("copy-link", children);
    if (group && !group.some(child => child?.props?.id === "add-to-collection"))
        // Call the function instead of `<MenuThingy />`: Discord's Menu API only accepts MenuItem elements, not wrapper component types.
        group.push(MenuThingy({ gif }));
};

export default definePlugin({
    name: "GifCategories",
    description:
        "Create folders inside the GIF picker to organize GIF collections alongside Discord favorites.",
    authors: [{
        name: "xdLulux",
        id: 0n,
    }],
    tags: ["Media", "Customisation"],

    patches: [
        /**
         * renderCategoryExtras: inject folder tiles beside Discord's trending row.
         * Labels use display-only names from insertCollections (no hidePrefix webpack hooks).
         */
        {
            find: "renderCategoryExtras",
            replacement: [{
                match: /(render\(\){)(.{1,50}getItemGrid)/,
                replace: "$1;$self.insertCollections(this);$2",
            }],
        },

        /** renderEmptyFavorite: right‑click on favorites thumbnails / folders for management menus. */
        {
            find: "renderEmptyFavorite",
            replacement: {
                match: /render\(\){.{1,500}onClick:this\.handleClick,/,
                replace: "$&onContextMenu:(e)=>$self.collectionContextMenu(e,this),",
            },
        },

        /**
         * renderHeaderContent: swaps result previews when browsing a gc:folder query inside the GIF picker grid.
         */
        {
            find: "renderHeaderContent()",
            replacement: [{
                match: /(renderContent\(\){)(.{1,50}resultItems)/,
                replace: "$1$self.renderContent(this);$2",
            }],
        },

        /*
         Short-circuit the Tenor/API fetch when the query is already a gc: folder id.
         Normalization from display name → gc: id is handled by the FluxDispatcher interceptor in start().
        */
        {
            find: "type:\"GIF_PICKER_QUERY\"",
            replacement: {
                match: /(function \i\(.{1,10}\){)(.{1,100}\.GIFS_SEARCH,query:)/,
                replace: "$1if($self.shouldStopFetch(arguments[0]))return;$2",
            },
        },
    ],

    settings,

    start() {
        void CollectionManager.refreshCacheCollection();
        addContextMenuPatch("message", addCollectionContextMenuPatch);

        // Use a Flux interceptor instead of patching the minified GIF_PICKER_QUERY handler.
        // The interceptor rewrites "meow" / "MEOW" → "gc:meow" before the action reaches any store or fetch logic.
        this._gifPickerInterceptor = (action: Record<string, unknown>) => {
            if (action.type !== "GIF_PICKER_QUERY") return;
            if (typeof action.query !== "string") return;
            if ((action.query as string).startsWith(GIF_COLLECTION_PREFIX)) return;

            const hit = CollectionManager.cache_collections.find(
                c => displayNameMatchesQuery(c.name, action.query as string)
            );
            if (hit) action.query = hit.name;
        };
        FluxDispatcher._interceptors.push(this._gifPickerInterceptor);
    },

    stop() {
        removeContextMenuPatch("message", addCollectionContextMenuPatch);
        if (this._gifPickerInterceptor) {
            const idx = (FluxDispatcher._interceptors as unknown[]).indexOf(this._gifPickerInterceptor);
            if (idx !== -1) (FluxDispatcher._interceptors as unknown[]).splice(idx, 1);
            this._gifPickerInterceptor = null;
        }
    },

    oldTrendingCat: null as Category[] | null,
    sillyInstance: null as GifPickerShell | null,
    sillyContentInstance: null as GifPickerShell | null,
    _gifPickerInterceptor: null as ((action: Record<string, unknown>) => void) | null,
    _refreshInFlight: false,
    favoritesSnapshot: [] as Gif[],

    get collections(): Collection[] {
        void CollectionManager.refreshCacheCollection();
        return CollectionManager.cache_collections;
    },

    renderContent(instance: GifPickerShell & { props: { query: string; resultItems?: unknown[] } }) {
        if (!instance.props.query.startsWith(GIF_COLLECTION_PREFIX))
            return;

        this.sillyContentInstance = instance;
        this.captureFavoritesSnapshot(instance.props);
        const collection = this.collections.find(c => c.name === instance.props.query);
        if (!collection) return;

        const urlsToRefresh: string[] = [];

        instance.props.resultItems = [...collection.gifs].reverse().map(g => {
            const refreshedSrc = resolveUrl(g.src, this.favoritesSnapshot, false);
            const refreshedUrl = resolveUrl(g.url, this.favoritesSnapshot, true);

            if (needsRefresh(g.src, this.favoritesSnapshot, false))
                urlsToRefresh.push(g.src);
            if (needsRefresh(g.url, this.favoritesSnapshot, true))
                urlsToRefresh.push(g.url);

            return {
                id: g.id,
                format: getFormat(refreshedSrc),
                src: refreshedSrc,
                url: refreshedUrl,
                width: g.width,
                height: g.height,
            };
        });

        this.scheduleUrlRefresh(instance, urlsToRefresh, collection.gifs);
    },

    insertCollections(instance: { props: Props }) {
        try {
            this.sillyInstance = instance as unknown as GifPickerShell;
            this.captureFavoritesSnapshot(instance.props);

            if (instance.props.trendingCategories.length && instance.props.trendingCategories[0]?.type === "Trending")
                this.oldTrendingCat = [...instance.props.trendingCategories];

            if (this.oldTrendingCat != null) {
                const urlsToRefresh: string[] = [];
                const collections = [...this.collections].reverse();

                const folderTiles = collections.map(col => {
                    const refreshedSrc = resolveUrl(col.src, this.favoritesSnapshot, false);

                    if (needsRefresh(col.src, this.favoritesSnapshot, false))
                        urlsToRefresh.push(col.src);

                    return {
                        ...col,
                        src: refreshedSrc,
                        format: getFormat(refreshedSrc),
                        name: folderDisplayName(col.name),
                    };
                });
                instance.props.trendingCategories = folderTiles.concat([...this.oldTrendingCat] as Collection[]);

                this.scheduleUrlRefresh(
                    instance as unknown as GifPickerShell,
                    urlsToRefresh,
                    undefined,
                    collections.map(col => ({ name: col.name, src: col.src })),
                );
            }
        } catch (err) {
            console.error("GifCategories.insertCollections:", err);
        }
    },

    scheduleUrlRefresh(
        instance: GifPickerShell,
        urls: string[],
        gifs?: Gif[],
        collectionCovers?: { name: string; src: string; }[],
    ) {
        if (!urls.length || this._refreshInFlight) return;

        this._refreshInFlight = true;
        void refreshUrls(urls)
            .then(async refreshed => {
                if (refreshed.size === 0) return;

                if (gifs?.length) {
                    const updates = gifs.flatMap(gif => {
                        const newSrc = refreshed.get(cleanUrl(gif.src)) ?? resolveUrl(gif.src, this.favoritesSnapshot, false);
                        const newUrl = refreshed.get(cleanUrl(gif.url)) ?? resolveUrl(gif.url, this.favoritesSnapshot, true);
                        if (newSrc === gif.src && newUrl === gif.url) return [];

                        return [{ id: gif.id, src: newSrc, url: newUrl }];
                    });

                    if (updates.length)
                        await CollectionManager.updateGifUrls(updates);
                }

                if (collectionCovers?.length) {
                    await Promise.all(collectionCovers.map(async cover => {
                        const newSrc = refreshed.get(cleanUrl(cover.src));
                        if (newSrc && newSrc !== cover.src)
                            await CollectionManager.updateCollectionSrc(cover.name, newSrc);
                    }));
                }

                instance.forceUpdate();
            })
            .catch(err => console.warn("gifCategories: scheduleUrlRefresh failed", err))
            .finally(() => {
                this._refreshInFlight = false;
            });
    },

    captureFavoritesSnapshot(props: { favorites?: unknown; favCopy?: unknown; resultItems?: unknown[] }) {
        const candidates = [
            props.favorites,
            props.favCopy,
            props.resultItems,
        ];

        for (const candidate of candidates) {
            if (!Array.isArray(candidate)) continue;

            const mapped = candidate
                .map(item => this.toGif(item))
                .filter((gif): gif is Gif => gif != null);

            if (mapped.length > 0) {
                this.favoritesSnapshot = mapped;
                return;
            }
        }
    },

    toGif(item: unknown): Gif | null {
        if (!item || typeof item !== "object") return null;

        const src = typeof (item as { src?: unknown }).src === "string" ? (item as { src: string }).src : null;
        const url = typeof (item as { url?: unknown }).url === "string" ? (item as { url: string }).url : src;
        if (!src) return null;

        const widthRaw = (item as { width?: unknown }).width;
        const heightRaw = (item as { height?: unknown }).height;

        return {
            id: typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : uuidv4(),
            src,
            url: url ?? src,
            width: typeof widthRaw === "number" ? widthRaw : 50,
            height: typeof heightRaw === "number" ? heightRaw : 50,
        };
    },

    shouldStopFetch(action: unknown) {
        const query =
            typeof action === "string"
                ? action
                : action && typeof action === "object" && "query" in action && typeof (action as { query?: unknown }).query === "string"
                    ? (action as { query: string }).query
                    : "";

        if (query.startsWith(GIF_COLLECTION_PREFIX)) {
            const collection = this.collections.find(c => c.name === query);
            if (collection != null)
                return true;
        }

        return false;
    },

    collectionContextMenu(
        e: React.UIEvent,
        instance: {
            props: {
                focused?: boolean;
                item?: { name?: string; id?: string; src?: string; url?: string; height?: number; width?: number };
            };
            forceUpdate(): void;
        },
    ) {
        const { item } = instance.props;

        const folderFullId = resolveGcFolderId(item?.name);

        if (folderFullId)
            return ContextMenuApi.openContextMenu(e, () =>
                <ErrorBoundary noop>
                    <RemoveItemContextMenu
                        type="collection"
                        nameOrId={folderFullId}
                        onConfirm={() => { this.sillyInstance?.forceUpdate(); }}
                    />
                </ErrorBoundary>,
            );

        if (item?.id?.startsWith(GIF_ITEM_PREFIX)) {
            const gif: Gif = {
                id: item.id,
                src: item.src ?? "",
                url: item.url ?? "",
                height: item.height ?? 50,
                width: item.width ?? 50,
            };
            ContextMenuApi.openContextMenu(e, () =>
                <ErrorBoundary noop>
                    <RemoveItemContextMenu
                        type="gif"
                        gif={gif}
                        nameOrId={item.id!}
                        onConfirm={() => { this.sillyContentInstance?.forceUpdate(); }}
                    />
                </ErrorBoundary>,
            );
            instance.props.focused = false;
            instance.forceUpdate();
            this.sillyContentInstance?.forceUpdate();
            return;
        }

        const { src, url, height, width } = item ?? {};

        if (src && url && height != null && width != null && !item?.id?.startsWith(GIF_ITEM_PREFIX))
            return ContextMenuApi.openContextMenu(e, () =>
                <ErrorBoundary noop>
                    <Menu.Menu
                        aria-label="GifCategories"
                        navId="gif-collection-id"
                        onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
                    >
                        {MenuThingy({ gif: { ...item!, id: uuidv4(), src, url, height, width } })}
                    </Menu.Menu>
                </ErrorBoundary>,
            );

        return null;
    },
});

type GifPickerShell = { forceUpdate(): void };

function RemoveItemContextMenu(props: {
    type: "gif" | "collection";
    nameOrId: string;
    gif?: Gif;
    onConfirm(): void;
}) {
    const { type, nameOrId, gif, onConfirm } = props;

    if (type === "gif") {
        void CollectionManager.refreshCacheCollection();
        const collections = CollectionManager.cache_collections;
        const currentFolder = collections.find(c => c.gifs.some(g => g.id === nameOrId));
        const otherFolders = collections.filter(c => c.name !== currentFolder?.name);

        return (
            <Menu.Menu
                aria-label="GIF in folder"
                navId="gif-collection-id"
                onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
            >
                {otherFolders.length > 0 && (
                    <Menu.MenuItem
                        id="move-to-folder"
                        key="move-to-folder"
                        label="Move to folder…"
                    >
                        {otherFolders.map(col => (
                            <Menu.MenuItem
                                action={() => void CollectionManager.moveToCollection(nameOrId, col.name).then(() => onConfirm())}
                                id={`move-${col.name}`}
                                key={`move-${col.name}`}
                                label={folderDisplayName(col.name)}
                            />
                        ))}
                    </Menu.MenuItem>
                )}
                <Menu.MenuItem
                    action={() => void CollectionManager.removeFromCollection(nameOrId).then(() => onConfirm())}
                    id="delete-collection"
                    key="delete-collection"
                    label="Remove from folder"
                />
            </Menu.Menu>
        );
    }

    return (
        <Menu.Menu
            aria-label="Folder"
            navId="gif-collection-id"
            onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
        >
            <Menu.MenuItem
                action={() =>
                    openModal(modalProps => (
                        <ErrorBoundary noop>
                            <RenameFolderModal
                                fullName={nameOrId}
                                modalProps={modalProps}
                                onRenamed={onConfirm}
                            />
                        </ErrorBoundary>
                    ))}
                id="rename-folder"
                key="rename-folder"
                label="Rename folder…"
            />
            <Menu.MenuItem
                action={() =>
                    Alerts.show({
                        title: "Are you sure?",
                        body: "Do you really want to delete this folder?",
                        cancelText: "Nevermind",
                        confirmColor: "red",
                        confirmText: "Delete",
                        onConfirm: async () => {
                            await CollectionManager.deleteCollection(nameOrId);
                            onConfirm();
                        },
                    })}
                id="delete-collection"
                key="delete-collection"
                label="Delete folder"
            />
        </Menu.Menu>
    );
}

function RenameFolderModal(props: {
    fullName: string;
    modalProps: RenderModalProps;
    onRenamed(): void;
}) {
    const { fullName, modalProps, onRenamed } = props;

    const [name, setName] = useState(() => folderDisplayName(fullName));

    const trimmedOk = Boolean(name.trim());

    const rename = async () => {
        if (!trimmedOk) return;
        const ok = await CollectionManager.renameCollection(fullName, name);
        if (ok) {
            modalProps.onClose();
            onRenamed();
        }
    };

    return (
        <Modal
            {...modalProps}
            actions={[{
                onClick: modalProps.onClose,
                text: "Cancel",
                variant: "secondary",
            }, {
                disabled: !trimmedOk || displayNameMatchesQuery(fullName, name),
                onClick: () => void rename(),
                text: "Rename",
                variant: "primary",
            }]}
            title="Rename GIF folder"
        >
            <Heading style={{ marginTop: "10px" }} tag="h5">
                New name
            </Heading>
            <TextInput onChange={setName} placeholder="Folder name" value={name} />
        </Modal>
    );
}

function MenuThingy({ gif }: { gif: Gif }) {
    void CollectionManager.refreshCacheCollection();

    const collections = CollectionManager.cache_collections;

    return (
        <Menu.MenuItem id="add-to-collection" key="add-to-collection" label="Add to folder…">
            {collections.map(col => (
                <Menu.MenuItem
                    action={() => void CollectionManager.addToCollection(col.name, gif)}
                    id={col.name}
                    key={col.name}
                    label={col.name.replace(/^.+?:/, "")}
                />
            ))}
            <Menu.MenuSeparator />
            <Menu.MenuItem
                action={() =>
                    openModal(modalProps => (
                        <ErrorBoundary noop>
                            <CreateCollectionModal gif={gif} modalProps={modalProps} />
                        </ErrorBoundary>
                    ))}
                id="create-collection"
                key="create-collection"
                label="Create new folder…"
            />
        </Menu.MenuItem>
    );
}

function CreateCollectionModal({ gif, modalProps }: { gif: Gif; modalProps: RenderModalProps; }) {
    const [name, setName] = useState("");

    const createFolder = async () => {
        if (!name.length) return;
        await CollectionManager.createCollection(name, [gif]);
        modalProps.onClose();
    };

    return (
        <Modal
            {...modalProps}
            actions={[{
                onClick: modalProps.onClose,
                text: "Cancel",
                variant: "secondary",
            }, {
                disabled: !name.length,
                onClick: () => void createFolder(),
                text: "Create",
                variant: "primary",
            }]}
            title="Create GIF folder"
        >
            <Heading style={{ marginTop: "10px" }} tag="h5">
                Folder name
            </Heading>
            <TextInput onChange={setName} placeholder="Cats, vibes, rage…" value={name} />
        </Modal>
    );
}
