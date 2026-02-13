"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useAuth } from "@/contexts/AuthContext";
import type { AttendanceRecord } from "@/types";
import { CalendarCheck2, LogIn, LogOut, Search } from "lucide-react";

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

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();

  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | undefined>(undefined);
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
        status: statusFilter !== "ALL" ? statusFilter : undefined,
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
  }, [dateFrom, dateTo, statusFilter, debouncedSearch, page, toast]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, statusFilter, debouncedSearch]);

  useEffect(() => {
    void refreshTodayRecord();
  }, [refreshTodayRecord]);

  const handleSubmit = async (action: "CHECK_IN" | "CHECK_OUT") => {
    setIsSubmitting(true);
    try {
      await submitAttendance({
        action,
        location: location || undefined,
        notes: notes || undefined,
      });
      toast({
        title: "Berhasil",
        description: action === "CHECK_IN" ? "Check-in berhasil" : "Check-out berhasil",
      });
      setNotes("");
      await Promise.all([loadAttendance(), refreshTodayRecord()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Aksi absensi gagal";
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

  return (
    <AdminLayout title="Attendance">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Absensi Hari Ini</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Lokasi</Label>
                <Input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Contoh: Kantor Jakarta"
                />
              </div>
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Opsional"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!canCheckIn || isSubmitting}
                  onClick={() => void handleSubmit("CHECK_IN")}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Check In
                </Button>
                <Button
                  variant="outline"
                  disabled={!canCheckOut || isSubmitting}
                  onClick={() => void handleSubmit("CHECK_OUT")}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Check Out
                </Button>
              </div>
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
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  <SelectItem value="PRESENT">PRESENT</SelectItem>
                  <SelectItem value="SICK">SICK</SelectItem>
                  <SelectItem value="LEAVE">LEAVE</SelectItem>
                  <SelectItem value="ABSENT">ABSENT</SelectItem>
                </SelectContent>
              </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setPage(1);
                  }}
                  className="w-full md:w-[150px]"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setPage(1);
                  }}
                  className="w-full md:w-[150px]"
                />
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
                        <TableHead>Lokasi Masuk</TableHead>
                        <TableHead>Lokasi Pulang</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-muted-foreground">
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
                            <TableCell>{row.checkInLocation ?? "-"}</TableCell>
                            <TableCell>{row.checkOutLocation ?? "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-primary/10 text-primary">
                                {row.status}
                              </Badge>
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
                          <p>Lokasi In: {row.checkInLocation ?? "-"}</p>
                          <p>Lokasi Out: {row.checkOutLocation ?? "-"}</p>
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
    </AdminLayout>
  );
}

