import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface Simple3DHeadProps {
    size: number;
}

export const Simple3DHead: React.FC<Simple3DHeadProps> = ({ size }) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const headCenterRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount) return;

        const updateHeadCenter = () => {
            const rect = currentMount.getBoundingClientRect();
            headCenterRef.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        };

        // Scene setup
        const scene = new THREE.Scene();

        // Camera setup
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.z = 4;

        // Renderer setup (transparent background, high quality)
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(size, size);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        currentMount.appendChild(renderer.domElement);
        updateHeadCenter();

        // Group to hold the head elements for synchronized rotation
        const headGroup = new THREE.Group();
        scene.add(headGroup);

        // 1. Base Head (Modern Liquid Glass Style)
        const headGeometry = new THREE.SphereGeometry(1.2, 28, 28);
        const headMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,          // Pristine white base
            emissive: 0x08101a,       // Very deep subtle slate internal shadow for depth
            roughness: 0.05,          // Liquid-smooth surface
            metalness: 0.1,
            transmission: 0.95,       // Maximum physical glass transparency
            ior: 1.52,                // Scientific Refractive index for glass/water
            thickness: 2.5,           // Volumetric thickness to bend background light
            clearcoat: 1.0,           // Ultra-high polish reflective coating
            clearcoatRoughness: 0.05, // Sharp mirror-like reflections
            transparent: true,
        });
        const headMesh = new THREE.Mesh(headGeometry, headMaterial);
        headGroup.add(headMesh);

        // 2. Visor (Dark, sleek visor like Eve from Wall-E)
        const visorGeometry = new THREE.CapsuleGeometry(0.3, 0.6, 8, 18);
        visorGeometry.rotateZ(Math.PI / 2);
        const visorMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x000000,
            roughness: 0.1,
            metalness: 0.8,
            clearcoat: 1.0,           // Glossy polished black ceramic/glass
            clearcoatRoughness: 0.1,
        });
        const visorMesh = new THREE.Mesh(visorGeometry, visorMaterial);
        visorMesh.position.set(0, 0.1, 1.05); // Protrude out front, slightly above middle
        headGroup.add(visorMesh);

        // 3. Glowing LED Eye
        const glowGeometry = new THREE.SphereGeometry(0.12, 12, 12);
        const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        glowMesh.position.set(0.15, 0.1, 1.32); // Slightly offset to the side for character
        headGroup.add(glowMesh);

        // Lighting engineered to beautifully illuminate translucent liquid glass
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);

        // Key light creates sharp specular highlight on the liquid surface
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(3, 5, 4);
        scene.add(dirLight);

        // BACK rim light shines THROUGH the glass volume via transmission (Looks incredible!)
        const rimLight = new THREE.PointLight(0x38bdf8, 4, 15);
        rimLight.position.set(-3, 1, -4);
        scene.add(rimLight);

        // Front fill light gently illuminates the shadows
        const fillLight = new THREE.PointLight(0xdbeafe, 1.5, 10);
        fillLight.position.set(-2, -1, 3);
        scene.add(fillLight);

        // Animation state
        let animationFrameId: number;
        let targetX = 0;
        let targetY = 0;

        // Mouse tracking logic focused strictly on menu interaction
        const handleMouseMove = (event: MouseEvent) => {
            const { x: headX, y: headY } = headCenterRef.current;
            
            const dx = event.clientX - headX;
            const dy = event.clientY - headY;
            
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Map 120 pixels (the distance to outer tools) to full rotation effort
            let rawX = dx / 120;
            let rawY = dy / 120;
            
            // Smoothly relax the head's rotation back to center when the cursor moves far away
            // No harsh snapping boundaries!
            if (distance > 150) {
                // Fades from 1.0 at 150px away down to 0 at 300px away 
                const decay = Math.max(0, 1.0 - (distance - 150) / 150);
                rawX *= decay;
                rawY *= decay;
            }
            
            // Lock maximum tracking angle boundaries
            targetX = Math.max(-1, Math.min(1, rawX));
            targetY = Math.max(-1, Math.min(1, -rawY)); // Invert Y for 3D coordinate mapping
        };
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        window.addEventListener('resize', updateHeadCenter);

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => updateHeadCenter())
            : null;
        resizeObserver?.observe(currentMount);

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);

            // Interpolate rotation towards the mouse target (Lerp)
            // Allow looking far to the side (Math.PI * 0.45 is almost 90 degrees)
            const targetRotationY = targetX * Math.PI * 0.45; 
            const targetRotationX = -targetY * Math.PI * 0.35; 

            // SUPER FAST tracking (0.4 lerp factor instead of 0.08)
            headGroup.rotation.y += (targetRotationY - headGroup.rotation.y) * 0.4;
            headGroup.rotation.x += (targetRotationX - headGroup.rotation.x) * 0.4;

            // Add a subtle, gentle floating breathing effect
            const time = performance.now() * 0.002;
            headGroup.position.y = Math.sin(time) * 0.05;

            renderer.render(scene, camera);
        };

        animate();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', updateHeadCenter);
            resizeObserver?.disconnect();
            cancelAnimationFrame(animationFrameId);
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
            // Cleanup WebGL resources cleanly
            renderer.dispose();
            headGeometry.dispose();
            headMaterial.dispose();
            visorGeometry.dispose();
            visorMaterial.dispose();
            glowGeometry.dispose();
            glowMaterial.dispose();
        };
    }, [size]);

    return (
        <div 
            ref={mountRef} 
            style={{ 
                width: size, 
                height: size, 
                pointerEvents: 'none', 
                zIndex: 10
            }} 
        />
    );
};
