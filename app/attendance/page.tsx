"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fetchAttendance, submitAttendance } from "@/lib/api/attendance";
import { formatDate } from "@/lib/numbering";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { AttendanceRecord } from "@/types";
import { format } from "date-fns";
import { CalendarCheck2, CalendarIcon, Download, Eye, LogIn, LogOut, Search, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
};

const toDayKey = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const parseDateKeyToDate = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const formatJakartaTime = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);

type PendingAttendanceAction = {
  action: "CHECK_IN" | "CHECK_OUT";
  triggerTime: Date;
};

type GeoTagPoint = {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: string | null;
};

const getCurrentGeoPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      reject(new Error("Browser tidak mendukung geolocation"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });

const parseGeoTag = (raw?: string | null): GeoTagPoint | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GeoTagPoint;
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      accuracy:
        parsed.accuracy !== undefined ? Number(parsed.accuracy) : undefined,
      timestamp: parsed.timestamp ?? null,
    };
  } catch {
    return null;
  }
};

const buildEmbedMapUrl = (checkIn: GeoTagPoint | null, checkOut: GeoTagPoint | null) => {
  if (checkIn && checkOut) {
    return `https://maps.google.com/maps?output=embed&saddr=${checkIn.lat},${checkIn.lng}&daddr=${checkOut.lat},${checkOut.lng}`;
  }
  const point = checkIn ?? checkOut;
  if (!point) return "";
  return `https://maps.google.com/maps?output=embed&q=${point.lat},${point.lng}`;
};

