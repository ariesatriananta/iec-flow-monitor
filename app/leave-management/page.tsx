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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  createLeaveRequest,
  deleteLeaveRequest,
  fetchLeaveRequests,
  updateLeaveRequest,
} from "@/lib/api/leaveManagement";
import { fetchApprovalFlowSettings } from "@/lib/api/settings";
import { formatDate } from "@/lib/numbering";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { LeaveRequest, WorkflowEvent } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { CalendarDays, CalendarIcon, CheckCircle2, Eye, MoreHorizontal, Plus, Search, Trash2, XCircle } from "lucide-react";

const leaveOptions = ["TAHUNAN", "SAKIT", "MELAHIRKAN", "MENYUSUI", "LAINNYA"];
const statusOptions = ["ALL", "SUBMITTED", "WAITING_LEVEL_2", "APPROVED", "REJECTED", "CANCELLED"];

const statusClass = (status: string) => {
  if (status === "APPROVED") return "bg-success text-success-foreground";
  if (status === "REJECTED") return "bg-destructive text-destructive-foreground";
  if (status === "CANCELLED") return "bg-muted text-muted-foreground";
  return "bg-warning text-warning-foreground";
};

const parseDateKeyToDate = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const formatActorLabel = (event?: WorkflowEvent | null) => {
  if (!event) return "-";
  const name = event.actorEmployee?.fullName ?? event.actorUser?.name ?? "-";
  const title = event.actorEmployee?.title ?? null;
  return [name, title].filter(Boolean).join(" - ");
};

