import path from "path";
import webpack from "webpack";
import type { Configuration } from "webpack";

import { FEATURES } from "./src/config/features";
import { rules } from "./webpack.rules";
import { plugins } from "./webpack.plugins";

// Rule for global CSS files (excluding CSS Modules)
rules.push({
    test: /\.css$/,
    exclude: /\.module\.css$/, // Exclude .module.css
    use: [{ loader: "style-loader" }, { loader: "css-loader" }],
});

// Rule for CSS Modules (files ending in .module.css)
rules.push({
    test: /\.module\.css$/,
    use: [
        { loader: "style-loader" },
        {
            loader: "css-loader",
            options: {
                modules: true, // Enable CSS Modules
            },
        },
    ],
});

// Rule for assets (images, sounds, etc.)
rules.push({
    test: /\.(mp3|wav|png|jpg|gif|svg)$/i,
    type: "asset/resource",
});

export const rendererConfig: Configuration = {
    devtool: process.env.NODE_ENV === "development" ? "eval-source-map" : false,
    stats: "errors-warnings",
    infrastructureLogging: {
        level: "error",
    },
    module: {
        rules,
    },
    plugins: [
        ...plugins,
        new webpack.DefinePlugin({
            "process.env.SNIPFOCUS_RELEASE_PROFILE": JSON.stringify(process.env.SNIPFOCUS_RELEASE_PROFILE ?? "dev"),
        }),
    ],
    resolve: {
        extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
        alias: {
            "@config/focusTimerSounds": FEATURES.ENABLE_FOCUS_TIMER_BUILTIN_SOUNDS
                ? path.resolve(__dirname, "src/config/focusTimerSounds.enabled.ts")
                : path.resolve(__dirname, "src/config/focusTimerSounds.ts"),
        },
    },
};
