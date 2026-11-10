"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { fetchAuditLogs, type AuditLog } from "@/lib/api/audit-logs";

const PAGE_SIZE = 25;
const MODULES = ["CLIENT", "CONTRACT", "TERMIN", "INVOICE", "LETTER"];

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));

const formatDetails = (details: AuditLog["details"]) => {
  if (!details || Object.keys(details).length === 0) return "-";
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${String(value ?? "-")}`)
    .join(" · ");
};

export default function AuditLogsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchAuditLogs({
          page,
          limit: PAGE_SIZE,
          module: moduleFilter === "ALL" ? undefined : moduleFilter,
        });
        if (!active) return;
        setRows(result.data);
        setTotal(result.pagination.total);
      } catch (error) {
        if (!active) return;
        toast({
          title: "Gagal memuat audit log",
          description: error instanceof Error ? error.message : "Terjadi kesalahan.",
          variant: "destructive",
        });
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [moduleFilter, page, toast]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminLayout title="Audit Logs">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit Logs
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Riwayat perubahan data bisnis oleh pengguna.
            </p>
          </div>
          <Select
            value={moduleFilter}
            onValueChange={(value) => {
              setModuleFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Semua modul" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua modul</SelectItem>
              {MODULES.map((module) => (
                <SelectItem key={module} value={module}>
                  {module}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">Waktu</TableHead>
                  <TableHead>Modul</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Pengguna</TableHead>
                  <TableHead className="min-w-52">ID Data</TableHead>
                  <TableHead className="min-w-72">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 6 }).map((__, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                      Belum ada audit log.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(row.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline">{row.module}</Badge></TableCell>
                      <TableCell><Badge>{row.action}</Badge></TableCell>
                      <TableCell>{row.actorName}</TableCell>
                      <TableCell className="font-mono text-xs">{row.entityId ?? "-"}</TableCell>
                      <TableCell className="max-w-md whitespace-normal break-words text-sm text-muted-foreground">
                        {formatDetails(row.details)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">Total {total} aktivitas</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={isLoading || page <= 1} onClick={() => setPage((value) => value - 1)}>
                Sebelumnya
              </Button>
              <span>Halaman {page} dari {totalPages}</span>
              <Button variant="outline" size="sm" disabled={isLoading || page >= totalPages} onClick={() => setPage((value) => value + 1)}>
                Berikutnya
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
