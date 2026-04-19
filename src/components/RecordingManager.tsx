import { useState, useCallback, useEffect, useRef } from 'react';
import { createHealthTracker } from '../services/captureHealth';
import {
  CompositorState,
  computeCanvasDimensions,
  waitForVideoMetadata,
} from '../services/canvasCompositor';
import { RecordingEngine } from '../services/recording/RecordingEngine';
import { RecordingConfig } from './RecordingSetup';
import type { EntitlementState, UpgradeSource } from '../shared/licensing';
import { getCameraDimensionsForWidth, normalizeCameraShape } from '../shared/cameraShapes';

interface RecordingManagerProps {
  onMessage: (message: string) => void;
  enableWebcam?: boolean;
  onUpgradePrompt?: (source: UpgradeSource, message: string) => void;
}

interface PendingEditorLaunch {
  filePath: string;
  captureName: string;
}

const DIRECT_RECORDING_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const getDirectRecordingMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return DIRECT_RECORDING_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
};

const buildDesktopVideoConstraints = (sourceId: string) => ({
  mandatory: {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sourceId,
    minFrameRate: 24,
    maxFrameRate: 30,
  },
  cursor: 'never',
} as any);

const suppressCapturedCursor = async (screenStream: MediaStream): Promise<boolean> => {
  const screenTrack = screenStream.getVideoTracks()[0];
  if (!screenTrack || typeof screenTrack.applyConstraints !== 'function') return false;

  const readCursorMode = () => {
    try {
      const settings = typeof screenTrack.getSettings === 'function' ? (screenTrack.getSettings() as any) : null;
      if (typeof settings?.cursor === 'string') return settings.cursor;
    } catch {
      // Ignore unsupported settings reads.
    }

    try {
      const constraints = typeof screenTrack.getConstraints === 'function' ? (screenTrack.getConstraints() as any) : null;
      if (typeof constraints?.cursor === 'string') return constraints.cursor;
    } catch {
      // Ignore unsupported constraints reads.
    }

    return null;
  };

  try {
    await screenTrack.applyConstraints({ cursor: 'never' } as any);
    const cursorMode = readCursorMode();
    const nativeCursorSuppressed = cursorMode === 'never';
    console.log('[RecordingManager] Requested native desktop cursor suppression for styled cursor overlays', {
      cursorMode: cursorMode ?? 'unknown',
      nativeCursorSuppressed,
    });
    return nativeCursorSuppressed;
  } catch (error) {
    console.warn('[RecordingManager] Native cursor suppression is not supported for this capture path:', error);
    return false;
  }
};

