"use client";

import { useEffect, useMemo, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  createLeaveRequest,
  fetchLeaveRequests,
  updateLeaveRequest,
} from "@/lib/api/leaveManagement";
import { formatDate } from "@/lib/numbering";
import { useAuth } from "@/contexts/AuthContext";
import type { LeaveRequest } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import { CalendarDays, Search } from "lucide-react";

const leaveOptions = ["TAHUNAN", "SAKIT", "MELAHIRKAN", "MENYUSUI", "LAINNYA"];
const statusOptions = ["ALL", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"];

const statusClass = (status: string) => {
  if (status === "APPROVED") return "bg-success text-success-foreground";
  if (status === "REJECTED") return "bg-destructive text-destructive-foreground";
  if (status === "CANCELLED") return "bg-muted text-muted-foreground";
  return "bg-warning text-warning-foreground";
};

type PendingAction = {
  row: LeaveRequest;
  nextStatus: string;
};

export default function LeaveManagementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();

  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [leaveType, setLeaveType] = useState("TAHUNAN");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchLeaveRequests(statusFilter === "ALL" ? undefined : statusFilter);
      setRows(
        [...data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
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
  };

  useEffect(() => {
    void loadData();
  }, [statusFilter]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.user?.name ?? "",
        row.leaveType,
        row.reason,
        row.status,
        formatDate(new Date(row.startDate)),
        formatDate(new Date(row.endDate)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery]);

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
      const created = await createLeaveRequest({
        leaveType,
        reason,
        startDate,
        endDate,
      });
      setRows((prev) => [created, ...prev]);
      setReason("");
      setStartDate("");
      setEndDate("");
      setLeaveType("TAHUNAN");
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
      if (isAdmin && status === "REJECTED") {
        payload.adminNote = "Perlu perbaikan data";
      }

      const updated = await updateLeaveRequest(row.id, payload);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      toast({ title: "Berhasil", description: `Status cuti diubah ke ${status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memperbarui status";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const actionText = (status: string) => {
    if (status === "APPROVED") return "approve";
    if (status === "REJECTED") return "reject";
    if (status === "CANCELLED") return "cancel";
    return "update";
  };

  return (
    <AdminLayout title="Leave Management">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pengajuan Cuti</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
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
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Selesai</Label>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Alasan</Label>
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Tuliskan alasan cuti"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Ajukan Cuti"}
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
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari pengajuan..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                        {isAdmin && <TableHead>User</TableHead>}
                        <TableHead>Jenis</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Alasan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Dibuat</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <CalendarDays className="h-8 w-8" />
                              <p>Belum ada pengajuan cuti</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRows.map((row) => (
                          <TableRow key={row.id}>
                            {isAdmin && <TableCell>{row.user?.name ?? "-"}</TableCell>}
                            <TableCell>{row.leaveType}</TableCell>
                            <TableCell>
                              {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                            </TableCell>
                            <TableCell className="max-w-[260px] truncate">{row.reason}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusClass(row.status)}>
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(new Date(row.createdAt))}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {isAdmin && row.status === "SUBMITTED" && (
                                  <>
                                    <Button size="sm" onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}>
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {!isAdmin && row.status === "SUBMITTED" && (
                                  <Button size="sm" variant="outline" onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {filteredRows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border py-8 text-muted-foreground">
                      <CalendarDays className="h-8 w-8" />
                      <p>Belum ada pengajuan cuti</p>
                    </div>
                  ) : (
                    filteredRows.map((row) => (
                      <div key={row.id} className="rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{row.leaveType}</p>
                            <p className="text-xs text-muted-foreground">
                              {isAdmin ? row.user?.name ?? "-" : "Pengajuan Saya"}
                            </p>
                          </div>
                          <Badge variant="outline" className={statusClass(row.status)}>
                            {row.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                        </p>
                        <p className="mt-2 text-sm">{row.reason}</p>
                        <div className="mt-3 flex justify-end gap-2">
                          {isAdmin && row.status === "SUBMITTED" && (
                            <>
                              <Button size="sm" onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}>
                                Reject
                              </Button>
                            </>
                          )}
                          {!isAdmin && row.status === "SUBMITTED" && (
                            <Button size="sm" variant="outline" onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ActionConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title="Konfirmasi Aksi"
        description={
          pendingAction
            ? `Yakin ingin ${actionText(pendingAction.nextStatus)} pengajuan ini?`
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
    </AdminLayout>
  );
}
