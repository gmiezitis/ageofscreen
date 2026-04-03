export type MenuOpenReason = "manual";

export type MenuOpenedPayload = {
    reason: MenuOpenReason;
    openedAt: number;
};

export const PRINT_SCREEN_SLEEP_GRACE_MS = 1600;

export const getMenuSleepSuppressedUntil = ({ reason, openedAt }: MenuOpenedPayload): number => (
    reason === "manual"
        ? openedAt + PRINT_SCREEN_SLEEP_GRACE_MS
        : openedAt
);

export const isMenuSleepSuppressed = (suppressedUntil: number, now = Date.now()): boolean => (
    suppressedUntil > now
);