export const useRecordingManager = ({ onMessage, enableWebcam = false, onUpgradePrompt }: RecordingManagerProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const engineRef = useRef<RecordingEngine | null>(null);
  const isRecordingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const editAfterRecordingRef = useRef<boolean>(true);
  const chunksRef = useRef<Blob[]>([]);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const targetSourceRef = useRef<any>(null);
  const stopReasonRef = useRef<UpgradeSource | null>(null);

  const setRecordingActive = useCallback((nextValue: boolean) => {
    isRecordingRef.current = nextValue;
    setIsRecording(nextValue);
  }, []);

  const setActiveRecorder = useCallback((nextRecorder: MediaRecorder | null) => {
    recorderRef.current = nextRecorder;
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onEditAfterRecordingChanged) return;
    const cleanup = window.electronAPI.onEditAfterRecordingChanged((enabled: boolean) => {
      console.log('[RecordingManager] Edit after recording changed:', enabled);
      editAfterRecordingRef.current = enabled;
    });
    return () => cleanup?.();
  }, []);

  const finalizeRecordingBlob = useCallback(async (videoBlob: Blob, targetSource?: any): Promise<PendingEditorLaunch | null> => {
    const buffer = await videoBlob.arrayBuffer();
    if (editAfterRecordingRef.current) {
      if (!window.electronAPI.saveTempVideo) return null;

      const { filePath, error } = await window.electronAPI.saveTempVideo(buffer);
      if (filePath) {
        const captureName = targetSource?.name || `Recording ${new Date().toLocaleTimeString()}`;
        return { filePath, captureName };
      } else if (error) {
        onMessage(`Save failed: ${error}`);
        console.error('[RecordingManager] Save Temp Video Error:', error);
      }
      return null;
    }

    if (!window.electronAPI.saveVideo) return null;

    const saveResult = await window.electronAPI.saveVideo(buffer);
    if (saveResult?.success) {
      onMessage(saveResult.filePath ? `Video saved to ${saveResult.filePath}` : 'Video saved successfully!');
    } else {
      onMessage('Recording saved, but export could not complete.');
    }
    return null;
  }, [onMessage]);

  const cleanupCaptureResources = useCallback((screenVideo?: HTMLVideoElement | null, webcamVideo?: HTMLVideoElement | null) => {
    screenVideo?.pause();
    webcamVideo?.pause();

    if (screenVideo?.parentNode) document.body.removeChild(screenVideo);
    if (webcamVideo?.parentNode) document.body.removeChild(webcamVideo);

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }

    engineRef.current?.destroy();
    engineRef.current = null;
    window.electronAPI?.hideRecordingWidget();
  }, []);

  const getEntitlementState = useCallback(async (): Promise<EntitlementState | null> => {
    try {
      return await window.electronAPI?.license?.getState?.();
    } catch (error) {
      console.warn('[RecordingManager] Failed to read entitlement state, falling back to unlimited recording:', error);
      return null;
    }
  }, []);

  const emitUpgradePrompt = useCallback((source: UpgradeSource, message: string) => {
    onMessage(message);
    onUpgradePrompt?.(source, message);
  }, [onMessage, onUpgradePrompt]);

  const startRecordingProgress = useCallback((stop: () => void, maxRecordingSeconds: number | null | undefined) => {
    const startTime = Date.now();
    window.electronAPI?.sendRecordingProgress?.(0);
    if (!maxRecordingSeconds || maxRecordingSeconds <= 0) {
      return null;
    }

    const limitMs = maxRecordingSeconds * 1000;
    return setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / limitMs, 1);
      window.electronAPI?.sendRecordingProgress?.(progress);
      if (progress >= 1) {
        stopReasonRef.current = 'recording_limit';
        onMessage('Free plan limit reached. Finalizing recording...');
        stop();
      }
    }, 1000);
  }, [onMessage]);

  const broadcastSourceStatus = useCallback((screen: boolean, camera: boolean, mic: boolean) => {
    window.electronAPI?.sendSourceStatus?.({ screen, camera, mic });
  }, []);

  const handleStartRecording = useCallback(async (smartFeatures?: Partial<RecordingConfig>) => {
    if (isRecordingRef.current) {
      onMessage('A recording is already in progress. Stop it before starting another one.');
      return;
    }

    onMessage('Preparing recording...');
    stopReasonRef.current = null;
    if (typeof smartFeatures?.editAfterRecording === 'boolean') {
      editAfterRecordingRef.current = smartFeatures.editAfterRecording;
    }
    chunksRef.current = [];
    let sourceWindowBounds: { x: number; y: number; width: number; height: number } | null = null;

    try {
      if (window.menuAPI?.hideMenu) {
        window.menuAPI.hideMenu();
      }

      await new Promise((resolve) => setTimeout(resolve, 400));

      const sources = await window.electronAPI.getScreenSources();
      const targetSource = smartFeatures?.windowId
        ? sources.find((source: any) => source.id === smartFeatures.windowId)
        : sources.find((source: any) => source.isPrimary && source.id.startsWith('screen:')) || sources[0];

      if (!targetSource) throw new Error('No screen source found');
      targetSourceRef.current = targetSource;
      onMessage(`Capturing: ${targetSource.name}`);
      const entitlementState = await getEntitlementState();
      const maxRecordingSeconds = entitlementState?.maxRecordingSeconds ?? null;

      let screenStream: MediaStream;
      try {
        console.log(`[RecordingManager] Attempting capture with audio for source: ${targetSource.id}`);
        screenStream = await navigator.mediaDevices.getUserMedia({
          audio: smartFeatures?.micEnabled ? {
            mandatory: { chromeMediaSource: 'desktop' }
          } as any : false,
          video: buildDesktopVideoConstraints(targetSource.id),
        });
      } catch (audioErr) {
        console.warn('[RecordingManager] Capture with audio failed, retrying video-only:', audioErr);
        try {
          screenStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: buildDesktopVideoConstraints(targetSource.id),
          });
          onMessage('Recording video only (system audio not supported)');
        } catch (videoErr) {
          console.error('[RecordingManager] Capture failed completely:', videoErr);
          throw new Error('Failed to capture video source');
        }
      }
      activeStreamRef.current = screenStream;
      const nativeCursorSuppressed = await suppressCapturedCursor(screenStream);
      window.electronAPI?.setCursorReplacementSafe?.(nativeCursorSuppressed);

      const isWindowMode = smartFeatures?.recordingMode === 'window';
      const shouldEnableWebcam = smartFeatures?.cameraEnabled !== undefined ? smartFeatures.cameraEnabled : enableWebcam;
      const useCompositor = isWindowMode;

      const screenVideo = document.createElement('video');
      screenVideo.muted = true;
      screenVideo.srcObject = screenStream;
      screenVideo.style.cssText = 'opacity:0;pointer-events:none;position:fixed;top:-10000px';
      document.body.appendChild(screenVideo);
      screenVideo.play().catch((error) => console.error('[Recording] Screen play failed:', error));
      await waitForVideoMetadata(screenVideo);

      if (!useCompositor) {
        const healthTracker = createHealthTracker();
        let metricsActive = true;
        const recordFrame = () => {
          if (!metricsActive) return;
          healthTracker.recordFrameDrawn();
          if ((screenVideo as any).requestVideoFrameCallback) {
            (screenVideo as any).requestVideoFrameCallback(() => recordFrame());
          } else {
            requestAnimationFrame(recordFrame);
          }
        };
        recordFrame();

        const metricsTimer = setInterval(() => {
          window.electronAPI?.sendCaptureHealth?.(healthTracker.getMetrics());
        }, 1000);

        const mimeType = getDirectRecordingMimeType();
        const directRecorder = mimeType
          ? new MediaRecorder(screenStream, { mimeType })
          : new MediaRecorder(screenStream);

        directRecorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          } else {
            healthTracker.recordDroppedFrame();
          }
        };
        directRecorder.onerror = (event: Event) => {
          healthTracker.recordBufferError();
          console.error('[RecordingManager] Direct recorder error:', event);
        };
        directRecorder.onstop = async () => {
          metricsActive = false;
          clearInterval(metricsTimer);
          window.electronAPI?.sendCaptureHealth?.(healthTracker.getMetrics());
          onMessage('Finalizing video...');
          let pendingEditorLaunch: PendingEditorLaunch | null = null;

          try {
            if (chunksRef.current.length === 0) {
              onMessage('Recording failed: no data captured.');
              return;
            }

            const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
            pendingEditorLaunch = await finalizeRecordingBlob(videoBlob, targetSource);
          } catch (err) {
            onMessage(`Finalization failed: ${(err as Error).message}`);
            console.error('[RecordingManager] Error finalizing direct video:', err);
          } finally {
            cleanupCaptureResources(screenVideo, null);
            setRecordingActive(false);
            setActiveRecorder(null);
            if (pendingEditorLaunch) {
              window.electronAPI?.showVideoEditor(pendingEditorLaunch.filePath, pendingEditorLaunch.captureName);
            }
            if (stopReasonRef.current === 'recording_limit') {
              stopReasonRef.current = null;
              emitUpgradePrompt('recording_limit', 'Free plan ends at 3:00. Upgrade to Pro for unlimited recording.');
            }
          }
        };

        directRecorder.start(1000);
        setActiveRecorder(directRecorder);
        setRecordingActive(true);

        window.electronAPI?.showRecordingWidget({
          ...smartFeatures,
          bounds: undefined,
        });
        onMessage('Recording started!');
        window.electronAPI?.sendRecordingStatus?.(true);
        broadcastSourceStatus(true, false, screenStream.getAudioTracks().length > 0);

        const progressTimer = startRecordingProgress(() => {
          if (directRecorder.state !== 'inactive') directRecorder.stop();
        }, maxRecordingSeconds);
        (directRecorder as any)._progressTimer = progressTimer;
        return;
      }

      const canvas = document.createElement('canvas');
      const dims = computeCanvasDimensions(screenVideo);
      canvas.width = dims.width;
      canvas.height = dims.height;

      let webcamVideo: HTMLVideoElement | null = null;
      if (isWindowMode && shouldEnableWebcam) {
        try {
          const webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 160 }, height: { ideal: 160 }, frameRate: { ideal: 15, max: 20 } },
            audio: false,
          });
          webcamStreamRef.current = webcamStream;
          webcamVideo = document.createElement('video');
          webcamVideo.muted = true;
          webcamVideo.srcObject = webcamStream;
          webcamVideo.style.cssText = 'opacity:0;pointer-events:none;position:fixed;top:-10000px';
          document.body.appendChild(webcamVideo);
          webcamVideo.play().catch((error) => console.error('[Recording] Webcam play failed:', error));
        } catch (camErr) {
          console.warn('[Recording] Webcam failed, proceeding without:', camErr);
        }
      }

      const engine = new RecordingEngine(
        (chunk) => chunksRef.current.push(chunk),
        (error) => onMessage(`Engine error: ${error}`)
      );
      engineRef.current = engine;
      await engine.init(canvas.width, canvas.height, 24, 5_000_000);

      const initialSize = smartFeatures?.cameraSize || 100;
      const baseCamSize = 140 * (initialSize / 100);

      if (targetSource?.id) {
        try {
          sourceWindowBounds = await window.electronAPI.getWindowBounds(targetSource.id);
        } catch (error) {
          console.warn('[Recording] Could not get source window bounds:', error);
        }
      }

      const cameraShape = normalizeCameraShape(smartFeatures?.cameraShape);
      const cameraBounds = getCameraDimensionsForWidth(cameraShape, baseCamSize);
      const sourceFrame = sourceWindowBounds || { x: 0, y: 0, width: window.screen.width || canvas.width, height: window.screen.height || canvas.height };

      const compState: CompositorState = {
        typingZoom: { isZoomed: false, x: 0, y: 0 },
        sourceBounds: sourceFrame,
        backgroundColor: smartFeatures?.windowBackground || '#F1F5F9',
        webcam: {
          visible: isWindowMode && !!shouldEnableWebcam,
          video: webcamVideo,
            borderColor: smartFeatures?.cameraBorderColor,
            bounds: {
            x: sourceFrame.x + Math.max(20, sourceFrame.width - cameraBounds.width - 20),
            y: sourceFrame.y + Math.max(20, sourceFrame.height - cameraBounds.height - 20),
            width: cameraBounds.width,
            height: cameraBounds.height,
          },
          shape: cameraShape,
          scaleFactor: 1,
          name: (smartFeatures as any)?.presenterName || '',
        },
        drawing: { strokes: [], screenWidth: window.screen.width, screenHeight: window.screen.height },
      };

      let isCompositorActive = true;
      const feedScreenFrames = () => {
        if (!isCompositorActive) return;

        if ((screenVideo as any).requestVideoFrameCallback) {
          (screenVideo as any).requestVideoFrameCallback(() => {
            if (isCompositorActive) {
              const frame = new VideoFrame(screenVideo);
              engine.sendScreenFrame(frame);
              engine.updateState(compState);
              feedScreenFrames();
            }
          });
        } else {
          const frame = new VideoFrame(screenVideo);
          engine.sendScreenFrame(frame);
          engine.updateState(compState);
          requestAnimationFrame(feedScreenFrames);
        }
      };

      const feedWebcamFrames = () => {
        if (!isCompositorActive || !webcamVideo) return;

        if ((webcamVideo as any).requestVideoFrameCallback) {
          (webcamVideo as any).requestVideoFrameCallback(() => {
            if (isCompositorActive) {
              const frame = new VideoFrame(webcamVideo);
              engine.sendWebcamFrame(frame);
              feedWebcamFrames();
            }
          });
        } else {
          const frame = new VideoFrame(webcamVideo);
          engine.sendWebcamFrame(frame);
          requestAnimationFrame(feedWebcamFrames);
        }
      };

      const cleanupWebcamUpdate = window.electronAPI?.onWebcamUpdate?.((data: any) => {
        if (!data || !isWindowMode) return;
        compState.webcam.visible = !!data.visible;
        compState.webcam.shape = data.shape || compState.webcam.shape;
        compState.webcam.scaleFactor = data.scaleFactor || 1;
        compState.webcam.name = data.name || compState.webcam.name;
        compState.webcam.borderColor = data.borderColor || compState.webcam.borderColor;
        if (data.bounds) {
          compState.webcam.bounds = data.bounds;
        }
      });
      window.electronAPI?.requestWebcamBroadcast?.();

      feedScreenFrames();
      feedWebcamFrames();
      engine.start();

      let proxyState: RecordingState = 'recording';
      const mediaRecorderProxy = {
        get state() {
          return proxyState;
        },
        stop: () => {
          if (proxyState === 'inactive') return;
          proxyState = 'inactive';
          isCompositorActive = false;
          onMessage('Finalizing video...');
          let pendingEditorLaunch: PendingEditorLaunch | null = null;

          void (async () => {
            try {
              await engine.stopAndFlush();
              if (chunksRef.current.length === 0) {
                onMessage('Recording failed: no data captured.');
                return;
              }

              const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
              pendingEditorLaunch = await finalizeRecordingBlob(videoBlob, targetSource);
            } catch (err) {
              onMessage(`Finalization failed: ${(err as Error).message}`);
              console.error('[RecordingManager] Error finalizing video:', err);
            } finally {
              cleanupWebcamUpdate?.();
              cleanupCaptureResources(screenVideo, webcamVideo);
              setRecordingActive(false);
              setActiveRecorder(null);
              if (pendingEditorLaunch) {
                window.electronAPI?.showVideoEditor(pendingEditorLaunch.filePath, pendingEditorLaunch.captureName);
              }
              if (stopReasonRef.current === 'recording_limit') {
                stopReasonRef.current = null;
                emitUpgradePrompt('recording_limit', 'Free plan ends at 3:00. Upgrade to Pro for unlimited recording.');
              }
            }
          })();
        }
      } as MediaRecorder & { _progressTimer?: ReturnType<typeof setInterval> };

      setActiveRecorder(mediaRecorderProxy);
      setRecordingActive(true);

      window.electronAPI?.showRecordingWidget({
        ...smartFeatures,
        bounds: sourceWindowBounds || undefined,
      });
      onMessage('Recording started!');
      window.electronAPI?.sendRecordingStatus?.(true);
      broadcastSourceStatus(true, !!shouldEnableWebcam, screenStream.getAudioTracks().length > 0);

      mediaRecorderProxy._progressTimer = startRecordingProgress(() => mediaRecorderProxy.stop(), maxRecordingSeconds);
    } catch (err) {
      console.error('Recording failed:', err);
      onMessage(`Failed: ${(err as Error).message}`);
      cleanupCaptureResources();
      setRecordingActive(false);
      setActiveRecorder(null);
      window.electronAPI?.sendRecordingStatus?.(false);
      window.electronAPI?.sendRecordingProgress?.(0);
    }
  }, [cleanupCaptureResources, emitUpgradePrompt, enableWebcam, finalizeRecordingBlob, getEntitlementState, onMessage, setActiveRecorder, setRecordingActive, startRecordingProgress]);

  const handleStopRecording = useCallback(() => {
    const activeRecorder = recorderRef.current;

    if (activeRecorder && activeRecorder.state !== 'inactive' && !(activeRecorder as any)._stopRequested) {
      (activeRecorder as any)._stopRequested = true;

      if ((activeRecorder as any)._progressTimer) {
        clearInterval((activeRecorder as any)._progressTimer);
      }
      if ((activeRecorder as any)._cleanupComposition) {
        (activeRecorder as any)._cleanupComposition();
      }
      activeRecorder.stop();
      setRecordingActive(false);
      window.electronAPI?.sendRecordingStatus?.(false);
      window.electronAPI?.sendRecordingProgress?.(0);
      broadcastSourceStatus(false, false, false);
    }
  }, [broadcastSourceStatus, setRecordingActive]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanupStop = window.electronAPI.onWidgetStopRecording?.(() => {
      handleStopRecording();
    });

    return () => cleanupStop?.();
  }, [handleStopRecording]);

  return { isRecording, handleStartRecording, handleStopRecording };
};




