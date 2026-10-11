"use client";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { PartSpec } from "@/lib/catalogue";
import { focusPart } from "@/lib/registry";

/** Re-render on an interval — for readouts of values that live outside React state. */
export function useTicker(ms = 200) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function Seg<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="row">
      <div className="lbl">
        <span>{label}</span>
      </div>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, t]) => (
          <button
            key={String(v)}
            id={`${id}-${v}`}
            type="button"
            aria-pressed={v === value}
            onClick={() => onChange(v)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  fmt,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <div className="row">
      <label htmlFor={id}>
        <span>{label}</span>
        <output>{fmt(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}

export function Check({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="chk">
      <input
        id={id}
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function Rocker({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="rock" aria-label={label} aria-pressed={on} onClick={onToggle}>
      <div className="body" />
      <span>{label}</span>
    </button>
  );
}

export type Reading = string | [string, "" | "bad" | "warnc"];
export function Readouts({ items }: { items: [string, Reading][] }) {
  return (
    <div className="readouts">
      {items.map(([l, r]) => {
        const [t, c] = Array.isArray(r) ? r : [r, ""];
        return (
          <div className="ro" key={l}>
            <span>{l}</span>
            <b className={c}>{t}</b>
          </div>
        );
      })}
    </div>
  );
}

export const Facts = ({ rows }: { rows: [ReactNode, ReactNode][] }) => (
  <dl className="facts">
    {rows.map(([k, v], i) => (
      <Frag key={i}>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </Frag>
    ))}
  </dl>
);
const Frag = ({ children }: { children: ReactNode }) => <>{children}</>;

export const Notes = ({ items }: { items: ReactNode[] }) => (
  <ul className="notes">
    {items.map((n, i) => (
      <li key={i}>{n}</li>
    ))}
  </ul>
);
export const Caution = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="caution">
    <strong>{title}</strong>
    {children}
  </div>
);
export const Small = ({ children }: { children: ReactNode }) => <p className="small">{children}</p>;
export const H3 = ({ children }: { children: ReactNode }) => <h3>{children}</h3>;
export const Ctl = ({ children }: { children: ReactNode }) => <div className="ctl">{children}</div>;
export const BtnRow = ({ children }: { children: ReactNode }) => <div className="btnrow">{children}</div>;

/** "Tap to locate": flies the camera to a part and highlights it briefly. Pass `cat.pinned(sys)`. */
export function PartsList({ parts }: { parts: PartSpec[] }) {
  return (
    <ul className="parts">
      {parts.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => focusPart(p.name!)}>
            <b>{p.name}</b>
            <span>{p.note}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Momentary button (pointer or keyboard), e.g. a spring-loaded switch position. `onDown` on press, `onUp(held)` on release;
 * `onHold` fires once after `holdMs`; `repeat` (ms) re-fires `onRepeat` (default `onDown`) while held (e.g. trim switches).
 * Losing focus or unmounting while held (Tab away, switching system or airplane) counts as a release.
 */
export interface HoldButtonProps {
  onDown?: () => void;
  onUp?: (held: boolean) => void;
  onHold?: () => void;
  holdMs?: number;
  repeat?: number;
  onRepeat?: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  pressed?: boolean;
  children: ReactNode;
}
export function HoldButton({
  onDown,
  onUp,
  onHold,
  holdMs = 500,
  repeat,
  onRepeat,
  className,
  disabled,
  title,
  ariaLabel,
  pressed,
  children,
}: HoldButtonProps) {
  const [down, setDown] = useState(false);
  const r = useRef({
    down: false,
    held: false,
    t: 0 as ReturnType<typeof setTimeout> | 0,
    i: 0 as ReturnType<typeof setInterval> | 0,
  });
  const stop = () => {
    clearTimeout(r.current.t || undefined);
    clearInterval(r.current.i || undefined);
    r.current.t = r.current.i = 0;
  };
  const upRef = useRef(onUp);
  upRef.current = onUp;
  useEffect(
    () => () => {
      stop();
      if (r.current.down) {
        r.current.down = false;
        upRef.current?.(r.current.held);
      }
    },
    [],
  );
  const press = () => {
    if (r.current.down || disabled) return;
    r.current.down = true;
    r.current.held = false;
    setDown(true);
    onDown?.();
    if (onHold)
      r.current.t = setTimeout(() => {
        r.current.held = true;
        onHold();
      }, holdMs);
    const again = onRepeat ?? onDown;
    if (repeat && again) r.current.i = setInterval(again, repeat);
  };
  const release = () => {
    if (!r.current.down) return;
    r.current.down = false;
    setDown(false);
    stop();
    onUp?.(r.current.held);
  };
  return (
    <button
      type="button"
      className={className}
      data-down={down}
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          press();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          release();
        }
      }}
    >
      {children}
    </button>
  );
}
