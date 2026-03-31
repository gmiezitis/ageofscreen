import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";

const quietCheckerLogger = {
    log: (_message: string) => {
        // Suppress routine "type-checking in progress" / "no errors found" noise in dev.
    },
    error: (message: string) => {
        console.error(message);
    },
};

const shouldEnableTypeChecker = process.env.NODE_ENV !== "production";

export const plugins = shouldEnableTypeChecker
    ? [
        new ForkTsCheckerWebpackPlugin({
            logger: quietCheckerLogger,
            devServer: false,
        }),
    ]
    : [];
