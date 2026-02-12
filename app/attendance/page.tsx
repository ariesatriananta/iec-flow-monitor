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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { fetchAttendance, submitAttendance } from "@/lib/api/attendance";
import { fetchUsers } from "@/lib/api/users";
import { formatDate } from "@/lib/numbering";
import { useAuth } from "@/contexts/AuthContext";
import type { AttendanceRecord, User } from "@/types";
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
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("ALL");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadAttendance = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAttendance({
        userId: isAdmin && selectedUserId !== "ALL" ? selectedUserId : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setRows(
        [...data].sort(
          (a, b) =>
            new Date(b.attendanceDate).getTime() - new Date(a.attendanceDate).getTime()
        )
      );
      if (isAdmin && users.length === 0) {
        const userRows = await fetchUsers();
        setUsers(userRows);
      }
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
  };

  useEffect(() => {
    void loadAttendance();
  }, [isAdmin, selectedUserId, dateFrom, dateTo]);

  const todayRecord = useMemo(() => {
    if (isAdmin && selectedUserId === "ALL") return undefined;
    const todayKey = toDayKey(new Date());
    return rows.find((item) => toDayKey(new Date(item.attendanceDate)) === todayKey);
  }, [isAdmin, rows, selectedUserId]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        row.user?.name ?? "",
        formatDate(new Date(row.attendanceDate)),
        row.checkInLocation ?? "",
        row.checkOutLocation ?? "",
        row.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery, statusFilter]);

  const handleSubmit = async (action: "CHECK_IN" | "CHECK_OUT") => {
    setIsSubmitting(true);
    try {
      await submitAttendance({
        action,
        location: location || undefined,
        notes: notes || undefined,
        userId: isAdmin && selectedUserId !== "ALL" ? selectedUserId : undefined,
      });
      toast({
        title: "Berhasil",
        description: action === "CHECK_IN" ? "Check-in berhasil" : "Check-out berhasil",
      });
      setNotes("");
      await loadAttendance();
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

  const canCheckIn = !todayRecord?.checkInAt;
  const canCheckOut = Boolean(todayRecord?.checkInAt && !todayRecord?.checkOutAt);
  const actionBlockedByUserSelection = isAdmin && selectedUserId === "ALL";

  return (
    <AdminLayout title="Attendance">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Absensi Hari Ini</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {isAdmin && (
                <div className="space-y-2">
                  <Label>User</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua User</SelectItem>
                      {users.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                  disabled={actionBlockedByUserSelection || !canCheckIn || isSubmitting}
                  onClick={() => void handleSubmit("CHECK_IN")}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Check In
                </Button>
                <Button
                  variant="outline"
                  disabled={actionBlockedByUserSelection || !canCheckOut || isSubmitting}
                  onClick={() => void handleSubmit("CHECK_OUT")}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Check Out
                </Button>
              </div>
              {actionBlockedByUserSelection && (
                <p className="text-xs text-muted-foreground">
                  Pilih user tertentu untuk melakukan check in/check out sebagai admin.
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
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari riwayat..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-full md:w-[150px]"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
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
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <CalendarCheck2 className="h-8 w-8" />
                              <p>Belum ada data absensi</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRows.map((row) => (
                          <TableRow key={row.id}>
                            {isAdmin && <TableCell>{row.user?.name ?? "-"}</TableCell>}
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
                  {filteredRows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border py-8 text-muted-foreground">
                      <CalendarCheck2 className="h-8 w-8" />
                      <p>Belum ada data absensi</p>
                    </div>
                  ) : (
                    filteredRows.map((row) => (
                      <div key={row.id} className="rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{formatDate(new Date(row.attendanceDate))}</p>
                            <p className="text-xs text-muted-foreground">
                              {isAdmin ? row.user?.name ?? "-" : "Absensi Saya"}
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
