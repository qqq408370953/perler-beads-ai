'use client';

import { useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type FloatingPosition = { x: number; y: number };

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
};

const POSITION_STORAGE_KEY = 'perler-pwa-install-position';
const SCREEN_MARGIN = 8;

function clampPosition(x: number, y: number, width: number, height: number): FloatingPosition {
  return {
    x: Math.min(Math.max(SCREEN_MARGIN, x), Math.max(SCREEN_MARGIN, window.innerWidth - width - SCREEN_MARGIN)),
    y: Math.min(Math.max(SCREEN_MARGIN, y), Math.max(SCREEN_MARGIN, window.innerHeight - height - SCREEN_MARGIN)),
  };
}

export default function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      console.log('PWA 安装提示已准备');
      setSupportsPWA(true);
      setPromptInstall(e);
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);

    // 检查是否已安装
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!supportsPWA || isInstalled) return;

    const placeButton = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      let nextPosition: FloatingPosition | null = null;

      try {
        const savedPosition = localStorage.getItem(POSITION_STORAGE_KEY);
        if (savedPosition) {
          const parsedPosition = JSON.parse(savedPosition) as Partial<FloatingPosition>;
          if (Number.isFinite(parsedPosition.x) && Number.isFinite(parsedPosition.y)) {
            nextPosition = clampPosition(parsedPosition.x!, parsedPosition.y!, rect.width, rect.height);
          }
        }
      } catch (error) {
        console.warn('读取安装按钮位置失败:', error);
      }

      setPosition(nextPosition ?? clampPosition(
        window.innerWidth - rect.width - 24,
        window.innerHeight - rect.height - 24,
        rect.width,
        rect.height
      ));
    };

    const frameId = window.requestAnimationFrame(placeButton);
    const handleResize = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setPosition(currentPosition => {
        if (!currentPosition) return currentPosition;
        const nextPosition = clampPosition(currentPosition.x, currentPosition.y, rect.width, rect.height);
        localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition));
        return nextPosition;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [supportsPWA, isInstalled]);

  const onClick = async (evt: React.MouseEvent) => {
    evt.preventDefault();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
    const { outcome } = await promptInstall.userChoice;
    if (outcome === 'accepted') {
      setPromptInstall(null);
      setSupportsPWA(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      lastX: rect.left,
      lastY: rect.top,
      moved: false,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const nextPosition = clampPosition(
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY,
      rect.width,
      rect.height
    );
    const movedDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);

    dragState.lastX = nextPosition.x;
    dragState.lastY = nextPosition.y;
    dragState.moved = dragState.moved || movedDistance > 5;
    setPosition(nextPosition);
  };

  const finishDragging = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finalPosition = { x: dragState.lastX, y: dragState.lastY };
    if (dragState.moved) {
      suppressClickRef.current = true;
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(finalPosition));
    }

    dragStateRef.current = null;
    setIsDragging(false);
  };

  if (isInstalled) {
    return null;
  }

  if (!supportsPWA) {
    return null;
  }

  return (
    <button
      ref={buttonRef}
      className={`fixed z-50 flex h-12 min-w-12 touch-none select-none items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 p-3 text-white shadow-lg transition-shadow duration-200 hover:shadow-xl sm:h-auto sm:px-6 sm:py-3 ${isDragging ? 'cursor-grabbing shadow-2xl' : 'cursor-grab'}`}
      style={position ? { left: position.x, top: position.y } : { right: 24, bottom: 24 }}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDragging}
      onPointerCancel={finishDragging}
      aria-label="安装应用，可拖动到任意位置"
      title="安装应用 · 可拖动"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-4-4m4 4l4-4M5 12h14" />
      </svg>
      <span className="hidden sm:inline">安装应用</span>
    </button>
  );
}
