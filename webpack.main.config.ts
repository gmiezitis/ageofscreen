import path from "path";
import webpack from "webpack";
import type { Configuration } from "webpack";

import { FEATURES } from "./src/config/features";
import { rules } from "./webpack.rules";
import { plugins } from "./webpack.plugins";

export const mainConfig: Configuration = {
    /**
     * This is the main entry point for your application, it's the first file
     * that runs in the main process.
     */
    entry: "./src/index.ts",
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
        extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
        alias: {
            "@services/focusLogic": FEATURES.ENABLE_SMART_TARGETING_OCR
                ? path.resolve(__dirname, "src/services/focusLogic.ts")
                : path.resolve(__dirname, "src/services/focusLogic.disabled.ts"),
        },
    },
};
