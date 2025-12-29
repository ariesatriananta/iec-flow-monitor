"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type RouteLoadingContextValue = {
  isRouteLoading: boolean;
  loadingHref: string | null;
  setRouteLoading: (href: string | null) => void;
};

const RouteLoadingContext = createContext<RouteLoadingContextValue | undefined>(
  undefined
);

export function RouteLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [loadingHref, setRouteLoading] = useState<string | null>(null);

  useEffect(() => {
    setRouteLoading(null);
  }, [pathname]);

  const value = useMemo(
    () => ({ isRouteLoading: loadingHref !== null, loadingHref, setRouteLoading }),
    [loadingHref]
  );

  return (
    <RouteLoadingContext.Provider value={value}>
      {children}
    </RouteLoadingContext.Provider>
  );
}

export function useRouteLoading() {
  const context = useContext(RouteLoadingContext);
  if (!context) {
    throw new Error("useRouteLoading must be used within RouteLoadingProvider");
  }
  return context;
}
