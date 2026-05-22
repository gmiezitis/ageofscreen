import { SmartEffect, SmartTrackingProfile, ZoomArea } from './types';
import { DEFAULT_ZOOM_INTENSITY } from './effectIntensity';

type CursorBounds = { x: number; y: number; width: number; height: number };

type CursorEvent = {
    type: 'move' | 'click' | 'meta' | 'zoom_toggle' | string;
    x: number;
    y: number;
    t: number;
    bounds?: CursorBounds;
    ignoredByAutoFocus?: boolean;
    ignoredTarget?: string;
};

type SmoothedCursorEvent = CursorEvent & {
    smoothX: number;
    smoothY: number;
};

type TrackPoint = {
    timeSec: number;
    centerX: number;
    centerY: number;
};

type FocusIntent = {
    kind: 'click' | 'typing';
    startTime: number;
    duration: number;
    centerX: number;
    centerY: number;
    confidence: number;
    trackPoints?: TrackPoint[];
};

type ZoomCandidate = SmartEffect & {
    sourceKind: 'click' | 'typing';
};

type SmartTrackingProfileConfig = {
    smoothingAlpha: number;
    clickFocusRawWeight: number;
    typingClusterGapMs: number;
    clickZoomIntensity: number;
    typingZoomIntensity: number;
    clickZoomArea: { width: number; height: number };
    typingZoomArea: { width: number; height: number };
    clickZoomDuration: number;
    clickLeadSeconds: number;
    clickRegionThreshold: number;
    clickSceneShiftThreshold: number;
    clickBurstGapSec: number;
    clickRetargetMinGapSec: number;
    typingMinDwellMs: number;
    typingFollowStepMs: number;
    typingRegionThreshold: number;
    maxTypingTrackPoints: number;
};

export interface SmartTrackingBuildOptions {
    durationHint?: number;
    profile?: SmartTrackingProfile;
}

const TYPING_PREROLL = 0.24;
const TYPING_MAX_RADIUS_PX = 38;
const TYPING_TAIL_SECONDS = 0.48;
const MIN_FOCUS_GAP = 1.05;
const MIN_ZOOM_DURATION = 0.5;
const ZOOM_SEPARATION = 0.34;
const MAX_ZOOM_EFFECTS = 8;
const CLICK_RETRIGGER_HOLD = 2.4;
const CLICK_RETRIGGER_GAP = 0.95;
const TYPING_RETRIGGER_GAP = 0.5;
const MAX_CLICK_CLUSTER_DURATION = 5.4;
const TYPING_CLICK_SUPPRESSION_MS = 1200;
const CLICK_SUPPRESSES_TYPING_GAP = 0.6;

export const DEFAULT_SMART_TRACKING_PROFILE: SmartTrackingProfile = 'smooth_focus';

