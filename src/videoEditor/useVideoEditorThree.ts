import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const useVideoEditorThree = (state: any) => {
    const {
        mediaLoaded, mediaType, cinematicMode, videoRef, threeContainerRef,
        threeRendererRef, threeSceneRef, threeCameraRef, videoTextureRef, videoPlaneRef,
        cameraTilt, cameraZoom, crop
    } = state;

    // Maintain refs for high-frequency values to avoid restarting the Three.js effect
    const tiltRef = useRef(cameraTilt);
    const zoomRef = useRef(cameraZoom);

    useEffect(() => {
        tiltRef.current = cameraTilt;
        zoomRef.current = cameraZoom;
    }, [cameraTilt, cameraZoom]);

    useEffect(() => {
        if (!mediaLoaded || mediaType !== 'video' || !threeContainerRef.current || !cinematicMode) return;

        console.log('[VideoEditor] Initializing Three.js Scene');
        const container = threeContainerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);
        threeRendererRef.current = renderer;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        threeSceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.z = 5;
        threeCameraRef.current = camera;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);

        if (videoRef.current) {
            const texture = new THREE.VideoTexture(videoRef.current);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.format = THREE.RGBAFormat;
            texture.colorSpace = THREE.SRGBColorSpace;
            videoTextureRef.current = texture;

            const geometry = new THREE.PlaneGeometry(6.4, 3.6);
            const material = new THREE.MeshBasicMaterial({ map: texture });
            const plane = new THREE.Mesh(geometry, material);
            scene.add(plane);
            videoPlaneRef.current = plane;
        }

        let frameId: number | null = null;
        let idleTimerId: number | null = null;
        const animate = () => {
            if (threeRendererRef.current && threeSceneRef.current && threeCameraRef.current) {
                const video = videoRef.current;
                const isVideoPlaying = !!video && !video.paused && !video.ended;
                let shouldRender = isVideoPlaying;

                if (cinematicMode) {
                    // Use ref values to avoid closure staleness and unnecessary re-initializations
                    const currentTilt = tiltRef.current;
                    const currentZoom = zoomRef.current;
                    const targetX = currentTilt.x * 0.5;
                    const targetY = currentTilt.y * 0.5;
                    const targetZ = 5 / currentZoom;
                    const deltaX = targetX - threeCameraRef.current.position.x;
                    const deltaY = targetY - threeCameraRef.current.position.y;
                    const deltaZ = targetZ - threeCameraRef.current.position.z;

                    shouldRender = shouldRender || Math.abs(deltaX) > 0.0005 || Math.abs(deltaY) > 0.0005 || Math.abs(deltaZ) > 0.0005;

                    threeCameraRef.current.position.x += deltaX * 0.05;
                    threeCameraRef.current.position.y += deltaY * 0.05;
                    threeCameraRef.current.position.z += deltaZ * 0.05;
                    threeCameraRef.current.lookAt(0, 0, 0);
                }

                if (shouldRender) {
                    threeRendererRef.current.render(threeSceneRef.current, threeCameraRef.current);
                }

                if (idleTimerId !== null) {
                    window.clearTimeout(idleTimerId);
                    idleTimerId = null;
                }

                if (shouldRender) {
                    frameId = requestAnimationFrame(animate);
                } else {
                    idleTimerId = window.setTimeout(() => {
                        frameId = requestAnimationFrame(animate);
                    }, 120);
                }
                return;
            }
            frameId = requestAnimationFrame(animate);
        };
        animate();

        const handleResize = () => {
            if (!threeContainerRef.current) return;
            const w = threeContainerRef.current.clientWidth;
            const h = threeContainerRef.current.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (frameId !== null) {
                cancelAnimationFrame(frameId);
            }
            if (idleTimerId !== null) {
                window.clearTimeout(idleTimerId);
            }
            if (threeRendererRef.current) {
                if (container.contains(threeRendererRef.current.domElement)) {
                    container.removeChild(threeRendererRef.current.domElement);
                }
                threeRendererRef.current.dispose();
                threeRendererRef.current = null;
            }
        };
    }, [mediaLoaded, mediaType, cinematicMode, videoRef, threeContainerRef, threeRendererRef, threeSceneRef, threeCameraRef, videoTextureRef, videoPlaneRef]);

    useEffect(() => {
        if (!cinematicMode || !videoTextureRef.current) return;
        const texture = videoTextureRef.current;
        const cropData = crop.appliedCrop;
        if (!cropData) {
            texture.repeat.set(1, 1);
            texture.offset.set(0, 0);
        } else {
            texture.repeat.set(cropData.width / 100, cropData.height / 100);
            texture.offset.set(cropData.x / 100, 1 - (cropData.y / 100 + cropData.height / 100));
        }
        texture.needsUpdate = true;
    }, [cinematicMode, crop.appliedCrop, videoTextureRef]);
};
