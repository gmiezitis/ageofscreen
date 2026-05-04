const ff = (value: number, digits = 4): string => value.toFixed(digits);

export const buildFfmpegEaseInOutCubicExpr = (progressExpr: string): string => (
    `if(lt(${progressExpr}\\,0.5)\\,4*pow(${progressExpr}\\,3)\\,1-pow(-2*(${progressExpr})+2\\,3)/2)`
);

export const buildFfmpegEffectEnvelopeExpr = (progressExpr: string, fadeRatio: number): string => {
    const safeFadeRatio = Math.max(0.0001, Math.min(0.4999, Number.isFinite(fadeRatio) ? fadeRatio : 0.18));
    const fadeRatioExpr = ff(safeFadeRatio);
    const fadeInProgress = `${progressExpr}/${fadeRatioExpr}`;
    const fadeOutProgress = `(1-${progressExpr})/${fadeRatioExpr}`;
    const fadeInExpr = `if(lt(${progressExpr}\\,${fadeRatioExpr})\\,${buildFfmpegEaseInOutCubicExpr(fadeInProgress)}\\,1)`;
    const fadeOutExpr = `if(gt(${progressExpr}\\,${ff(1 - safeFadeRatio)})\\,${buildFfmpegEaseInOutCubicExpr(fadeOutProgress)}\\,1)`;

    return `${fadeInExpr}*${fadeOutExpr}`;
};