const SMART_TRACKING_PROFILES: Record<SmartTrackingProfile, SmartTrackingProfileConfig> = {
    standard: {
        smoothingAlpha: 0.11,
        clickFocusRawWeight: 0.3,
        typingClusterGapMs: 220,
        clickZoomIntensity: DEFAULT_ZOOM_INTENSITY,
        typingZoomIntensity: DEFAULT_ZOOM_INTENSITY,
        clickZoomArea: { width: 28, height: 21 },
        typingZoomArea: { width: 34, height: 25 },
        clickZoomDuration: 4.05,
        clickLeadSeconds: 0.34,
        clickRegionThreshold: 16,
        clickSceneShiftThreshold: 24,
        clickBurstGapSec: 1.2,
        clickRetargetMinGapSec: 1.55,
        typingMinDwellMs: 1100,
        typingFollowStepMs: 820,
        typingRegionThreshold: 11,
        maxTypingTrackPoints: 3,
    },
    smooth_focus: {
        smoothingAlpha: 0.09,
        clickFocusRawWeight: 0.26,
        typingClusterGapMs: 260,
        clickZoomIntensity: DEFAULT_ZOOM_INTENSITY,
        typingZoomIntensity: DEFAULT_ZOOM_INTENSITY,
        clickZoomArea: { width: 32, height: 24 },
        typingZoomArea: { width: 38, height: 28 },
        clickZoomDuration: 4.45,
        clickLeadSeconds: 0.38,
        clickRegionThreshold: 18,
        clickSceneShiftThreshold: 28,
        clickBurstGapSec: 1.4,
        clickRetargetMinGapSec: 1.8,
        typingMinDwellMs: 1450,
        typingFollowStepMs: 840,
        typingRegionThreshold: 13,
        maxTypingTrackPoints: 3,
    },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function getZoomAreaCenter(area: ZoomArea) {
    return {
        x: area.x + area.width / 2,
        y: area.y + area.height / 2,
    };
}

function getZoomAreaDistance(a: ZoomArea, b: ZoomArea) {
    const ac = getZoomAreaCenter(a);
    const bc = getZoomAreaCenter(b);
    return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function blendZoomAreas(a: ZoomArea, b: ZoomArea): ZoomArea {
    const ac = getZoomAreaCenter(a);
    const bc = getZoomAreaCenter(b);
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);
    return createZoomArea((ac.x + bc.x) / 2, (ac.y + bc.y) / 2, { width, height });
}

function resolveBuildOptions(durationHintOrOptions?: number | SmartTrackingBuildOptions, profileOverride?: SmartTrackingProfile) {
    if (typeof durationHintOrOptions === 'number') {
        return {
            durationHint: durationHintOrOptions,
            profile: profileOverride ?? DEFAULT_SMART_TRACKING_PROFILE,
        };
    }

    return {
        durationHint: durationHintOrOptions?.durationHint,
        profile: durationHintOrOptions?.profile ?? profileOverride ?? DEFAULT_SMART_TRACKING_PROFILE,
    };
}

function getCaptureBounds(events: CursorEvent[]): CursorBounds {
    const meta = events.find((event) => event.type === 'meta' && event.bounds?.width && event.bounds?.height);
    if (meta?.bounds) return meta.bounds;

    const positioned = events.filter((event) => Number.isFinite(event.x) && Number.isFinite(event.y));
    if (positioned.length === 0) {
        return { x: 0, y: 0, width: 1920, height: 1080 };
    }

    const xs = positioned.map((event) => event.x);
    const ys = positioned.map((event) => event.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
    };
}

function toNormalizedPoint(bounds: CursorBounds, x: number, y: number) {
    return {
        x: clamp(((x - bounds.x) / bounds.width) * 100, 0, 100),
        y: clamp(((y - bounds.y) / bounds.height) * 100, 0, 100),
    };
}

function smoothCursorEvents(events: CursorEvent[], alpha: number): SmoothedCursorEvent[] {
    const positioned = [...events]
        .filter((event) => (event.type === 'move' || event.type === 'click' || event.type === 'zoom_toggle') && Number.isFinite(event.x) && Number.isFinite(event.y))
        .sort((a, b) => a.t - b.t);

    if (positioned.length === 0) return [];

    let smoothX = positioned[0].x;
    let smoothY = positioned[0].y;

    return positioned.map((event, index) => {
        if (index === 0) {
            return { ...event, smoothX, smoothY };
        }

        const eventAlpha = event.type === 'click'
            ? Math.min(0.26, alpha * 1.6)
            : alpha;

        smoothX = lerp(smoothX, event.x, eventAlpha);
        smoothY = lerp(smoothY, event.y, eventAlpha);

        return {
            ...event,
            smoothX,
            smoothY,
        };
    });
}

function toFocusPoint(bounds: CursorBounds, event: SmoothedCursorEvent, rawWeight = 0) {
    const x = rawWeight > 0 ? lerp(event.smoothX, event.x, rawWeight) : event.smoothX;
    const y = rawWeight > 0 ? lerp(event.smoothY, event.y, rawWeight) : event.smoothY;
    return toNormalizedPoint(bounds, x, y);
}

function createZoomArea(centerX: number, centerY: number, size: { width: number; height: number }): ZoomArea {
    return {
        x: clamp(centerX - size.width / 2, 0, 100 - size.width),
        y: clamp(centerY - size.height / 2, 0, 100 - size.height),
        width: size.width,
        height: size.height,
    };
}

function sampleTypingTrack(cluster: SmoothedCursorEvent[], bounds: CursorBounds, profile: SmartTrackingProfileConfig): TrackPoint[] {
    if (cluster.length === 0) return [];

    const points: TrackPoint[] = [];
    let bucket: SmoothedCursorEvent[] = [cluster[0]];
    let bucketStart = cluster[0].t;

    const flushBucket = () => {
        if (bucket.length === 0) return;
        const avgX = bucket.reduce((sum, event) => sum + event.smoothX, 0) / bucket.length;
        const avgY = bucket.reduce((sum, event) => sum + event.smoothY, 0) / bucket.length;
        const point = toNormalizedPoint(bounds, avgX, avgY);
        points.push({
            timeSec: bucket[bucket.length - 1].t / 1000,
            centerX: point.x,
            centerY: point.y,
        });
    };

    for (let i = 1; i < cluster.length; i++) {
        const event = cluster[i];
        if (event.t - bucketStart <= profile.typingFollowStepMs) {
            bucket.push(event);
            continue;
        }

        flushBucket();
        bucket = [event];
        bucketStart = event.t;
    }

    flushBucket();

    const deduped = points.filter((point, index) => {
        if (index === 0) return true;
        const prev = points[index - 1];
        return Math.abs(point.centerX - prev.centerX) > 4 || Math.abs(point.centerY - prev.centerY) > 4;
    });

    if (deduped.length <= profile.maxTypingTrackPoints) return deduped;

    const reduced: TrackPoint[] = [];
    const lastIndex = deduped.length - 1;
    for (let i = 0; i < profile.maxTypingTrackPoints; i++) {
        const idx = Math.round((i / Math.max(1, profile.maxTypingTrackPoints - 1)) * lastIndex);
        reduced.push(deduped[idx]);
    }
    return reduced;
}

function detectClickFocuses(events: SmoothedCursorEvent[], bounds: CursorBounds, profile: SmartTrackingProfileConfig): FocusIntent[] {
    const clicks = events
        .filter((event) => event.type === 'click' && !event.ignoredByAutoFocus)
        .sort((a, b) => a.t - b.t);

    const focuses: FocusIntent[] = [];

    for (const event of clicks) {
        const point = toFocusPoint(bounds, event, profile.clickFocusRawWeight);
        const candidate: FocusIntent = {
            kind: 'click',
            startTime: Math.max(0, event.t / 1000 - profile.clickLeadSeconds),
            duration: profile.clickZoomDuration,
            centerX: point.x,
            centerY: point.y,
            confidence: event.ignoredTarget === 'webcam' || event.ignoredTarget === 'recording_widget' ? 0.4 : 1,
        };

        const prev = focuses[focuses.length - 1];
        if (!prev) {
            focuses.push(candidate);
            continue;
        }

        const prevEnd = prev.startTime + prev.duration;
        const startGap = candidate.startTime - prev.startTime;
        const distance = Math.hypot(candidate.centerX - prev.centerX, candidate.centerY - prev.centerY);
        const sameRegion = distance <= profile.clickRegionThreshold;
        const meaningfulRetarget = distance >= profile.clickSceneShiftThreshold && startGap >= profile.clickRetargetMinGapSec;

        if (sameRegion && startGap <= CLICK_RETRIGGER_GAP) {
            const totalWeight = prev.confidence + candidate.confidence;
            prev.centerX = (prev.centerX * prev.confidence + candidate.centerX * candidate.confidence) / totalWeight;
            prev.centerY = (prev.centerY * prev.confidence + candidate.centerY * candidate.confidence) / totalWeight;
            prev.confidence = Math.max(prev.confidence, candidate.confidence);
            const mergedEnd = Math.max(prevEnd, candidate.startTime + CLICK_RETRIGGER_HOLD);
            prev.duration = Math.min(MAX_CLICK_CLUSTER_DURATION, mergedEnd - prev.startTime);
            continue;
        }

        if (candidate.startTime < prevEnd + profile.clickBurstGapSec && !meaningfulRetarget) {
            continue;
        }

        focuses.push(candidate);
    }

    return focuses;
}

function detectTypingFocuses(events: SmoothedCursorEvent[], bounds: CursorBounds, profile: SmartTrackingProfileConfig): FocusIntent[] {
    const moves = events.filter((event) => event.type === 'move');
    const clicks = events.filter((event) => event.type === 'click' && !event.ignoredByAutoFocus);
    const focuses: FocusIntent[] = [];

    if (moves.length < 2) return focuses;

    let cluster = [moves[0]];
    for (let i = 1; i < moves.length; i++) {
        const event = moves[i];
        const previous = cluster[cluster.length - 1];
        const dx = event.smoothX - previous.smoothX;
        const dy = event.smoothY - previous.smoothY;
        const dist = Math.hypot(dx, dy);
        const gapMs = event.t - previous.t;

        if (dist <= TYPING_MAX_RADIUS_PX && gapMs <= profile.typingClusterGapMs) {
            cluster.push(event);
            continue;
        }

        const maybeFocus = finalizeTypingCluster(cluster, clicks, bounds, profile);
        if (maybeFocus) focuses.push(maybeFocus);
        cluster = [event];
    }

    const lastFocus = finalizeTypingCluster(cluster, clicks, bounds, profile);
    if (lastFocus) focuses.push(lastFocus);

    return focuses;
}

function finalizeTypingCluster(cluster: SmoothedCursorEvent[], clicks: SmoothedCursorEvent[], bounds: CursorBounds, profile: SmartTrackingProfileConfig): FocusIntent | null {
    if (cluster.length < 6) return null;

    const startMs = cluster[0].t;
    const endMs = cluster[cluster.length - 1].t;
    const dwellMs = endMs - startMs;
    if (dwellMs < profile.typingMinDwellMs) return null;

    const hasClusterClick = clicks.some((click) => click.t >= startMs - 160 && click.t <= endMs + TYPING_CLICK_SUPPRESSION_MS);
    if (hasClusterClick) return null;

    const trackPoints = sampleTypingTrack(cluster, bounds, profile);
    if (trackPoints.length === 0) return null;

    const avgX = trackPoints.reduce((sum, point) => sum + point.centerX, 0) / trackPoints.length;
    const avgY = trackPoints.reduce((sum, point) => sum + point.centerY, 0) / trackPoints.length;
    const startTime = Math.max(0, startMs / 1000 - TYPING_PREROLL);
    const duration = Math.max(1.6, endMs / 1000 + TYPING_TAIL_SECONDS - startTime);

    return {
        kind: 'typing',
        startTime,
        duration,
        centerX: avgX,
        centerY: avgY,
        confidence: clamp(dwellMs / 2600, 0.4, 0.9),
        trackPoints,
    };
}

function mergeFocuses(intents: FocusIntent[], profile: SmartTrackingProfileConfig): FocusIntent[] {
    const sorted = [...intents].sort((a, b) => a.startTime - b.startTime);
    const merged: FocusIntent[] = [];

    for (const intent of sorted) {
        const prev = merged[merged.length - 1];
        if (!prev) {
            merged.push(intent);
            continue;
        }

        const prevEnd = prev.startTime + prev.duration;
        const overlaps = intent.startTime <= prevEnd + MIN_FOCUS_GAP;
        const regionThreshold = prev.kind === 'click' && intent.kind === 'click'
            ? profile.clickRegionThreshold
            : profile.typingRegionThreshold;
        const sameRegion = Math.abs(intent.centerX - prev.centerX) < regionThreshold && Math.abs(intent.centerY - prev.centerY) < regionThreshold;

        if (overlaps && sameRegion && prev.kind === intent.kind) {
            const totalWeight = prev.confidence + intent.confidence;
            prev.startTime = Math.min(prev.startTime, intent.startTime);
            prev.centerX = (prev.centerX * prev.confidence + intent.centerX * intent.confidence) / totalWeight;
            prev.centerY = (prev.centerY * prev.confidence + intent.centerY * intent.confidence) / totalWeight;
            prev.confidence = Math.max(prev.confidence, intent.confidence);

            if (intent.kind === 'click') {
                const mergedEnd = Math.max(prevEnd, intent.startTime + CLICK_RETRIGGER_HOLD);
                prev.duration = Math.min(MAX_CLICK_CLUSTER_DURATION, mergedEnd - prev.startTime);
                continue;
            }

            prev.duration = Math.max(prevEnd, intent.startTime + intent.duration) - prev.startTime;
            if (intent.trackPoints?.length) {
                prev.trackPoints = [...(prev.trackPoints ?? []), ...intent.trackPoints].sort((a, b) => a.timeSec - b.timeSec);
            }
            continue;
        }

        merged.push(intent);
    }

    return merged;
}

function buildClickZoom(intent: FocusIntent, index: number, durationLimit: number | null, profile: SmartTrackingProfileConfig): ZoomCandidate | null {
    const startTime = durationLimit != null
        ? clamp(intent.startTime, 0, Math.max(0, durationLimit - MIN_ZOOM_DURATION))
        : Math.max(0, intent.startTime);
    const maxDuration = durationLimit != null ? Math.max(MIN_ZOOM_DURATION, durationLimit - startTime) : intent.duration;
    const duration = Math.min(intent.duration, maxDuration);
    if (duration < MIN_ZOOM_DURATION) return null;

    return {
        id: `smart-track-zoom-${index}-${Math.round(startTime * 1000)}`,
        type: 'zoom',
        startTime,
        duration,
        label: 'SMART CLICK FOCUS',
        intensity: profile.clickZoomIntensity,
        tilt: 0,
        zoomArea: createZoomArea(intent.centerX, intent.centerY, profile.clickZoomArea),
        sourceKind: 'click',
    };
}

function buildTypingZooms(intent: FocusIntent, index: number, durationLimit: number | null, profile: SmartTrackingProfileConfig): ZoomCandidate[] {
    const startTime = durationLimit != null
        ? clamp(intent.startTime, 0, Math.max(0, durationLimit - MIN_ZOOM_DURATION))
        : Math.max(0, intent.startTime);
    const maxDuration = durationLimit != null ? Math.max(MIN_ZOOM_DURATION, durationLimit - startTime) : intent.duration;
    const duration = Math.min(intent.duration, maxDuration);
    if (duration < MIN_ZOOM_DURATION) return [];

    return [{
        id: `smart-track-dwell-${index}-${Math.round(startTime * 1000)}`,
        type: 'zoom',
        startTime,
        duration,
        label: 'SMART FOCUS',
        intensity: profile.typingZoomIntensity,
        tilt: 0,
        zoomArea: createZoomArea(intent.centerX, intent.centerY, profile.typingZoomArea),
        sourceKind: 'typing',
    }];
}

function packZoomCandidates(candidates: ZoomCandidate[], durationLimit: number | null, profile: SmartTrackingProfileConfig): ZoomCandidate[] {
    const sorted = [...candidates].sort((a, b) => a.startTime - b.startTime);
    const packed: ZoomCandidate[] = [];

    for (const original of sorted) {
        const candidate = { ...original };
        const prev = packed[packed.length - 1];

        if (prev && prev.zoomArea && candidate.zoomArea) {
            const prevEnd = prev.startTime + prev.duration;
            const areaDistance = getZoomAreaDistance(prev.zoomArea, candidate.zoomArea);

            if (prev.sourceKind === 'click' && candidate.sourceKind === 'click') {
                const sameClickCluster = areaDistance <= profile.clickRegionThreshold && candidate.startTime <= prevEnd + CLICK_RETRIGGER_GAP;
                if (sameClickCluster) {
                    prev.zoomArea = blendZoomAreas(prev.zoomArea, candidate.zoomArea);
                    prev.intensity = Math.max(prev.intensity ?? 0, candidate.intensity ?? 0);
                    const mergedEnd = Math.max(prevEnd, candidate.startTime + CLICK_RETRIGGER_HOLD);
                    prev.duration = Math.min(MAX_CLICK_CLUSTER_DURATION, mergedEnd - prev.startTime);
                    if (durationLimit != null) {
                        const maxDuration = Math.max(MIN_ZOOM_DURATION, durationLimit - prev.startTime);
                        prev.duration = Math.min(prev.duration, maxDuration);
                    }
                    continue;
                }
            }

            if (prev.sourceKind === 'typing' && candidate.sourceKind === 'typing') {
                const sameTypingCluster = areaDistance <= profile.typingRegionThreshold && candidate.startTime <= prevEnd + TYPING_RETRIGGER_GAP;
                if (sameTypingCluster) {
                    prev.zoomArea = blendZoomAreas(prev.zoomArea, candidate.zoomArea);
                    prev.intensity = Math.max(prev.intensity ?? 0, candidate.intensity ?? 0);
                    prev.duration = Math.max(prevEnd, candidate.startTime + candidate.duration) - prev.startTime;
                    if (durationLimit != null) {
                        const maxDuration = Math.max(MIN_ZOOM_DURATION, durationLimit - prev.startTime);
                        prev.duration = Math.min(prev.duration, maxDuration);
                    }
                    continue;
                }
            }

            if (prev.sourceKind === 'click' && candidate.sourceKind === 'typing') {
                const clickOwnsRegion = areaDistance <= profile.clickSceneShiftThreshold && candidate.startTime <= prevEnd + CLICK_SUPPRESSES_TYPING_GAP;
                if (clickOwnsRegion) {
                    continue;
                }
            }

            if (prev.sourceKind === 'typing' && candidate.sourceKind === 'click') {
                const clickOverridesTyping = areaDistance <= profile.clickSceneShiftThreshold && candidate.startTime <= prevEnd + CLICK_SUPPRESSES_TYPING_GAP;
                if (clickOverridesTyping) {
                    prev.duration = Math.max(MIN_ZOOM_DURATION, candidate.startTime - prev.startTime - ZOOM_SEPARATION);
                }
            }
        }

        if (prev) {
            const prevEnd = prev.startTime + prev.duration;
            if (candidate.startTime < prevEnd + ZOOM_SEPARATION) {
                const trimmedPrevEnd = Math.max(prev.startTime + MIN_ZOOM_DURATION, candidate.startTime - ZOOM_SEPARATION);
                if (trimmedPrevEnd < prevEnd) {
                    prev.duration = trimmedPrevEnd - prev.startTime;
                }
                candidate.startTime = Math.max(candidate.startTime, prev.startTime + prev.duration + ZOOM_SEPARATION);
            }
        }

        if (durationLimit != null) {
            const maxDuration = Math.max(MIN_ZOOM_DURATION, durationLimit - candidate.startTime);
            candidate.duration = Math.min(candidate.duration, maxDuration);
        }

        if (candidate.duration < MIN_ZOOM_DURATION) continue;
        packed.push(candidate);
        if (packed.length >= MAX_ZOOM_EFFECTS) break;
    }

    return packed;
}

export function buildSmartTrackingEffects(
    events: CursorEvent[],
    durationHintOrOptions?: number | SmartTrackingBuildOptions,
    profileOverride?: SmartTrackingProfile,
): SmartEffect[] {
    if (!Array.isArray(events) || events.length === 0) return [];

    const options = resolveBuildOptions(durationHintOrOptions, profileOverride);
    const profile = SMART_TRACKING_PROFILES[options.profile];
    const bounds = getCaptureBounds(events);
    const smoothedEvents = smoothCursorEvents(events, profile.smoothingAlpha);
    if (smoothedEvents.length === 0) return [];

    const intents = mergeFocuses([
        ...detectClickFocuses(smoothedEvents, bounds, profile),
        ...detectTypingFocuses(smoothedEvents, bounds, profile),
    ], profile);

    if (intents.length === 0) return [];

    const durationLimit = Number.isFinite(options.durationHint) && options.durationHint ? options.durationHint : null;
    const zoomCandidates: ZoomCandidate[] = [];

    intents.forEach((intent, index) => {
        if (intent.kind === 'typing') {
            zoomCandidates.push(...buildTypingZooms(intent, index, durationLimit, profile));
            return;
        }

        const clickZoom = buildClickZoom(intent, index, durationLimit, profile);
        if (clickZoom) zoomCandidates.push(clickZoom);
    });

    const packedZooms = packZoomCandidates(zoomCandidates, durationLimit, profile);
    const effects: SmartEffect[] = packedZooms.map(({ sourceKind: _sourceKind, ...effect }) => effect);

    for (const zoom of packedZooms) {
        if (zoom.sourceKind !== 'click' && zoom.sourceKind !== 'typing') continue;
        effects.push({
            id: `${zoom.id}-exposure`,
            type: 'exposure',
            startTime: zoom.startTime,
            duration: Math.min(0.95, zoom.duration),
            label: 'SMART HIGHLIGHT',
            intensity: 18,
        });
    }

    return effects.sort((a, b) => a.startTime - b.startTime);
}

export function remapSmartTrackingEffects(effects: SmartEffect[], sourceDuration?: number | null, targetDuration?: number | null): SmartEffect[] {
    if (!Array.isArray(effects) || effects.length === 0) return [];
    if (!sourceDuration || !targetDuration || sourceDuration <= 0 || targetDuration <= 0) {
        return effects.map((effect) => ({ ...effect }));
    }

    const scale = targetDuration / sourceDuration;
    return effects
        .map((effect, index) => {
            const startTime = clamp(effect.startTime * scale, 0, Math.max(0, targetDuration - 0.35));
            const duration = clamp(effect.duration * scale, 0.35, Math.max(0.35, targetDuration - startTime));
            return {
                ...effect,
                id: `${effect.id}-remap-${index}`,
                startTime,
                duration,
            };
        })
        .filter((effect) => effect.duration > 0.01)
        .sort((a, b) => a.startTime - b.startTime);
}