const formatEventDateTime = (event?: WorkflowEvent | null) => {
  if (!event) return "-";
  return format(new Date(event.createdAt), "dd MMM yyyy HH:mm");
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

type PendingAction = {
  row: LeaveRequest;
  nextStatus: string;
};

export default function LeaveManagementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<LeaveRequest | null>(null);
  const [autoOpenedEntityId, setAutoOpenedEntityId] = useState<string | null>(null);
  const [highlightedEntityId, setHighlightedEntityId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveRequest | null>(null);
  const [leaveApprovalLevels, setLeaveApprovalLevels] = useState<1 | 2>(2);
  const [approverLevel1EmployeeId, setApproverLevel1EmployeeId] = useState<string | null>(null);
  const [approverLevel2EmployeeId, setApproverLevel2EmployeeId] = useState<string | null>(null);
  const [approverLevel1Label, setApproverLevel1Label] = useState("-");
  const [approverLevel2Label, setApproverLevel2Label] = useState("-");
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  const [leaveType, setLeaveType] = useState("TAHUNAN");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchLeaveRequests({
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
        description: "Gagal memuat data cuti",
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
        setLeaveApprovalLevels(settings.leaveApprovalLevels);
        setApproverLevel1EmployeeId(settings.leaveApproverLevel1EmployeeId);
        setApproverLevel2EmployeeId(settings.leaveApproverLevel2EmployeeId);
        setApproverLevel1Label(
          [
            settings.leaveApproverLevel1Employee?.fullName ?? "Approver belum diatur",
            settings.leaveApproverLevel1Employee?.title ?? null,
          ]
            .filter(Boolean)
            .join(" - ")
        );
        setApproverLevel2Label(
          [
            settings.leaveApproverLevel2Employee?.fullName ?? "Approver belum diatur",
            settings.leaveApproverLevel2Employee?.title ?? null,
          ]
            .filter(Boolean)
            .join(" - ")
        );
      } catch {
        setLeaveApprovalLevels(2);
        setApproverLevel1EmployeeId(null);
        setApproverLevel2EmployeeId(null);
        setApproverLevel1Label("-");
        setApproverLevel2Label("-");
      }
    })();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const notifEntityId = searchParams.get("entityId");
  useEffect(() => {
    if (!notifEntityId) {
      setAutoOpenedEntityId(null);
      setHighlightedEntityId(null);
      return;
    }
    if (isLoading || autoOpenedEntityId === notifEntityId) return;
    const target = rows.find((row) => row.id === notifEntityId);
    if (!target) return;
    setDetailRow(target);
    setAutoOpenedEntityId(notifEntityId);
    setHighlightedEntityId(notifEntityId);
    const timer = window.setTimeout(() => {
      setHighlightedEntityId((prev) => (prev === notifEntityId ? null : prev));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notifEntityId, isLoading, autoOpenedEntityId, rows]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim() || !startDate || !endDate) {
      toast({
        title: "Error",
        description: "Lengkapi data pengajuan cuti",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await createLeaveRequest({
        leaveType,
        reason,
        startDate,
        endDate,
      });
      setIsCreateDialogOpen(false);
      setReason("");
      setStartDate("");
      setEndDate("");
      setLeaveType("TAHUNAN");
      if (page === 1) {
        await loadData();
      } else {
        setPage(1);
      }
      toast({ title: "Berhasil", description: "Pengajuan cuti berhasil dibuat" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengajukan cuti";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (row: LeaveRequest, status: string) => {
    try {
      const payload: Record<string, unknown> = { status };
      if (isApprover && status === "REJECTED") {
        payload.adminNote = "Perlu perbaikan data";
      }

      const updated = await updateLeaveRequest(row.id, payload);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      toast({ title: "Berhasil", description: `Status cuti diubah ke ${updated.status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memperbarui status";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleHardDelete = async (row: LeaveRequest) => {
    try {
      await deleteLeaveRequest(row.id);
      if (rows.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadData();
      }
      setTotal((prev) => Math.max(0, prev - 1));
      toast({ title: "Berhasil", description: "Pengajuan cuti berhasil dihapus permanen" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menghapus pengajuan cuti";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === "WAITING_LEVEL_2") return "WAITING L2";
    return status;
  };

  const isApproverLevel1 = Boolean(user?.employeeId) && user?.employeeId === approverLevel1EmployeeId;
  const isApproverLevel2 =
    leaveApprovalLevels === 2 &&
    Boolean(user?.employeeId) &&
    user?.employeeId === approverLevel2EmployeeId;
  const isApprover = isApproverLevel1 || isApproverLevel2;
  const showRequesterColumn = isAdmin || isApprover;
  const canAdminProcess = (status: string) => status === "SUBMITTED" || status === "WAITING_LEVEL_2";

  const getApproveButtonLabel = (status: string) => {
    if (status === "SUBMITTED" && leaveApprovalLevels === 2) return "Setujui L1";
    if (status === "WAITING_LEVEL_2") return "Setujui L2";
    return "Setujui";
  };

  const actionText = (status: string) => {
    if (status === "APPROVED") return "menyetujui";
    if (status === "REJECTED") return "menolak";
    if (status === "CANCELLED") return "membatalkan";
    return "memperbarui";
  };

  const getTrackingLabel = (row: LeaveRequest) => {
    if (row.status === "SUBMITTED") return "Menunggu approval level 1";
    if (row.status === "WAITING_LEVEL_2") return "Approval level 1 selesai, menunggu level 2";
    if (row.status === "APPROVED") return "Pengajuan sudah disetujui final";
    if (row.status === "REJECTED") return "Pengajuan ditolak";
    if (row.status === "CANCELLED") return "Pengajuan dibatalkan";
    return "Status pengajuan sedang diproses";
  };

  const getTrackingMessage = (row: LeaveRequest) => {
    const events = row.workflowEvents ?? [];
    const cancelEvent = findLatestEvent(events, (event) => event.action === "CANCELLED");
    const rejectEvent = findLatestEvent(events, (event) => event.toStatus === "REJECTED");

    if (cancelEvent) {
      return `Pengajuan dibatalkan oleh ${formatActorLabel(cancelEvent)} pada ${formatEventDateTime(
        cancelEvent
      )}`;
    }
    if (rejectEvent) {
      return `Pengajuan ditolak oleh ${formatActorLabel(rejectEvent)} pada ${formatEventDateTime(
        rejectEvent
      )}`;
    }
    return getTrackingLabel(row);
  };

  return (
    <AdminLayout title="Leave Management">
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Daftar Pengajuan</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Button
                type="button"
                onClick={() => setIsCreateDialogOpen(true)}
                className="md:order-2"
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajukan Cuti
              </Button>
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
                        <TableHead>Jenis</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Alasan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Dibuat</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={showRequesterColumn ? 7 : 6} className="py-8 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <CalendarDays className="h-8 w-8" />
                              <p>Belum ada pengajuan cuti</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => (
                          <TableRow
                            key={row.id}
                            className={cn(
                              highlightedEntityId === row.id &&
                                "bg-amber-100/70 dark:bg-amber-900/25 transition-colors duration-300"
                            )}
                          >
                            {showRequesterColumn && <TableCell>{row.employee?.fullName ?? row.user?.name ?? "-"}</TableCell>}
                            <TableCell>{row.leaveType}</TableCell>
                            <TableCell>
                              {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                            </TableCell>
                            <TableCell className="max-w-[260px] truncate">{row.reason}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusClass(row.status)}>
                                {getStatusLabel(row.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(new Date(row.createdAt))}</TableCell>
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
                                      <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                      {getApproveButtonLabel(row.status)}
                                    </DropdownMenuItem>
                                  )}
                                  {isApprover && canAdminProcess(row.status) && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                    >
                                      <XCircle className="mr-2 h-4 w-4 text-destructive" />
                                      Tolak
                                    </DropdownMenuItem>
                                  )}
                                  {!isAdmin && row.status === "SUBMITTED" && row.employeeId === user?.employeeId && (
                                    <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                      Batalkan
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
                      <CalendarDays className="h-8 w-8" />
                      <p>Belum ada pengajuan cuti</p>
                    </div>
                  ) : (
                    rows.map((row) => (
                      <div
                        key={row.id}
                        className={cn(
                          "rounded-md border p-4 transition-colors duration-300",
                          highlightedEntityId === row.id &&
                            "border-amber-300 bg-amber-100/70 dark:border-amber-700 dark:bg-amber-900/25"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{row.leaveType}</p>
                            <p className="text-xs text-muted-foreground">
                              {showRequesterColumn ? row.employee?.fullName ?? row.user?.name ?? "-" : "Pengajuan Saya"}
                            </p>
                          </div>
                          <Badge variant="outline" className={statusClass(row.status)}>
                            {getStatusLabel(row.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                        </p>
                        <p className="mt-2 text-sm">{row.reason}</p>
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
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                  {getApproveButtonLabel(row.status)}
                                </DropdownMenuItem>
                              )}
                              {isApprover && canAdminProcess(row.status) && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                >
                                  <XCircle className="mr-2 h-4 w-4 text-destructive" />
                                  Tolak
                                </DropdownMenuItem>
                              )}
                              {!isAdmin && row.status === "SUBMITTED" && row.employeeId === user?.employeeId && (
                                <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                  Batalkan
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

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[640px] p-6">
            <DialogHeader>
              <DialogTitle>Pengajuan Cuti</DialogTitle>
              <DialogDescription>
                Isi data pengajuan cuti untuk dikirim ke approver.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Jenis Cuti</Label>
                <Select value={leaveType} onValueChange={setLeaveType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tanggal Mulai</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(parseDateKeyToDate(startDate) ?? new Date(startDate), "dd MMM yyyy") : "Pilih tanggal mulai"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDateKeyToDate(startDate)}
                      onSelect={(date) => {
                        if (!date) {
                          setStartDate("");
                          return;
                        }
                        setStartDate(format(date, "yyyy-MM-dd"));
                        if (endDate && new Date(format(date, "yyyy-MM-dd")) > new Date(endDate)) {
                          setEndDate("");
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Tanggal Selesai</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(parseDateKeyToDate(endDate) ?? new Date(endDate), "dd MMM yyyy") : "Pilih tanggal selesai"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDateKeyToDate(endDate)}
                      onSelect={(date) => {
                        if (!date) {
                          setEndDate("");
                          return;
                        }
                        setEndDate(format(date, "yyyy-MM-dd"));
                      }}
                      disabled={(date) => {
                        if (!startDate) return false;
                        const start = parseDateKeyToDate(startDate);
                        if (!start) return false;
                        return date < start;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Alasan</Label>
                <Textarea
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Tuliskan alasan cuti"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isSaving}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Ajukan Cuti"}
                </Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailRow)} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[680px] max-h-[85vh] p-0 flex flex-col">
          <DialogHeader className="border-b border-border/60 px-4 py-4 sm:px-6 sm:py-5">
            <DialogTitle>Detail Pengajuan Cuti</DialogTitle>
            <DialogDescription>
              Informasi pengajuan dan progres approval cuti.
            </DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-4">
              {(() => {
                const events = detailRow.workflowEvents ?? [];
                const submittedEvent = findLatestEvent(events, (event) => event.action === "SUBMITTED");
                const level1Event = findLatestEvent(
                  events,
                  (event) =>
                    event.level === 1 &&
                    (event.action === "APPROVED_L1" || event.action === "REJECTED_L1")
                );
                const level2Event = findLatestEvent(
                  events,
                  (event) =>
                    event.level === 2 &&
                    (event.action === "APPROVED_L2" || event.action === "REJECTED_L2")
                );

                return (
                  <>
              <div className="grid gap-3 rounded-lg border p-3 text-sm md:grid-cols-2 md:p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Karyawan</p>
                  <p className="text-sm font-medium">{detailRow.employee?.fullName ?? detailRow.user?.name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Jenis Cuti</p>
                  <p className="text-sm font-medium">{detailRow.leaveType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Periode</p>
                  <p className="text-sm font-medium">
                    {formatDate(new Date(detailRow.startDate))} - {formatDate(new Date(detailRow.endDate))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusClass(detailRow.status)}>
                    {getStatusLabel(detailRow.status)}
                  </Badge>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Alasan</p>
                  <p className="text-sm font-medium break-words">{detailRow.reason}</p>
                </div>
              </div>

              <div className="rounded-lg border p-3 md:p-4">
                <p className="mb-3 text-sm font-semibold md:text-base">Tracking Progress Approval</p>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span>Submitted</span>
                      <p className="text-xs text-muted-foreground">
                        {formatActorLabel(submittedEvent)} - {formatEventDateTime(submittedEvent)}
                      </p>
                    </div>
                    <Badge variant="outline">DONE</Badge>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span>Approval Level 1: {approverLevel1Label}</span>
                      {level1Event && (
                        <p className="text-xs text-muted-foreground">
                          {formatActorLabel(level1Event)} - {formatEventDateTime(level1Event)}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={statusClass(detailRow.status === "SUBMITTED" ? "SUBMITTED" : detailRow.status === "CANCELLED" ? "CANCELLED" : detailRow.status === "REJECTED" ? "REJECTED" : "APPROVED")}>
                      {detailRow.status === "SUBMITTED"
                        ? "PENDING"
                        : detailRow.status === "WAITING_LEVEL_2" || detailRow.status === "APPROVED"
                          ? "APPROVED"
                          : detailRow.status === "REJECTED"
                            ? "REJECTED"
                            : detailRow.status === "CANCELLED"
                              ? "CANCELLED"
                              : "PENDING"}
                    </Badge>
                  </div>
                  {leaveApprovalLevels === 2 && (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span>Approval Level 2: {approverLevel2Label}</span>
                        {level2Event && (
                          <p className="text-xs text-muted-foreground">
                            {formatActorLabel(level2Event)} - {formatEventDateTime(level2Event)}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={statusClass(
                          detailRow.status === "WAITING_LEVEL_2"
                            ? "SUBMITTED"
                            : detailRow.status === "APPROVED"
                              ? "APPROVED"
                              : detailRow.status === "REJECTED"
                                ? "REJECTED"
                                : detailRow.status === "CANCELLED"
                                  ? "CANCELLED"
                                  : "SUBMITTED"
                        )}
                      >
                        {detailRow.status === "WAITING_LEVEL_2"
                          ? "PENDING"
                          : detailRow.status === "APPROVED"
                            ? "APPROVED"
                            : detailRow.status === "REJECTED"
                              ? "REJECTED"
                              : detailRow.status === "CANCELLED"
                                ? "CANCELLED"
                                : "NOT STARTED"}
                      </Badge>
                    </div>
                  )}
                  <div className="rounded-md bg-muted/50 p-3 text-muted-foreground">
                    {getTrackingMessage(detailRow)}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3 md:p-4">
                <p className="mb-3 text-sm font-semibold md:text-base">Riwayat Aksi</p>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada riwayat aksi.</p>
                ) : (
                  <div className="relative pl-6 text-sm">
                    <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                    {[...events].reverse().map((event) => (
                      <div key={event.id} className="relative pb-4 last:pb-0">
                        <span
                          className={cn(
                            "absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2",
                            getEventDotClass(event)
                          )}
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
                            {formatActorLabel(event)} - {formatEventDateTime(event)}
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
                  </>
                );
              })()}
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
        description={
          pendingAction
            ? `Yakin ingin ${actionText(pendingAction.nextStatus)} pengajuan ini dari status ${getStatusLabel(
                pendingAction.row.status
              )}?`
            : ""
        }
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
            ? `Yakin ingin menghapus permanen pengajuan ${deleteTarget.leaveType} milik ${deleteTarget.employee?.fullName ?? deleteTarget.user?.name ?? "-" }? Aksi ini tidak bisa dibatalkan.`
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

