import { useEffect, useRef } from 'react';
import type { Track } from 'livekit-client';

export default function LiveVideo({ track, className = '' }: { track?: Track; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} className={className} autoPlay playsInline muted />;
}
