"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  createBusinessTrip,
  deleteBusinessTrip,
  fetchBusinessTrips,
  updateBusinessTrip,
} from "@/lib/api/businessTrip";
import { fetchApprovalFlowSettings } from "@/lib/api/settings";
import { formatDate } from "@/lib/numbering";
import { useAuth } from "@/contexts/AuthContext";
import type { BusinessTrip, WorkflowEvent } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import { Eye, MoreHorizontal, PlaneTakeoff, Search, Trash2 } from "lucide-react";

const statusOptions = ["ALL", "SUBMITTED", "WAITING_LEVEL_2", "APPROVED", "REJECTED", "CANCELLED"];

const statusClass = (status: string) => {
  if (status === "APPROVED") return "bg-success text-success-foreground";
  if (status === "REJECTED") return "bg-destructive text-destructive-foreground";
  if (status === "CANCELLED") return "bg-muted text-muted-foreground";
  return "bg-warning text-warning-foreground";
};

type PendingAction = {
  row: BusinessTrip;
  nextStatus: string;
};

const formatActorLabel = (event?: WorkflowEvent | null) => {
  if (!event) return "-";
  const name = event.actorEmployee?.fullName ?? event.actorUser?.name ?? "-";
  const title = event.actorEmployee?.title ?? null;
  return [name, title].filter(Boolean).join(" - ");
};

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const findLatestEvent = (
  events: WorkflowEvent[],
  predicate: (event: WorkflowEvent) => boolean
) => {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (predicate(events[i])) return events[i];
  }
  return null;
};

const getEventDotClass = (event: WorkflowEvent) => {
  if (event.toStatus === "APPROVED") return "border-success bg-success";
  if (event.toStatus === "REJECTED") return "border-destructive bg-destructive";
  if (event.toStatus === "CANCELLED") return "border-muted-foreground bg-muted-foreground";
  return "border-warning bg-warning";
};

const getEventActionLabel = (event: WorkflowEvent) => {
  switch (event.action) {
    case "SUBMITTED":
      return "Pengajuan dibuat";
    case "APPROVED_L1":
      return "Disetujui Level 1";
    case "APPROVED_L2":
      return "Disetujui Level 2";
    case "APPROVED":
      return "Disetujui";
    case "REJECTED_L1":
      return "Ditolak Level 1";
    case "REJECTED_L2":
      return "Ditolak Level 2";
    case "CANCELLED":
      return "Dibatalkan";
    case "MARKED_PAID":
      return "Ditandai Sudah Dibayar";
    case "HARD_DELETED":
      return "Dihapus Permanen";
    case "STATUS_CHANGED":
      return "Perubahan Status";
    default:
      return event.action;
  }
};

const getWorkflowStatusLabel = (status?: string | null) => {
  switch (status) {
    case "SUBMITTED":
      return "Diajukan";
    case "WAITING_LEVEL_2":
      return "Menunggu Level 2";
    case "APPROVED":
      return "Disetujui";
    case "REJECTED":
      return "Ditolak";
    case "CANCELLED":
      return "Dibatalkan";
    case "PAID":
      return "Dibayar";
    default:
      return status ?? "-";
  }
};

