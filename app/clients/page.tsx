"use client";

import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Building2 } from 'lucide-react';
import type { Client } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { createClient, fetchClients, updateClient, deleteClient } from '@/lib/api/clients';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingClientId, setTogglingClientId] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const { toast } = useToast();

  const npwpPattern = /^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/;

  const formatNpwp = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 15);
    if (!digits) return '';
    let result = digits.slice(0, 2);
    if (digits.length > 2) result += `.${digits.slice(2, 5)}`;
    if (digits.length > 5) result += `.${digits.slice(5, 8)}`;
    if (digits.length > 8) result += `.${digits.slice(8, 9)}`;
    if (digits.length > 9) result += `-${digits.slice(9, 12)}`;
    if (digits.length > 12) result += `.${digits.slice(12, 15)}`;
    return result;
  };

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    npwp: '',
    address: '',
    picName: '',
    email: '',
    phone: '',
  });

  const filteredClients = clients
    .filter((client) => client.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  useEffect(() => {
    let active = true;
    const loadClients = async () => {
      try {
        const data = await fetchClients();
        if (!active) return;
        setClients(data);
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadClients();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery]);

  const visibleClients = filteredClients.slice(0, visibleCount);

  const resetForm = () => {
    setFormData({
      name: '',
      npwp: '',
      address: '',
      picName: '',
      email: '',
      phone: '',
    });
    setEditingClient(null);
  };

  const handleOpenDialog = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        npwp: client.npwp || '',
        address: client.address || '',
        picName: client.picName || '',
        email: client.email || '',
        phone: client.phone || '',
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.npwp && !npwpPattern.test(formData.npwp)) {
      toast({
        title: 'Format NPWP tidak valid',
        description: 'Gunakan format 12.345.678.9-012.345',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    
    try {
      if (editingClient) {
        // Update existing client
        const updated = await updateClient(editingClient.id, {
          ...formData,
          isActive: editingClient.isActive,
        });
        setClients(clients.map((c) => (c.id === updated.id ? updated : c)));
        toast({
          title: 'Success',
          description: 'Client berhasil diupdate',
        });
      } else {
        // Create new client
        const created = await createClient({
          ...formData,
          isActive: true,
        });
        setClients([...clients, created]);
        toast({
          title: 'Success',
          description: 'Client berhasil ditambahkan',
        });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: 'Error',
        description: editingClient ? 'Gagal update client' : 'Gagal menambahkan client',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (client: Client) => {
    setTogglingClientId(client.id);
    try {
      const updated = await updateClient(client.id, {
        name: client.name,
        npwp: client.npwp,
        address: client.address,
        picName: client.picName,
        email: client.email,
        phone: client.phone,
        isActive: !client.isActive,
      });
      setClients(clients.map((c) => (c.id === updated.id ? updated : c)));
      toast({
        title: 'Status Updated',
        description: `Client ${client.isActive ? 'dinonaktifkan' : 'diaktifkan'}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal update status client',
        variant: 'destructive',
      });
    } finally {
      setTogglingClientId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingClientId(deleteTarget.id);
    try {
      await deleteClient(deleteTarget.id);
      setClients(clients.filter((c) => c.id !== deleteTarget.id));
      toast({
        title: 'Client dihapus',
        description: 'Client dan seluruh data terkait berhasil dihapus',
      });
      setDeleteTarget(null);
    } catch (error) {
      toast({
        title: 'Gagal menghapus client',
        description:
          error instanceof Error && error.message
            ? error.message
            : 'Client sedang digunakan di data lain',
        variant: 'destructive',
      });
    } finally {
      setDeletingClientId(null);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Clients">
        <ClientsSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Clients">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-xl">Daftar Clients</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="w-full md:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Client
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingClient ? 'Edit Client' : 'Tambah Client Baru'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingClient
                      ? 'Update informasi client'
                      : 'Masukkan informasi client baru'}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Perusahaan *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="PT Nama Perusahaan"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npwp">NPWP</Label>
                    <Input
                      id="npwp"
                      value={formData.npwp}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          npwp: formatNpwp(e.target.value),
                        })
                      }
                      placeholder="12.345.678.9-012.345"
                      inputMode="numeric"
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: 12.345.678.9-012.345
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Alamat</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      placeholder="Jl. Contoh No. 123, Jakarta"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="picName">PIC Name</Label>
                      <Input
                        id="picName"
                        value={formData.picName}
                        onChange={(e) =>
                          setFormData({ ...formData, picName: e.target.value })
                        }
                        placeholder="Nama PIC"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telepon</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="021-5551234"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="email@company.com"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    ) : (
                      editingClient ? 'Update' : 'Simpan'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Perusahaan</TableHead>
                    <TableHead>NPWP</TableHead>
                    <TableHead>PIC</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Building2 className="w-8 h-8" />
                          <p>Tidak ada client ditemukan</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                  visibleClients.map((client) => (
                    <TableRow key={client.id}>
                        <TableCell>{client.name}</TableCell>
                        <TableCell>{client.npwp || '-'}</TableCell>
                        <TableCell>{client.picName || '-'}</TableCell>
                        <TableCell>{client.email || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={client.isActive ? 'default' : 'secondary'}
                            className={
                              client.isActive
                                ? 'bg-success text-success-foreground'
                                : ''
                            }
                          >
                            {client.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={
                                  togglingClientId === client.id ||
                                  deletingClientId === client.id
                                }
                              >
                                {togglingClientId === client.id ||
                                deletingClientId === client.id ? (
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                ) : (
                                  <MoreHorizontal className="w-4 h-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleOpenDialog(client)}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(client)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {client.isActive ? 'Deactivate' : 'Activate'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(client)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Hapus
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {filteredClients.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
                  <Building2 className="w-8 h-8" />
                  <p>Tidak ada client ditemukan</p>
                </div>
              ) : (
                visibleClients.map((client) => (
                  <div key={client.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Nama Perusahaan</p>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-xs text-muted-foreground mt-2">NPWP</p>
                        <p className="text-sm">{client.npwp || '-'}</p>
                        <p className="text-xs text-muted-foreground mt-2">PIC</p>
                        <p className="text-sm">{client.picName || '-'}</p>
                        <p className="text-xs text-muted-foreground mt-2">Email</p>
                        <p className="text-sm break-all">{client.email || '-'}</p>
                      </div>
                      <Badge
                        variant={client.isActive ? 'default' : 'secondary'}
                        className={
                          client.isActive
                            ? 'bg-success text-success-foreground'
                            : ''
                        }
                      >
                        {client.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={
                              togglingClientId === client.id ||
                              deletingClientId === client.id
                            }
                          >
                            {togglingClientId === client.id ||
                            deletingClientId === client.id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : (
                              <MoreHorizontal className="w-4 h-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenDialog(client)}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(client)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {client.isActive ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(client)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              )}
            </div>
            {visibleClients.length < filteredClients.length && (
              <div className="flex justify-center p-4">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((prev) => prev + 20)}
                >
                  Load More
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Client</AlertDialogTitle>
            <AlertDialogDescription>
              Client{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{' '}
              akan dihapus permanen beserta seluruh data terkait (kontrak,
              termin, invoice, surat). Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingClientId !== null}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              {deletingClientId ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                'Hapus'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function ClientsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-36" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
          <Skeleton className="h-10 w-full md:max-w-sm" />
        </div>
        <div className="rounded-md border">
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