const buildPointMapUrl = (point: GeoTagPoint | null) => {
  if (!point) return "";
  return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
};

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();

  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAttendanceAction | null>(null);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | undefined>(undefined);
  const [detailRow, setDetailRow] = useState<AttendanceRecord | null>(null);
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);
  const employeeId = user?.employeeId ?? null;

  const refreshTodayRecord = useCallback(async () => {
    if (!employeeId) {
      setTodayRecord(undefined);
      return;
    }

    const day = toDayKey(new Date());
    try {
      const data = await fetchAttendance({
        employeeId,
        from: day,
        to: day,
        limit: 1,
        offset: 0,
      });
      setTodayRecord(data.items[0]);
    } catch (error) {
      setTodayRecord(undefined);
    }
  }, [employeeId]);

  const loadAttendance = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAttendance({
        from: dateFrom || undefined,
        to: dateTo || undefined,
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
        description: "Gagal memuat data absensi",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, debouncedSearch, page, toast]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, debouncedSearch]);

  useEffect(() => {
    void refreshTodayRecord();
  }, [refreshTodayRecord]);

  const openConfirmation = (action: "CHECK_IN" | "CHECK_OUT") => {
    setConfirmNotes("");
    setPendingAction({
      action,
      triggerTime: new Date(),
    });
  };

  const handleSubmit = async () => {
    if (!pendingAction) return;
    setIsSubmitting(true);
    try {
      const position = await getCurrentGeoPosition();
      const geoPayload = JSON.stringify({
        lat: Number(position.coords.latitude.toFixed(7)),
        lng: Number(position.coords.longitude.toFixed(7)),
        accuracy: Number(position.coords.accuracy.toFixed(1)),
        timestamp: new Date().toISOString(),
      });

      await submitAttendance({
        action: pendingAction.action,
        location: geoPayload,
        notes: confirmNotes.trim() || undefined,
      });
      toast({
        title: "Berhasil",
        description:
          pendingAction.action === "CHECK_IN"
            ? "Check-in berhasil"
            : "Check-out berhasil",
      });
      setPendingAction(null);
      setConfirmNotes("");
      await Promise.all([loadAttendance(), refreshTodayRecord()]);
    } catch (error) {
      let message = error instanceof Error ? error.message : "Aksi absensi gagal";
      const geoCode =
        typeof error === "object" && error && "code" in error
          ? Number((error as { code?: unknown }).code)
          : null;
      if (geoCode !== null) {
        if (geoCode === 1) {
          message = "Absensi ditolak karena izin lokasi tidak diberikan";
        } else if (geoCode === 2) {
          message = "Lokasi tidak tersedia. Pastikan GPS aktif";
        } else if (geoCode === 3) {
          message = "Pengambilan lokasi timeout. Coba lagi";
        }
      }
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasLinkedEmployee = Boolean(employeeId);
  const canCheckIn = hasLinkedEmployee && !todayRecord?.checkInAt;
  const canCheckOut = hasLinkedEmployee && Boolean(todayRecord?.checkInAt && !todayRecord?.checkOutAt);

  const handleExportAttendance = async () => {
    if (!isAdmin) {
      toast({
        title: "Akses ditolak",
        description: "Export attendance hanya untuk admin",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const allRows: AttendanceRecord[] = [];
      let offset = 0;
      const limit = 100;
      const search = debouncedSearch.length >= 2 ? debouncedSearch : undefined;

      while (true) {
        const data = await fetchAttendance({
          from: dateFrom || undefined,
          to: dateTo || undefined,
          q: search,
          limit,
          offset,
        });

        allRows.push(...data.items);
        if (!data.hasMore || data.items.length === 0) break;
        offset = (data.nextOffset ?? offset + data.items.length) as number;
      }

      if (allRows.length === 0) {
        toast({
          title: "Info",
          description: "Tidak ada data absensi untuk diexport",
        });
        return;
      }

      const exportRows = allRows.map((row) => {
        const checkInGeo = parseGeoTag(row.checkInLocation);
        const checkOutGeo = parseGeoTag(row.checkOutLocation);
        return {
          Employee:
            row.employee?.fullName ?? row.user?.name ?? user?.employee?.fullName ?? "-",
          NIP: row.employee?.nip ?? "-",
          Department: row.employee?.department ?? "-",
          Title: row.employee?.title ?? "-",
          Date: formatDate(new Date(row.attendanceDate)),
          "Check In": formatDateTime(row.checkInAt),
          "Check Out": formatDateTime(row.checkOutAt),
          Status: row.status,
          Notes: row.notes?.trim() ? row.notes : "-",
          "Check In Lat": checkInGeo?.lat ?? "",
          "Check In Lng": checkInGeo?.lng ?? "",
          "Check Out Lat": checkOutGeo?.lat ?? "",
          "Check Out Lng": checkOutGeo?.lng ?? "",
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");

      const suffixFrom = dateFrom || "all";
      const suffixTo = dateTo || "all";
      const fileName = `attendance-${suffixFrom}-to-${suffixTo}.xlsx`;
      XLSX.writeFile(workbook, fileName, { bookType: "xlsx" });

      toast({
        title: "Berhasil",
        description: `Export attendance selesai (${allRows.length} baris)`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export attendance gagal";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AdminLayout title="Attendance">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Absensi Hari Ini</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Button
                  size="lg"
                  className="h-14 text-base font-semibold md:h-16 md:text-lg"
                  disabled={!canCheckIn || isSubmitting}
                  onClick={() => openConfirmation("CHECK_IN")}
                >
                  <LogIn className="mr-2 h-5 w-5 md:h-6 md:w-6" />
                  Check In
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base font-semibold md:h-16 md:text-lg"
                  disabled={!canCheckOut || isSubmitting}
                  onClick={() => openConfirmation("CHECK_OUT")}
                >
                  <LogOut className="mr-2 h-5 w-5 md:h-6 md:w-6" />
                  Check Out
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Lokasi absensi akan diambil otomatis dari geolocation perangkat.
              </p>
              {!hasLinkedEmployee && (
                <p className="text-xs text-muted-foreground">
                  Akun ini belum terhubung ke data employee, jadi belum bisa check in/check out.
                </p>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Status hari ini</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Tanggal</span>
                  <span className="font-medium">{formatDate(new Date())}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Check In</span>
                  <span className="font-medium">{formatDateTime(todayRecord?.checkInAt ?? null)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Check Out</span>
                  <span className="font-medium">{formatDateTime(todayRecord?.checkOutAt ?? null)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <Badge variant="outline" className="bg-primary/10 text-primary">
                    {todayRecord?.status ?? "BELUM ABSEN"}
                  </Badge>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span>Catatan</span>
                  <span className="max-w-[65%] text-right font-medium break-words">
                    {todayRecord?.notes?.trim() ? todayRecord.notes : "-"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Riwayat Absensi</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              <div className="relative md:w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari riwayat..."
                  className="pl-9"
                />
              </div>
              <div className="flex w-full gap-2 md:w-auto">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal md:w-[170px]",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(parseDateKeyToDate(dateFrom)!, "dd/MM/yyyy") : "Dari tanggal"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDateKeyToDate(dateFrom)}
                      onSelect={(value) => {
                        setDateFrom(value ? format(value, "yyyy-MM-dd") : "");
                        setPage(1);
                      }}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-10 w-10 md:h-10 md:w-10", !dateFrom && "invisible")}
                  onClick={() => {
                    setDateFrom("");
                    setPage(1);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex w-full gap-2 md:w-auto">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal md:w-[170px]",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(parseDateKeyToDate(dateTo)!, "dd/MM/yyyy") : "Sampai tanggal"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDateKeyToDate(dateTo)}
                      onSelect={(value) => {
                        setDateTo(value ? format(value, "yyyy-MM-dd") : "");
                        setPage(1);
                      }}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-10 w-10 md:h-10 md:w-10", !dateTo && "invisible")}
                  onClick={() => {
                    setDateTo("");
                    setPage(1);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleExportAttendance()}
                  disabled={isExporting}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? "Exporting..." : "Export Excel"}
                </Button>
              )}
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
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Check In</TableHead>
                        <TableHead>Check Out</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 6 : 5} className="py-8 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <CalendarCheck2 className="h-8 w-8" />
                              <p>Belum ada data absensi</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => (
                          <TableRow key={row.id}>
                            {isAdmin && (
                              <TableCell>{row.employee?.fullName ?? row.user?.name ?? "-"}</TableCell>
                            )}
                            <TableCell>{formatDate(new Date(row.attendanceDate))}</TableCell>
                            <TableCell>{formatDateTime(row.checkInAt)}</TableCell>
                            <TableCell>{formatDateTime(row.checkOutAt)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-primary/10 text-primary">
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDetailRow(row)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Detail
                              </Button>
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
                      <CalendarCheck2 className="h-8 w-8" />
                      <p>Belum ada data absensi</p>
                    </div>
                  ) : (
                    rows.map((row) => (
                      <div key={row.id} className="rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{formatDate(new Date(row.attendanceDate))}</p>
                            <p className="text-xs text-muted-foreground">
                              {isAdmin
                                ? row.employee?.fullName ?? row.user?.name ?? "-"
                                : "Absensi Saya"}
                            </p>
                          </div>
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            {row.status}
                          </Badge>
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                          <p>In: {formatDateTime(row.checkInAt)}</p>
                          <p>Out: {formatDateTime(row.checkOutAt)}</p>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDetailRow(row)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Detail
                          </Button>
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
      <Dialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setPendingAction(null);
            setConfirmNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              Konfirmasi {pendingAction?.action === "CHECK_IN" ? "Check In" : "Check Out"}
            </DialogTitle>
            <DialogDescription>
              Anda akan{" "}
              {pendingAction?.action === "CHECK_IN" ? "check in" : "check out"} pada pukul{" "}
              {pendingAction ? formatJakartaTime(pendingAction.triggerTime) : "-"} WIB.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border p-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Nama:</span>{" "}
                <span className="font-medium">
                  {user?.employee?.fullName ?? user?.name ?? "-"}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">NIP:</span>{" "}
                <span className="font-medium">{user?.employee?.nip ?? "-"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Title:</span>{" "}
                <span className="font-medium">{user?.employee?.title ?? "-"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Dept:</span>{" "}
                <span className="font-medium">{user?.employee?.department ?? "-"}</span>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Catatan (opsional)</p>
            <Textarea
              value={confirmNotes}
              onChange={(event) => setConfirmNotes(event.target.value)}
              rows={3}
              placeholder="Tambahkan catatan jika diperlukan"
              disabled={isSubmitting}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingAction(null);
                setConfirmNotes("");
              }}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? "Memproses..." : "Ya, Lanjutkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(detailRow)}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
      >
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Absensi</DialogTitle>
            <DialogDescription>
              Informasi karyawan dan detail check in/check out.
            </DialogDescription>
          </DialogHeader>
          {detailRow && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md border p-4 text-sm">
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Informasi Karyawan</p>
                  <div className="space-y-1">
                    <p>
                      <span className="text-muted-foreground">Nama:</span>{" "}
                      <span className="font-medium">
                        {detailRow.employee?.fullName ?? detailRow.user?.name ?? "-"}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">NIP:</span>{" "}
                      <span className="font-medium">{detailRow.employee?.nip ?? "-"}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Title:</span>{" "}
                      <span className="font-medium">{detailRow.employee?.title ?? "-"}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Dept:</span>{" "}
                      <span className="font-medium">{detailRow.employee?.department ?? "-"}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Email:</span>{" "}
                      <span className="font-medium">{detailRow.employee?.email ?? "-"}</span>
                    </p>
                  </div>
                </div>
                <div className="rounded-md border p-4 text-sm">
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Informasi Absensi</p>
                  <div className="space-y-1">
                    <p>
                      <span className="text-muted-foreground">Tanggal:</span>{" "}
                      <span className="font-medium">
                        {formatDate(new Date(detailRow.attendanceDate))}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Check In:</span>{" "}
                      <span className="font-medium">{formatDateTime(detailRow.checkInAt)}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Check Out:</span>{" "}
                      <span className="font-medium">{formatDateTime(detailRow.checkOutAt)}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <span className="font-medium">{detailRow.status}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Catatan:</span>{" "}
                      <span className="font-medium">
                        {detailRow.notes?.trim() ? detailRow.notes : "-"}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              {(() => {
                const checkInGeo = parseGeoTag(detailRow.checkInLocation);
                const checkOutGeo = parseGeoTag(detailRow.checkOutLocation);
                const mapUrl = buildEmbedMapUrl(checkInGeo, checkOutGeo);
                return (
                  <div className="rounded-md border p-4">
                    <p className="mb-3 text-sm font-medium">Geotag Check In / Check Out</p>
                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <p>
                        Check In:{" "}
                        {checkInGeo
                          ? `${checkInGeo.lat.toFixed(6)}, ${checkInGeo.lng.toFixed(6)}`
                          : "-"}
                      </p>
                      <p>
                        Check Out:{" "}
                        {checkOutGeo
                          ? `${checkOutGeo.lat.toFixed(6)}, ${checkOutGeo.lng.toFixed(6)}`
                          : "-"}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                        disabled={!checkInGeo}
                      >
                        <a
                          href={buildPointMapUrl(checkInGeo) || "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Buka Check In
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                        disabled={!checkOutGeo}
                      >
                        <a
                          href={buildPointMapUrl(checkOutGeo) || "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Buka Check Out
                        </a>
                      </Button>
                    </div>
                    {mapUrl ? (
                      <div className="mt-3 overflow-hidden rounded-md border">
                        <iframe
                          src={mapUrl}
                          title="Attendance geotag map"
                          className="h-[320px] w-full"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Geotag belum tersedia pada record ini.
                      </p>
                    )}
                  </div>
                );
              })()}
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailRow(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

