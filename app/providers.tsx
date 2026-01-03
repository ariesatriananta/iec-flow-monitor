"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { RouteLoadingProvider } from "@/contexts/RouteLoadingContext";
import { GlobalAudioProvider } from "@/contexts/GlobalAudioContext";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <RouteLoadingProvider>
            <AuthProvider>
              <GlobalAudioProvider>
                <Toaster />
                <Sonner />
                {children}
              </GlobalAudioProvider>
            </AuthProvider>
          </RouteLoadingProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
