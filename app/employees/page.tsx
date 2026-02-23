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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { createEmployee, deleteEmployee, fetchEmployees, updateEmployee } from "@/lib/api/employees";
import { useAuth } from "@/contexts/AuthContext";
import type { Employee } from "@/types";
import { Eye, MoreHorizontal, Pencil, Plus, Search, Trash2, UserX, Users } from "lucide-react";

interface FormState {
  fullName: string;
  nip: string;
  gender: string;
  title: string;
  department: string;
  workLocation: string;
  phone: string;
  email: string;
  bankAccountName: string;
  bankAccountNumber: string;
  isActive: "true" | "false";
}

const TITLE_OPTIONS = [
  "Intern",
  "Junior Staff",
  "Mid-level Staff",
  "Senior Staff",
  "Supervisor",
  "Asst. Manager",
  "Senior Manager",
  "Partner",
  "Director",
] as const;

const DEPARTMENT_OPTIONS = [
  "Audit",
  "Finance & Accounting",
  "Administrasi",
  "Legal",
  "HR&GA",
  "Lainnya",
] as const;

const GENDER_OPTIONS = [
  { value: "MALE", label: "Laki-laki" },
  { value: "FEMALE", label: "Perempuan" },
] as const;

const initialForm: FormState = {
  fullName: "",
  nip: "",
  gender: "",
  title: "",
  department: "",
  workLocation: "",
  phone: "",
  email: "",
  bankAccountName: "",
  bankAccountNumber: "",
  isActive: "true",
};

