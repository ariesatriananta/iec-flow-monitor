import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="grid gap-6" aria-label="Memuat halaman Overtime" aria-busy="true">
    <Card><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent className="space-y-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}</CardContent></Card>
  </div>;
}
