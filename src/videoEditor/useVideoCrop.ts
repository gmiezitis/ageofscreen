import React from 'react';
import { useCrop } from './useCrop';

export const useVideoCrop = (
  videoRef: React.RefObject<HTMLVideoElement>,
  containerRef: React.RefObject<HTMLDivElement>
) => {
  return useCrop({
    videoRef,
    containerRef
  });
};
