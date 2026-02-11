"use client";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface FeatureComingSoonProps {
  title: string;
  description: string;
}

export function FeatureComingSoon({ title, description }: FeatureComingSoonProps) {
  return (
    <AdminLayout title={title}>
      <Card className="max-w-3xl border border-border/70">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="bg-primary/10 text-primary">
            Coming Soon
          </Badge>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