export default function EmployeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [activateTarget, setActivateTarget] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const employeeRows = await fetchEmployees({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
      });
      setEmployees(employeeRows.items);
      setTotal(employeeRows.total);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Gagal memuat data karyawan",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingEmployee(null);
  };

  const formatGender = (gender?: string) =>
    gender === "MALE" ? "Laki-laki" : gender === "FEMALE" ? "Perempuan" : "-";

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      fullName: employee.fullName ?? "",
      nip: employee.nip ?? "",
      gender: employee.gender ?? "",
      title: employee.title ?? "",
      department: employee.department ?? "",
      workLocation: employee.workLocation ?? "",
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      bankAccountName: employee.bankAccountName ?? "",
      bankAccountNumber: employee.bankAccountNumber ?? "",
      isActive: employee.isActive ? "true" : "false",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const nip = form.nip.trim();
    if (!fullName || !nip || !form.gender || !form.title || !form.department) {
      toast({
        title: "Error",
        description: "Fullname, NIP, Gender, Title, dan Department wajib diisi",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingEmployee) {
        const updated = await updateEmployee(editingEmployee.id, {
          fullName,
          nip,
          gender: form.gender as "MALE" | "FEMALE",
          title: form.title || undefined,
          department: form.department || undefined,
          workLocation: form.workLocation || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          bankAccountName: form.bankAccountName || undefined,
          bankAccountNumber: form.bankAccountNumber || undefined,
          isActive: form.isActive === "true",
        });

        setEmployees((prev) =>
          prev.map((row) =>
            row.id === updated.id
              ? {
                  ...updated,
                  user: row.user,
                }
              : row
          )
        );

        toast({ title: "Berhasil", description: "Data employee diperbarui" });
      } else {
        const created = await createEmployee({
          fullName,
          nip,
          gender: form.gender as "MALE" | "FEMALE",
          title: form.title,
          department: form.department,
          workLocation: form.workLocation || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          bankAccountName: form.bankAccountName || undefined,
          bankAccountNumber: form.bankAccountNumber || undefined,
          isActive: form.isActive === "true",
        });

        setEmployees((prev) => [created, ...prev]);
        setTotal((prev) => prev + 1);
        toast({ title: "Berhasil", description: "Employee berhasil ditambahkan" });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan data employee",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionLoadingId(deleteTarget.id);
    try {
      await deleteEmployee(deleteTarget.id);
      setEmployees((prev) => prev.filter((row) => row.id !== deleteTarget.id));
      setTotal((prev) => Math.max(0, prev - 1));
      toast({ title: "Berhasil", description: "Employee berhasil dihapus" });
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast({
        title: "Gagal menghapus",
        description:
          error instanceof Error
            ? error.message
            : "Employee tidak bisa dihapus karena sudah dipakai transaksi/workflow",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setActionLoadingId(deactivateTarget.id);
    try {
      const updated = await updateEmployee(deactivateTarget.id, { isActive: false });
      setEmployees((prev) =>
        prev.map((row) =>
          row.id === updated.id
            ? {
                ...updated,
                user: row.user,
              }
            : row
        )
      );
      toast({ title: "Berhasil", description: "Employee berhasil dinonaktifkan" });
      setDeactivateTarget(null);
    } catch (error) {
      console.error(error);
      toast({
        title: "Gagal menonaktifkan",
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmActivate = async () => {
    if (!activateTarget) return;
    setActionLoadingId(activateTarget.id);
    try {
      const updated = await updateEmployee(activateTarget.id, { isActive: true });
      setEmployees((prev) =>
        prev.map((row) =>
          row.id === updated.id
            ? {
                ...updated,
                user: row.user,
              }
            : row
        )
      );
      toast({ title: "Berhasil", description: "Employee berhasil diaktifkan" });
      setActivateTarget(null);
    } catch (error) {
      console.error(error);
      toast({
        title: "Gagal mengaktifkan",
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Employees">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-44" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-8 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Employees">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Employee Directory</CardTitle>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <div className="relative md:w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Cari employee..."
                className="pl-9"
              />
            </div>
            {isAdmin && (
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Employee
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fullname</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8" />
                        <p>Belum ada data employee</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{employee.fullName ?? "-"}</p>
                          <p className="text-xs text-muted-foreground">{employee.user?.username ?? "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{employee.nip ?? "-"}</TableCell>
                      <TableCell>
                        {employee.gender === "MALE"
                          ? "Laki-laki"
                          : employee.gender === "FEMALE"
                            ? "Perempuan"
                            : "-"}
                      </TableCell>
                      <TableCell>{employee.department ?? "-"}</TableCell>
                      <TableCell>{employee.title ?? "-"}</TableCell>
                      <TableCell>{employee.email ?? "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={employee.isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}
                        >
                          {employee.isActive ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" disabled={actionLoadingId === employee.id}>
                                {actionLoadingId === employee.id ? (
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDetailTarget(employee)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Detail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              {employee.isActive ? (
                                <DropdownMenuItem onClick={() => setDeactivateTarget(employee)}>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setActivateTarget(employee)}>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(employee)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Hard Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {employees.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border py-8 text-muted-foreground">
                <Users className="h-8 w-8" />
                <p>Belum ada data employee</p>
              </div>
            ) : (
              employees.map((employee) => (
                <div key={employee.id} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{employee.fullName ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        NIP: {employee.nip ?? "-"} |{" "}
                        {formatGender(employee.gender)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {employee.department ?? "-"} | {employee.title ?? "-"} | {employee.email ?? "-"}
                      </p>
                    </div>
                    <Badge variant="outline" className={employee.isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
                      {employee.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div className="mt-3 flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={actionLoadingId === employee.id}>
                            {actionLoadingId === employee.id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailTarget(employee)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Detail
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {employee.isActive ? (
                            <DropdownMenuItem onClick={() => setDeactivateTarget(employee)}>
                              <UserX className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => setActivateTarget(employee)}>
                              <UserX className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(employee)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Hard Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
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
        </CardContent>
      </Card>

      {isAdmin && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[620px] p-0">
            <form onSubmit={handleSubmit} className="flex max-h-[85dvh] flex-col">
              <DialogHeader className="px-6 pt-6 pb-0">
                <DialogTitle>{editingEmployee ? "Edit Employee" : "Tambah Employee"}</DialogTitle>
                <DialogDescription>
                  {editingEmployee
                    ? "Perbarui profil kepegawaian"
                    : "Tambahkan profil employee"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 overflow-y-auto px-6 py-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fullname</Label>
                  <Input
                    value={form.fullName}
                    onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    placeholder="Nama lengkap"
                  />
                </div>
                <div className="space-y-2">
                  <Label>NIP</Label>
                  <Input
                    value={form.nip}
                    onChange={(event) => setForm((prev) => ({ ...prev, nip: event.target.value }))}
                    placeholder="Nomor induk pegawai"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select
                    value={form.gender || undefined}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        gender: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {form.gender &&
                        !GENDER_OPTIONS.some((option) => option.value === form.gender) && (
                          <SelectItem value={form.gender}>{form.gender}</SelectItem>
                        )}
                      {GENDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={form.department || undefined}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        department: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih department" />
                    </SelectTrigger>
                    <SelectContent>
                      {form.department &&
                        !DEPARTMENT_OPTIONS.includes(form.department as (typeof DEPARTMENT_OPTIONS)[number]) && (
                          <SelectItem value={form.department}>{form.department}</SelectItem>
                        )}
                      {DEPARTMENT_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Select
                    value={form.title || undefined}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        title: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih title" />
                    </SelectTrigger>
                    <SelectContent>
                      {form.title && !TITLE_OPTIONS.includes(form.title as (typeof TITLE_OPTIONS)[number]) && (
                        <SelectItem value={form.title}>{form.title}</SelectItem>
                      )}
                      {TITLE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Work Location</Label>
                  <Input
                    value={form.workLocation}
                    onChange={(event) => setForm((prev) => ({ ...prev, workLocation: event.target.value }))}
                    placeholder="Jakarta"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="staff@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>No HP</Label>
                  <Input
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="08..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Bank Name</Label>
                  <Input
                    value={form.bankAccountName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, bankAccountName: event.target.value }))
                    }
                    placeholder="Nama rekening"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Bank Number</Label>
                  <Input
                    value={form.bankAccountNumber}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, bankAccountNumber: event.target.value }))
                    }
                    placeholder="Nomor rekening"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.isActive} onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value as "true" | "false" }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">ACTIVE</SelectItem>
                      <SelectItem value="false">INACTIVE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="border-t px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : editingEmployee ? "Update" : "Simpan"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={detailTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Detail Employee</DialogTitle>
            <DialogDescription>Informasi lengkap data employee.</DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Identitas</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Fullname:</span> {detailTarget.fullName ?? "-"}</p>
                  <p><span className="text-muted-foreground">NIP:</span> {detailTarget.nip ?? "-"}</p>
                  <p><span className="text-muted-foreground">Gender:</span> {formatGender(detailTarget.gender)}</p>
                  <p><span className="text-muted-foreground">Status:</span> {detailTarget.isActive ? "ACTIVE" : "INACTIVE"}</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Kepegawaian</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Department:</span> {detailTarget.department ?? "-"}</p>
                  <p><span className="text-muted-foreground">Title:</span> {detailTarget.title ?? "-"}</p>
                  <p><span className="text-muted-foreground">Work Location:</span> {detailTarget.workLocation ?? "-"}</p>
                  <p><span className="text-muted-foreground">Employee Code:</span> {detailTarget.employeeCode ?? "-"}</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Kontak</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Email:</span> {detailTarget.email ?? "-"}</p>
                  <p><span className="text-muted-foreground">No HP:</span> {detailTarget.phone ?? "-"}</p>
                  <p><span className="text-muted-foreground">User Login:</span> {detailTarget.user?.username ?? "-"}</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bank</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Account Name:</span> {detailTarget.bankAccountName ?? "-"}</p>
                  <p><span className="text-muted-foreground">Account Number:</span> {detailTarget.bankAccountNumber ?? "-"}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hard Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Data employee{" "}
              <span className="font-medium text-foreground">{deleteTarget?.fullName ?? deleteTarget?.nip}</span>{" "}
              akan dihapus permanen dan tidak bisa dipulihkan. Seluruh histori terkait (attendance, leave, business
              trip, reimbursement), notifikasi, dan jejak workflow milik employee ini juga akan ikut dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoadingId !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()}>
              {actionLoadingId === deleteTarget?.id ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Delete Permanen"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Employee{" "}
              <span className="font-medium text-foreground">{deactivateTarget?.fullName ?? deactivateTarget?.nip}</span>{" "}
              akan dinonaktifkan (`is_active = false`) namun data tetap tersimpan dan aman. Ini adalah aksi default
              yang direkomendasikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoadingId !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDeactivate()}>
              {actionLoadingId === deactivateTarget?.id ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={activateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setActivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Employee{" "}
              <span className="font-medium text-foreground">
                {activateTarget?.fullName ?? activateTarget?.nip}
              </span>{" "}
              akan diaktifkan kembali (`is_active = true`). Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoadingId !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmActivate()}>
              {actionLoadingId === activateTarget?.id ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Activate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

