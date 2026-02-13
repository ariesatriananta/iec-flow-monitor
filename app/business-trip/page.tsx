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
  createBusinessTrip,
  fetchBusinessTrips,
  updateBusinessTrip,
} from "@/lib/api/businessTrip";
import { fetchApprovalFlowSettings } from "@/lib/api/settings";
import { formatDate } from "@/lib/numbering";
import { useAuth } from "@/contexts/AuthContext";
import type { BusinessTrip } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import { PlaneTakeoff, Search } from "lucide-react";

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

  const actionText = (status: string) => {
    if (status === "APPROVED") return "approve";
    if (status === "REJECTED") return "reject";
    if (status === "CANCELLED") return "cancel";
    return "update";
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
                        {showRequesterColumn && <TableHead>User</TableHead>}
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
                              <div className="flex justify-end gap-2">
                                {isApprover && canAdminProcess(row.status) && (
                                  <>
                                    <Button size="sm" onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                      {getApproveButtonLabel(row.status)}
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
                        <div className="mt-3 flex justify-end gap-2">
                          {isApprover && canAdminProcess(row.status) && (
                            <>
                              <Button size="sm" onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                {getApproveButtonLabel(row.status)}
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
    </AdminLayout>
  );
}

