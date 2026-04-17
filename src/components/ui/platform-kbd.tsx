"use client";

import { useEffect, useState } from "react";
import { Kbd } from "./kbd";

/**
 * Renders platform-appropriate keyboard hints. Server/first-paint falls back
 * to the macOS symbol to avoid hydration flicker; swaps on mount.
 */
export function ModKey() {
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
  if (isMac === null) return <Kbd>⌘</Kbd>;
  return <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>;
}

export function EnterKey() {
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
  if (isMac === null) return <Kbd>↵</Kbd>;
  return <Kbd>{isMac ? "↵" : "Enter"}</Kbd>;
}