export default function BusinessTripPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();

  const [rows, setRows] = useState<BusinessTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessTrip | null>(null);
  const [detailRow, setDetailRow] = useState<BusinessTrip | null>(null);
  const [approvalLevels, setApprovalLevels] = useState<1 | 2>(2);
  const [approverLevel1EmployeeId, setApproverLevel1EmployeeId] = useState<string | null>(null);
  const [approverLevel2EmployeeId, setApproverLevel2EmployeeId] = useState<string | null>(null);
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  const [destinationCity, setDestinationCity] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchBusinessTrips({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        q: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Gagal memuat data perjalanan dinas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, debouncedSearch, page, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await fetchApprovalFlowSettings();
        setApprovalLevels(settings.businessTripApprovalLevels);
        setApproverLevel1EmployeeId(settings.businessTripApproverLevel1EmployeeId);
        setApproverLevel2EmployeeId(settings.businessTripApproverLevel2EmployeeId);
      } catch {
        setApprovalLevels(2);
        setApproverLevel1EmployeeId(null);
        setApproverLevel2EmployeeId(null);
      }
    })();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const isApproverLevel1 = Boolean(user?.employeeId) && user?.employeeId === approverLevel1EmployeeId;
  const isApproverLevel2 =
    approvalLevels === 2 &&
    Boolean(user?.employeeId) &&
    user?.employeeId === approverLevel2EmployeeId;
  const isApprover = isApproverLevel1 || isApproverLevel2;
  const showRequesterColumn = isAdmin || isApprover;
  const canAdminProcess = (status: string) => status === "SUBMITTED" || status === "WAITING_LEVEL_2";
  const getApproveButtonLabel = (status: string) => {
    if (status === "SUBMITTED" && approvalLevels === 2) return "Approve L1";
    if (status === "WAITING_LEVEL_2") return "Approve L2";
    return "Approve";
  };
  const getStatusLabel = (status: string) => (status === "WAITING_LEVEL_2" ? "WAITING L2" : status);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!destinationCity.trim() || !companyName.trim() || !startDate || !endDate) {
      toast({
        title: "Error",
        description: "Lengkapi data perjalanan dinas",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await createBusinessTrip({
        destinationCity,
        companyName,
        purpose: purpose || undefined,
        startDate,
        endDate,
      });
      setDestinationCity("");
      setCompanyName("");
      setPurpose("");
      setStartDate("");
      setEndDate("");
      if (page === 1) {
        await loadData();
      } else {
        setPage(1);
      }
      toast({ title: "Berhasil", description: "Pengajuan perjalanan dinas berhasil dibuat" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat pengajuan";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (row: BusinessTrip, status: string) => {
    try {
      const payload: Record<string, unknown> = { status };
      if (isApprover && status === "REJECTED") {
        payload.adminNote = "Perlu revisi data perjalanan";
      }

      const updated = await updateBusinessTrip(row.id, payload);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      toast({ title: "Berhasil", description: `Status diubah ke ${updated.status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memperbarui status";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleHardDelete = async (row: BusinessTrip) => {
    try {
      await deleteBusinessTrip(row.id);
      if (rows.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadData();
      }
      setTotal((prev) => Math.max(0, prev - 1));
      toast({ title: "Berhasil", description: "Pengajuan perjalanan dinas dihapus permanen" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menghapus pengajuan";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const actionText = (status: string) => {
    if (status === "APPROVED") return "approve";
    if (status === "REJECTED") return "reject";
    if (status === "CANCELLED") return "cancel";
    return "update";
  };

  const getTrackingMessage = (row: BusinessTrip) => {
    const events = row.workflowEvents ?? [];
    const cancelEvent = findLatestEvent(events, (event) => event.action === "CANCELLED");
    const rejectEvent = findLatestEvent(events, (event) => event.toStatus === "REJECTED");

    if (cancelEvent) {
      return `Pengajuan dibatalkan oleh ${formatActorLabel(cancelEvent)} pada ${formatDateTime(cancelEvent.createdAt)}`;
    }
    if (rejectEvent) {
      return `Pengajuan ditolak oleh ${formatActorLabel(rejectEvent)} pada ${formatDateTime(rejectEvent.createdAt)}`;
    }
    if (row.status === "WAITING_LEVEL_2") return "Approval level 1 selesai, menunggu level 2";
    if (row.status === "APPROVED") return "Pengajuan sudah disetujui final";
    if (row.status === "SUBMITTED") return "Menunggu approval level 1";
    return "Status pengajuan sedang diproses";
  };

  return (
    <AdminLayout title="Business Trip">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pengajuan Perjalanan Dinas</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Kota / Daerah Tujuan</Label>
                <Input
                  value={destinationCity}
                  onChange={(event) => setDestinationCity(event.target.value)}
                  placeholder="Bandung"
                />
              </div>
              <div className="space-y-2">
                <Label>Nama Perusahaan</Label>
                <Input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="PT Contoh"
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Berangkat</Label>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Pulang</Label>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tujuan / Rincian</Label>
                <Textarea
                  rows={3}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="Jelaskan tujuan perjalanan"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Ajukan Perjalanan"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Daftar Pengajuan</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <div className="relative md:w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari pengajuan..."
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "ALL" ? "Semua Status" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="hidden rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {showRequesterColumn && <TableHead>Pemohon</TableHead>}
                        <TableHead>Tujuan</TableHead>
                        <TableHead>Perusahaan</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Rincian</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={showRequesterColumn ? 7 : 6} className="py-8 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <PlaneTakeoff className="h-8 w-8" />
                              <p>Belum ada pengajuan perjalanan dinas</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => (
                          <TableRow key={row.id}>
                            {showRequesterColumn && <TableCell>{row.employee?.fullName ?? row.user?.name ?? "-"}</TableCell>}
                            <TableCell>{row.destinationCity}</TableCell>
                            <TableCell>{row.companyName}</TableCell>
                            <TableCell>
                              {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate">{row.purpose ?? "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusClass(row.status)}>
                                {getStatusLabel(row.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setDetailRow(row)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Lihat Detail
                                  </DropdownMenuItem>
                                  {isApprover && canAdminProcess(row.status) && (
                                    <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                      {getApproveButtonLabel(row.status)}
                                    </DropdownMenuItem>
                                  )}
                                  {isApprover && canAdminProcess(row.status) && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                    >
                                      Reject
                                    </DropdownMenuItem>
                                  )}
                                  {!isAdmin && row.status === "SUBMITTED" && (
                                    <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                      Cancel
                                    </DropdownMenuItem>
                                  )}
                                  {isAdmin && row.status === "CANCELLED" && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setDeleteTarget(row)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                      Delete Permanen
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border py-8 text-muted-foreground">
                      <PlaneTakeoff className="h-8 w-8" />
                      <p>Belum ada pengajuan perjalanan dinas</p>
                    </div>
                  ) : (
                    rows.map((row) => (
                      <div key={row.id} className="rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{row.destinationCity}</p>
                            <p className="text-xs text-muted-foreground">
                              {showRequesterColumn
                                ? row.employee?.fullName ?? row.user?.name ?? row.companyName
                                : row.companyName}
                            </p>
                            {showRequesterColumn && (
                              <p className="text-xs text-muted-foreground">{row.companyName}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={statusClass(row.status)}>
                            {getStatusLabel(row.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                        </p>
                        <p className="mt-2 text-sm">{row.purpose ?? "-"}</p>
                        <div className="mt-3 flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDetailRow(row)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Lihat Detail
                              </DropdownMenuItem>
                              {isApprover && canAdminProcess(row.status) && (
                                <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                  {getApproveButtonLabel(row.status)}
                                </DropdownMenuItem>
                              )}
                              {isApprover && canAdminProcess(row.status) && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                >
                                  Reject
                                </DropdownMenuItem>
                              )}
                              {!isAdmin && row.status === "SUBMITTED" && (
                                <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                  Cancel
                                </DropdownMenuItem>
                              )}
                              {isAdmin && row.status === "CANCELLED" && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(row)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                  Delete Permanen
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {total === 0
                      ? "Menampilkan 0 dari 0 data"
                      : `Menampilkan ${(page - 1) * PAGE_SIZE + 1}-${Math.min(
                          page * PAGE_SIZE,
                          total
                        )} dari ${total} data`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page <= 1}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPage((prev) => prev + 1)}
                      disabled={page * PAGE_SIZE >= total}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(detailRow)} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="sm:max-w-[760px] p-6">
          <DialogHeader>
            <DialogTitle>Detail Business Trip</DialogTitle>
            <DialogDescription>Informasi pengajuan dan riwayat aksi approval.</DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Pemohon</p>
                  <p className="font-medium">{detailRow.employee?.fullName ?? detailRow.user?.name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusClass(detailRow.status)}>
                    {getStatusLabel(detailRow.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Tujuan</p>
                  <p className="font-medium">{detailRow.destinationCity}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Perusahaan</p>
                  <p className="font-medium">{detailRow.companyName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Periode</p>
                  <p className="font-medium">
                    {formatDate(new Date(detailRow.startDate))} - {formatDate(new Date(detailRow.endDate))}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Diajukan</p>
                  <p className="font-medium">{formatDateTime(detailRow.createdAt)}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Rincian</p>
                  <p className="font-medium">{detailRow.purpose ?? "-"}</p>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-2 text-sm font-semibold">Tracking Progress Approval</p>
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  {getTrackingMessage(detailRow)}
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-3 text-sm font-semibold">Riwayat Aksi</p>
                {(detailRow.workflowEvents?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada riwayat aksi.</p>
                ) : (
                  <div className="relative pl-6 text-sm">
                    <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                    {[...(detailRow.workflowEvents ?? [])].reverse().map((event) => (
                      <div key={event.id} className="relative pb-4 last:pb-0">
                        <span
                          className={`absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 ${getEventDotClass(event)}`}
                        />
                        <div className="rounded-md border bg-card p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">
                              {getEventActionLabel(event)}
                            </p>
                            <Badge variant="outline" className={statusClass(event.toStatus ?? "SUBMITTED")}>
                              {getWorkflowStatusLabel(event.toStatus)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatActorLabel(event)} - {formatDateTime(event.createdAt)}
                          </p>
                          {event.note ? (
                            <p className="mt-1 text-xs text-muted-foreground">Catatan: {event.note}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title="Konfirmasi Aksi"
        description={pendingAction ? `Yakin ingin ${actionText(pendingAction.nextStatus)} pengajuan ini?` : ""}
        confirmLabel={pendingAction ? actionText(pendingAction.nextStatus).toUpperCase() : "Lanjutkan"}
        destructive={pendingAction?.nextStatus === "REJECTED"}
        onConfirm={() => {
          if (!pendingAction) return;
          void handleUpdateStatus(pendingAction.row, pendingAction.nextStatus);
          setPendingAction(null);
        }}
      />

      <ActionConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Konfirmasi Delete Permanen"
        description={
          deleteTarget
            ? `Yakin ingin menghapus permanen pengajuan perjalanan dinas ke ${deleteTarget.destinationCity}? Aksi ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel="DELETE PERMANEN"
        destructive
        onConfirm={() => {
          if (!deleteTarget) return;
          void handleHardDelete(deleteTarget);
        }}
      />
    </AdminLayout>
  );
}

