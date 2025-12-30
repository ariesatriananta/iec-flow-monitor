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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, UserCog, Eye, EyeOff } from 'lucide-react';
import type { User } from '@/types';
import { formatDate } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { createUser, deleteUser, fetchUsers, updateUser } from '@/lib/api/users';

export default function Users() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
  });

  const filteredUsers = users
    .filter(
      (user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const data = await fetchUsers();
        if (active) setUsers(data);
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery]);

  const visibleUsers = filteredUsers.slice(0, visibleCount);

  const resetForm = () => {
    setFormData({ name: '', username: '', password: '' });
    setEditingUser(null);
    setShowPassword(false);
  };

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        username: user.username,
        password: '',
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate username uniqueness
      const existingUser = users.find(
        (u) => u.username === formData.username && u.id !== editingUser?.id
      );
      if (existingUser) {
        toast({
          title: 'Error',
          description: 'Username sudah digunakan',
          variant: 'destructive',
        });
        return;
      }

      if (editingUser) {
        // Update existing user
        const updated = await updateUser(editingUser.id, {
          name: formData.name,
          username: formData.username,
          password: formData.password || undefined,
        });
        setUsers(users.map((u) => (u.id === updated.id ? updated : u)));
        toast({
          title: 'Success',
          description: 'User berhasil diupdate',
        });
      } else {
        // Create new user
        if (!formData.password) {
          toast({
            title: 'Error',
            description: 'Password wajib diisi untuk user baru',
            variant: 'destructive',
          });
          return;
        }

        const created = await createUser({
          name: formData.name,
          username: formData.username,
          password: formData.password,
        });
        setUsers([...users, created]);
        toast({
          title: 'Success',
          description: 'User berhasil ditambahkan',
        });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal menyimpan user',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (users.length <= 1) {
      toast({
        title: 'Error',
        description: 'Tidak bisa menghapus user terakhir',
        variant: 'destructive',
      });
      return;
    }

    try {
      await deleteUser(user.id);
      setUsers(users.filter((u) => u.id !== user.id));
      toast({
        title: 'User Deleted',
        description: `${user.name} telah dihapus`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal menghapus user',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Users">
        <UsersSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Users">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-xl">Daftar Users</CardTitle>
          <Button onClick={() => handleOpenDialog()} className="w-full md:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Tambah User
          </Button>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau username..."
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
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <UserCog className="w-8 h-8" />
                          <p>Tidak ada user ditemukan</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                  visibleUsers.map((user) => (
                    <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(new Date(user.createdAt))}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenDialog(user)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDeleteUser(user)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
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
              {filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
                  <UserCog className="w-8 h-8" />
                  <p>Tidak ada user ditemukan</p>
                </div>
              ) : (
                visibleUsers.map((user) => (
                  <div key={user.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground mt-2">Username</p>
                        <p className="text-sm break-all">{user.username}</p>
                      </div>
                      <Badge variant="outline" className="bg-primary/10 text-primary">
                        {user.role}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatDate(new Date(user.createdAt))}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenDialog(user)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteUser(user)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              )}
            </div>
            {visibleUsers.length < filteredUsers.length && (
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

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Edit User' : 'Tambah User Baru'}
              </DialogTitle>
              <DialogDescription>
                {editingUser
                  ? 'Update informasi user'
                  : 'Tambahkan user admin baru'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nama lengkap"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">
                  Password {editingUser ? '(kosongkan jika tidak diubah)' : '*'}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Minimal 8 karakter"
                    required={!editingUser}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  editingUser ? 'Update' : 'Simpan'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function UsersSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-28" />
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
