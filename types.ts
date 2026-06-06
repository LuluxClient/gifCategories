/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export enum Format {
    NONE = 0,
    IMAGE = 1,
    VIDEO = 2,
}

export interface Category {
    type: "Trending" | "Category";
    name: string;
    src: string;
    format: Format;
    gifs?: Gif[];
}

export interface Collection extends Omit<Category, "gifs"> {
    gifs: Gif[];
}

export interface Gif {
    id: string;
    src: string;
    url: string;
    height: number;
    width: number;
}

export interface Props {
    favorites: Record<string, unknown>;
    trendingCategories: Category[];
}
