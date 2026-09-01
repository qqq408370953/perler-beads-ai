'use client';

import { ChangeEvent, CSSProperties, TouchEvent, useRef } from 'react';

type TouchGesture = {
  startX: number;
  startY: number;
  startValue: number;
  mode: 'pending' | 'horizontal' | 'vertical';
};

interface MobileSafeRangeProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onValueChange: (value: number) => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
}

const GESTURE_THRESHOLD = 8;

export default function MobileSafeRange({
  min,
  max,
  step = 1,
  value,
  onValueChange,
  className,
  style,
  ariaLabel,
}: MobileSafeRangeProps) {
  const touchGestureRef = useRef<TouchGesture | null>(null);
  const ignoreNativeChangeRef = useRef(false);

  const valueFromClientX = (clientX: number, input: HTMLInputElement) => {
    const rect = input.getBoundingClientRect();
    if (rect.width <= 0) return value;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const rawValue = min + ratio * (max - min);
    const stepCount = Math.round((rawValue - min) / step);
    const steppedValue = Math.min(max, Math.max(min, min + stepCount * step));
    const precision = String(step).includes('.') ? String(step).split('.')[1].length : 0;
    return Number(steppedValue.toFixed(precision));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (touchGestureRef.current || ignoreNativeChangeRef.current) {
      event.currentTarget.value = String(value);
      return;
    }
    onValueChange(Number(event.currentTarget.value));
  };

  const handleTouchStart = (event: TouchEvent<HTMLInputElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    touchGestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startValue: value,
      mode: 'pending',
    };
  };

  const handleTouchMove = (event: TouchEvent<HTMLInputElement>) => {
    const gesture = touchGestureRef.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;

    if (gesture.mode === 'pending' && Math.hypot(deltaX, deltaY) >= GESTURE_THRESHOLD) {
      gesture.mode = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
    }

    if (gesture.mode === 'vertical') {
      event.currentTarget.value = String(gesture.startValue);
      return;
    }

    if (gesture.mode === 'horizontal') {
      event.preventDefault();
      onValueChange(valueFromClientX(touch.clientX, event.currentTarget));
    }
  };

  const finishTouch = (event: TouchEvent<HTMLInputElement>) => {
    const gesture = touchGestureRef.current;
    if (!gesture) return;

    const touch = event.changedTouches[0];
    if (gesture.mode === 'pending' && touch) {
      onValueChange(valueFromClientX(touch.clientX, event.currentTarget));
    } else if (gesture.mode === 'vertical') {
      event.currentTarget.value = String(gesture.startValue);
    }

    touchGestureRef.current = null;
    ignoreNativeChangeRef.current = true;
    window.setTimeout(() => {
      ignoreNativeChangeRef.current = false;
    }, 0);
  };

  const cancelTouch = (event: TouchEvent<HTMLInputElement>) => {
    const gesture = touchGestureRef.current;
    if (gesture) event.currentTarget.value = String(gesture.startValue);
    touchGestureRef.current = null;
  };

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishTouch}
      onTouchCancel={cancelTouch}
      className={className}
      style={{ ...style, touchAction: 'pan-y' }}
      aria-label={ariaLabel}
    />
  );
}
