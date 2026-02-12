"use client";

import { useEffect, useState } from "react";
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
import { createEmployee, fetchEmployees, updateEmployee } from "@/lib/api/employees";
import { formatDate } from "@/lib/numbering";
import { useAuth } from "@/contexts/AuthContext";
import type { Employee } from "@/types";
import { Plus, Search, Users } from "lucide-react";

interface FormState {
  title: string;
  department: string;
  workLocation: string;
  phone: string;
  email: string;
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

const initialForm: FormState = {
  title: "",
  department: "",
  workLocation: "",
  phone: "",
  email: "",
  isActive: "true",
};

export default function EmployeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  const loadData = async () => {
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
  };

  useEffect(() => {
    void loadData();
  }, [isAdmin, page, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingEmployee(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      title: employee.title ?? "",
      department: employee.department ?? "",
      workLocation: employee.workLocation ?? "",
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      isActive: employee.isActive ? "true" : "false",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setIsSaving(true);
    try {
      if (editingEmployee) {
        const updated = await updateEmployee(editingEmployee.id, {
          title: form.title || undefined,
          department: form.department || undefined,
          workLocation: form.workLocation || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
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
          title: form.title || undefined,
          department: form.department || undefined,
          workLocation: form.workLocation || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
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
        description: "Gagal menyimpan data employee",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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
                  <TableHead>Employee Code</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Lokasi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
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
                      <TableCell className="font-mono text-xs">{employee.employeeCode}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{employee.user?.name ?? "-"}</p>
                          <p className="text-xs text-muted-foreground">{employee.user?.username ?? "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{employee.department ?? "-"}</TableCell>
                      <TableCell>{employee.title ?? "-"}</TableCell>
                      <TableCell>{employee.workLocation ?? "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={employee.isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}
                        >
                          {employee.isActive ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(new Date(employee.updatedAt))}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(employee)}>
                            Edit
                          </Button>
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
                      <p className="font-mono text-xs text-muted-foreground">{employee.employeeCode}</p>
                      <p className="font-medium">{employee.user?.name ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{employee.department ?? "-"} | {employee.title ?? "-"}</p>
                    </div>
                    <Badge variant="outline" className={employee.isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
                      {employee.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Lokasi: {employee.workLocation ?? "-"}</p>
                  {isAdmin && (
                    <div className="mt-3 flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(employee)}>
                        Edit
                      </Button>
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
                  <Label>Department</Label>
                  <Input
                    value={form.department}
                    onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                    placeholder="HR"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Select
                    value={form.title || "NONE"}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        title: value === "NONE" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih title" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">-</SelectItem>
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
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="staff@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="08..."
                  />
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
    </AdminLayout>
  );
}

