"use client";

import { useEffect, useState } from "react";
import { getPuterStatus } from "@/lib/puter";

// Puter sign-in status polling for the chat surfaces, extracted from
// useAiChat.ts (T-011a). Canonical status from lib/puter (spec 041 P1.7 —
// the assistant previously kept a divergent copy that ignored the
// unavailable-until cooldown).
export function usePuterSignInStatus(): boolean {
  const [isPuterSignedIn, setIsPuterSignedIn] = useState(false);
  useEffect(() => {
    const check = () => {
      const status = getPuterStatus();
      setIsPuterSignedIn(status.isSignedIn);
    };
    check();
    const id = setInterval(check, 5000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', check);
    };
  }, []);
  return isPuterSignedIn;
}
