"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "iecnet-pwa-install-dismissed";
const IOS_HINT_KEY = "iecnet-pwa-ios-hint-dismissed";
const RESET_PROMPT_EVENT = "iecnet:pwa-reset-install-prompt";
const INSTALL_NOW_EVENT = "iecnet:pwa-install-now";

export function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBar, setShowInstallBar] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showStandaloneSplash, setShowStandaloneSplash] = useState(false);

  const isIos = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const installDismissed = localStorage.getItem(DISMISS_KEY) === "1";
    const iosHintDismissed = localStorage.getItem(IOS_HINT_KEY) === "1";

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (installDismissed) return;
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowInstallBar(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    if (isIos && !isStandalone && !iosHintDismissed) {
      setShowIosHint(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, [isIos, isStandalone]);

  useEffect(() => {
    const handleResetPrompt = () => {
      localStorage.removeItem(DISMISS_KEY);
      localStorage.removeItem(IOS_HINT_KEY);
      if (deferredPrompt) {
        setShowInstallBar(true);
        return;
      }
      if (isIos && !isStandalone) {
        setShowIosHint(true);
      }
    };

    window.addEventListener(RESET_PROMPT_EVENT, handleResetPrompt);
    return () => {
      window.removeEventListener(RESET_PROMPT_EVENT, handleResetPrompt);
    };
  }, [deferredPrompt, isIos, isStandalone]);

  useEffect(() => {
    const handleInstallNow = () => {
      localStorage.removeItem(DISMISS_KEY);
      localStorage.removeItem(IOS_HINT_KEY);
      if (deferredPrompt) {
        void (async () => {
          await deferredPrompt.prompt();
          const result = await deferredPrompt.userChoice;
          if (result.outcome !== "accepted") {
            localStorage.setItem(DISMISS_KEY, "1");
          }
          setDeferredPrompt(null);
          setShowInstallBar(false);
        })();
        return;
      }
      if (isIos && !isStandalone) {
        setShowIosHint(true);
      }
    };

    window.addEventListener(INSTALL_NOW_EVENT, handleInstallNow);
    return () => {
      window.removeEventListener(INSTALL_NOW_EVENT, handleInstallNow);
    };
  }, [deferredPrompt, isIos, isStandalone]);

  useEffect(() => {
    if (!isStandalone) return;
    setShowStandaloneSplash(true);
    const timer = window.setTimeout(() => {
      setShowStandaloneSplash(false);
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [isStandalone]);

  const dismissInstallBar = () => {
    setShowInstallBar(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const dismissIosHint = () => {
    setShowIosHint(false);
    localStorage.setItem(IOS_HINT_KEY, "1");
  };

  const onInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome !== "accepted") {
      localStorage.setItem(DISMISS_KEY, "1");
    }
    setDeferredPrompt(null);
    setShowInstallBar(false);
  };

  return (
    <>
      {showStandaloneSplash && (
        <div className="pwa-splash-overlay">
          <div className="pwa-splash-logo-wrap">
            <Image src="/logo.png" alt="IECNET" width={96} height={96} className="pwa-splash-logo" />
            <span className="pwa-splash-shine" />
          </div>
          <p className="pwa-splash-text">IECNET</p>
        </div>
      )}

      {showInstallBar && deferredPrompt && (
        <div className="fixed inset-x-3 bottom-3 z-[80] rounded-lg border border-border bg-card p-3 shadow-lg md:left-auto md:right-4 md:w-[420px]">
          <p className="text-sm font-semibold">Install aplikasi IECNET</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Install supaya akses lebih cepat dari home screen.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={dismissInstallBar}>
              Nanti
            </Button>
            <Button size="sm" onClick={() => void onInstallClick()}>
              Install
            </Button>
          </div>
        </div>
      )}

      {showIosHint && (
        <div className="fixed inset-x-3 bottom-3 z-[80] rounded-lg border border-border bg-card p-3 shadow-lg md:left-auto md:right-4 md:w-[420px]">
          <p className="text-sm font-semibold">Install aplikasi IECNET (iOS)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Buka menu Share di Safari, lalu pilih <strong>Add to Home Screen</strong>.
          </p>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={dismissIosHint}>
              Mengerti
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
