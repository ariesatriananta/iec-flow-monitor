"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Eye, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchOvertimeRequests } from "@/lib/api/overtime";
import { OvertimeForm } from "@/components/overtime/OvertimeForm";
import { OvertimeDetail } from "@/components/overtime/OvertimeDetail";
import { DateField, StatusBadge, dateLabel, durationLabel, overtimeError, statusLabels } from "@/components/overtime/shared";
import type { OvertimeRequest, OvertimeScope, OvertimeStatus } from "@/types/overtime";

const PAGE_SIZE = 20;
const scopeDescriptions: Record<OvertimeScope, string> = {
  mine: "Daftar sesi lembur yang Anda ajukan sendiri.",
  approval: "Pengajuan yang sedang menunggu persetujuan Anda pada level aktif.",
  related: "Seluruh pengajuan dengan penugasan Anda sebagai approver, termasuk yang sudah selesai.",
  all: "Seluruh pengajuan karyawan. Hak persetujuan tetap mengikuti approver yang ditugaskan.",
};

export default function OvertimePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [scope, setScope] = useState<OvertimeScope>("mine");
  const [status, setStatus] = useState<OvertimeStatus | "ALL">("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<OvertimeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);
  const invalidDates = !!(fromDate && toDate && fromDate > toDate);

  useEffect(() => {
    if (!user || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const entityId = new URLSearchParams(window.location.search).get("entityId");
    if (entityId) setDetailId(entityId);
  }, [user]);

  useEffect(() => {
    if (!user || invalidDates) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError("");
    fetchOvertimeRequests({ scope, ...(status === "ALL" ? {} : { status }), ...(fromDate ? { fromDate } : {}), ...(toDate ? { toDate } : {}), limit: PAGE_SIZE, offset })
      .then(result => {
        if (!active) return;
        if (!result.items.length && offset > 0 && result.total <= offset) { setOffset(Math.max(0, Math.floor((result.total - 1) / PAGE_SIZE) * PAGE_SIZE)); return; }
        setItems(result.items); setTotal(result.total);
      })
      .catch(reason => { if (active) { setItems([]); setTotal(0); setError(overtimeError(reason)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, scope, status, fromDate, toDate, offset, reload, invalidDates]);

  function changeScope(value: string) { setScope(value as OvertimeScope); setStatus("ALL"); setOffset(0); }
  function refresh() { setReload(value => value + 1); }
  function closeDetail() {
    setDetailId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("entityId")) { url.searchParams.delete("entityId"); window.history.replaceState(window.history.state, "", url); }
  }
  const canSubmit = !!user?.employeeId && user.employee?.isActive !== false;
  const tableColumns = scope === "mine" ? 6 : 7;
  const rowActions = (row: OvertimeRequest) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Aksi lembur ${row.employeeName}, ${dateLabel(row.overtimeDate)}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setDetailId(row.id)}>
          <Eye className="mr-2 h-4 w-4" />Lihat Detail
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return <AdminLayout title="Lembur"><div className="grid gap-6">
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <CardTitle>Daftar Pengajuan</CardTitle>
        <div className="flex w-full flex-col gap-2 md:w-auto md:max-w-full md:flex-row md:flex-wrap">
          <Button className="md:order-2" disabled={!canSubmit || authLoading} onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Ajukan Lembur</Button>
          <Select value={scope} onValueChange={changeScope}>
            <SelectTrigger className="w-full md:w-[220px]" aria-label="Daftar pengajuan"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Pengajuan Saya</SelectItem>
              <SelectItem value="approval">Perlu Persetujuan Saya</SelectItem>
              <SelectItem value="related">Riwayat Persetujuan</SelectItem>
              {user?.role === "ADMIN" && <SelectItem value="all">Semua Pengajuan</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={value => { setStatus(value as OvertimeStatus | "ALL"); setOffset(0); }}>
            <SelectTrigger className="w-full md:w-[180px]" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">Semua Status</SelectItem>{Object.entries(statusLabels).filter(([value]) => scope !== "approval" || value === "SUBMITTED" || value === "WAITING_LEVEL_2").map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
      {user && !canSubmit && <div role="status" className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{user.employeeId ? "Data karyawan Anda sedang nonaktif. Pengajuan baru tidak tersedia; pengajuan pending milik sendiri tetap dapat dibatalkan." : "Akun Anda belum terhubung dengan data karyawan. Hubungi Admin agar dapat mengajukan dan memproses lembur."}</div>}
      <p className="text-sm text-muted-foreground">{scopeDescriptions[scope]}</p>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="space-y-2"><Label>Dari tanggal lembur</Label><DateField value={fromDate} onChange={value => { setFromDate(value); setOffset(0); }} label="Filter dari tanggal lembur" clearable /></div>
        <div className="space-y-2"><Label>Sampai tanggal lembur</Label><DateField value={toDate} onChange={value => { setToDate(value); setOffset(0); }} label="Filter sampai tanggal lembur" clearable /></div>
        <Button variant="outline" disabled={loading || invalidDates} onClick={refresh}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat Ulang</Button>
        <Button variant="outline" disabled={status === "ALL" && !fromDate && !toDate} onClick={() => { setStatus("ALL"); setFromDate(""); setToDate(""); setOffset(0); }}>Reset Filter</Button>
      </div>
      {invalidDates && <p role="alert" className="text-sm text-destructive">Tanggal akhir tidak boleh lebih awal dari tanggal mulai.</p>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" onClick={refresh}>Coba lagi</Button></div>}
      <div className="hidden rounded-md border md:block" aria-busy={loading}>
        <Table className="min-w-[720px]"><TableHeader><TableRow>{scope !== "mine" && <TableHead>Pengaju</TableHead>}<TableHead>Tanggal</TableHead><TableHead>Client</TableHead><TableHead>Jam Lembur (WIB)</TableHead><TableHead>Durasi</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>
          {loading ? Array.from({ length: 5 }, (_, index) => <TableRow key={index}>{Array.from({ length: tableColumns }, (__, column) => <TableCell key={column}><Skeleton className="h-5 w-full min-w-12" /></TableCell>)}</TableRow>) : invalidDates ? <TableRow><TableCell colSpan={tableColumns} className="h-40 text-center text-muted-foreground">Sesuaikan filter tanggal untuk menampilkan pengajuan.</TableCell></TableRow> : !error && !items.length ? <TableRow><TableCell colSpan={tableColumns} className="h-52 text-center"><ClipboardList className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" /><p className="font-medium">{scope === "approval" ? "Tidak ada pengajuan yang perlu Anda proses" : "Belum ada pengajuan"}</p><p className="mt-1 text-sm text-muted-foreground">{status !== "ALL" || fromDate || toDate ? "Coba ubah atau reset filter pencarian." : scope === "mine" ? "Mulai dengan tombol Ajukan Lembur di atas." : "Pengajuan yang sesuai akan tampil di sini."}</p></TableCell></TableRow> : items.map(row => <TableRow key={row.id}>
            {scope !== "mine" && <TableCell className="max-w-48"><p className="break-words font-medium">{row.employeeName}</p><p className="text-xs text-muted-foreground">{row.employeeCode}</p></TableCell>}
            <TableCell className="whitespace-nowrap">{dateLabel(row.overtimeDate)}</TableCell><TableCell className="min-w-36 max-w-64 whitespace-normal break-words">{row.clientName}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{row.startTime}–{row.endTime}{row.endsNextDay && <span className="ml-1 text-xs text-muted-foreground">(+1 hari)</span>}</TableCell><TableCell className="whitespace-nowrap">{durationLabel(row.durationMinutes)}</TableCell><TableCell><StatusBadge status={row.status} /></TableCell><TableCell className="text-right">{rowActions(row)}</TableCell>
          </TableRow>)}
        </TableBody></Table>
      </div>
      <div className="space-y-3 md:hidden" aria-busy={loading}>
        {loading ? Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-32 w-full" />) : invalidDates ? <p className="py-8 text-center text-sm text-muted-foreground">Sesuaikan filter tanggal untuk menampilkan pengajuan.</p> : !error && !items.length ? <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground"><ClipboardList className="h-8 w-8" /><p>{scope === "approval" ? "Tidak ada pengajuan yang perlu Anda proses" : "Belum ada pengajuan"}</p></div> : items.map(row => (
          <div key={row.id} className="rounded-md border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="break-words font-medium">{row.clientName}</p>{scope !== "mine" && <p className="mt-1 break-words text-sm text-muted-foreground">{row.employeeName}</p>}<p className="mt-1 text-sm text-muted-foreground">{dateLabel(row.overtimeDate)}</p></div>
              {rowActions(row)}
            </div>
            <div className="mt-3 grid gap-2 text-sm"><p>{row.startTime}–{row.endTime} WIB{row.endsNextDay ? " (+1 hari)" : ""} · {durationLabel(row.durationMinutes)}</p><div><StatusBadge status={row.status} /></div></div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">{loading ? "Memuat pengajuan..." : invalidDates || error ? "—" : total ? `Menampilkan ${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} dari ${total} data` : "Menampilkan 0 dari 0 data"}</p>
        <div className="flex items-center gap-2"><Button variant="outline" disabled={loading || invalidDates || offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Prev</Button><Button variant="outline" disabled={loading || invalidDates || offset + PAGE_SIZE >= total} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next</Button></div>
      </div>
    </CardContent></Card>
    {createOpen && user && <OvertimeForm user={user} onClose={() => setCreateOpen(false)} onCreated={row => { setCreateOpen(false); setScope("mine"); setStatus("ALL"); setFromDate(""); setToDate(""); setOffset(0); refresh(); setDetailId(row.id); toast({ title: "Pengajuan berhasil dikirim", description: "Pengajuan Anda sedang menunggu persetujuan Level 1." }); }} />}
    {detailId && <OvertimeDetail key={detailId} id={detailId} canAct={user?.employee?.isActive !== false} onClose={closeDetail} onChanged={() => { refresh(); toast({ title: "Pengajuan berhasil diperbarui" }); }} />}
  </div></AdminLayout>;
}
