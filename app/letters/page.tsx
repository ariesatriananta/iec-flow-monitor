"use client";

import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  XCircle,
  Download,
  Filter,
  Mail,
  CalendarIcon,
} from 'lucide-react';
import type { Client, Letter, LetterType, LetterStatus } from '@/types';
import { formatDate } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchClients } from '@/lib/api/clients';
import { createLetter, fetchLetters, updateLetter } from '@/lib/api/letters';
import { fetchSettings, type SettingsPayload } from '@/lib/api/settings';
import * as XLSX from 'xlsx';

const letterTypeLabels: Record<LetterType, string> = {
  HRGA: 'HR/GA',
  FINANCE: 'Finance',
  SURAT_JALAN: 'Surat Jalan',
};

export default function Letters() {
  const { toast } = useToast();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<LetterType | 'ALL'>('ALL');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<Letter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    letterDate: new Date(),
    letterType: 'HRGA' as LetterType,
    subject: '',
    notes: '',
  });

  const filteredLetters = letters
    .filter((letter) => {
      const matchesSearch =
        letter.letterNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        letter.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'ALL' || letter.letterType === filterType;
      return matchesSearch && matchesType;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [letterData, clientData, settingsData] = await Promise.all([
          fetchLetters(),
          fetchClients(),
          fetchSettings(),
        ]);
        if (!active) return;
        setLetters(letterData);
        setClients(clientData);
        setSettings(settingsData);
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
  }, [searchQuery, filterType]);

  const visibleLetters = filteredLetters.slice(0, visibleCount);

  const resetForm = () => {
    setFormData({
      clientId: '',
      letterDate: new Date(),
      letterType: 'HRGA',
      subject: '',
      notes: '',
    });
  };

  const handleOpenDetail = (letter: Letter) => {
    setSelectedLetter(letter);
    setIsDetailOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const client = clients.find((c) => c.id === formData.clientId);
      if (!client) {
        toast({
          title: 'Error',
          description: 'Pilih client terlebih dahulu',
          variant: 'destructive',
        });
        return;
      }

      const created = await createLetter({
        letterDate: formData.letterDate,
        clientId: formData.clientId,
        letterType: formData.letterType,
        subject: formData.subject,
        status: 'ACTIVE',
        notes: formData.notes,
      });
      setLetters([...letters, { ...created, client }]);
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: 'Success',
        description: `Surat ${created.letterNumber} berhasil dibuat`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal membuat surat',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidLetter = async (letter: Letter) => {
    try {
      const updated = await updateLetter(letter.id, { status: 'VOID' });
      setLetters(
        letters.map((l) =>
          l.id === updated.id ? { ...updated, client: l.client } : l
        )
      );
      toast({
        title: 'Letter Voided',
        description: `Surat ${letter.letterNumber} telah di-void`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal void surat',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmVoid = async () => {
    if (!confirmVoid) return;
    const letter = confirmVoid;
    setConfirmVoid(null);
    await handleVoidLetter(letter);
  };

  const handleExportExcel = () => {
    const formatDateTime = (value: Date | string) =>
      new Date(value)
        .toLocaleString('en-GB', {
          timeZone: 'Asia/Jakarta',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        .replace(',', '');

    const rows = filteredLetters.map((letter) => ({
      'No. Surat': letter.letterNumber,
      'Tgl Surat': formatDate(new Date(letter.letterDate)),
      'Tipe Surat': letterTypeLabels[letter.letterType],
      Client: letter.client?.name ?? '',
      Subject: letter.subject,
      Status: letter.status,
      created_at: formatDateTime(letter.createdAt),
      updated_at: formatDateTime(letter.updatedAt),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Letters');
    const fileName = `letters-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
    toast({
      title: 'Export Excel',
      description: 'File Excel sudah diunduh.',
    });
  };

  const getLetterStatusColor = (status: LetterStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-success text-success-foreground';
      case 'VOID':
        return 'bg-destructive text-destructive-foreground';
      case 'CANCELLED':
        return 'bg-muted text-muted-foreground';
      default:
        return '';
    }
  };

  const getLetterTypeColor = (type: LetterType) => {
    switch (type) {
      case 'HRGA':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'FINANCE':
        return 'bg-success/10 text-success border-success/20';
      case 'SURAT_JALAN':
        return 'bg-warning/10 text-warning border-warning/20';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Letters">
        <LettersSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Letters">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-xl">Daftar Letters</CardTitle>
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-2 md:items-center">
            <Button variant="outline" onClick={handleExportExcel} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={() => setIsDialogOpen(true)} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Buat Surat
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor atau subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={filterType}
              onValueChange={(value) => setFilterType(value as LetterType | 'ALL')}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Tipe</SelectItem>
                <SelectItem value="HRGA">HR/GA</SelectItem>
                <SelectItem value="FINANCE">Finance</SelectItem>
                <SelectItem value="SURAT_JALAN">Surat Jalan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Surat</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLetters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Mail className="w-8 h-8" />
                          <p>Tidak ada surat ditemukan</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleLetters.map((letter) => (
                      <TableRow key={letter.id}>
                        <TableCell className="font-mono font-medium">
                          {letter.letterNumber}
                        </TableCell>
                        <TableCell>{formatDate(new Date(letter.letterDate))}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getLetterTypeColor(letter.letterType)}>
                            {letterTypeLabels[letter.letterType]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{letter.client?.name}</p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{letter.subject}</TableCell>
                        <TableCell>
                          <Badge className={getLetterStatusColor(letter.status)}>
                            {letter.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenDetail(letter)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Detail
                            </DropdownMenuItem>
                              {letter.status === 'ACTIVE' && (
                                <>
                                  <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setConfirmVoid(letter)}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Void Surat
                                </DropdownMenuItem>
                                </>
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
            <div className="space-y-3 p-4 md:hidden">
              {filteredLetters.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
                  <Mail className="w-8 h-8" />
                  <p>Tidak ada surat ditemukan</p>
                </div>
              ) : (
                visibleLetters.map((letter) => (
                  <div key={letter.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">No. Surat</p>
                        <p className="font-mono text-sm font-medium">
                          {letter.letterNumber}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">Client</p>
                        <p className="text-sm">{letter.client?.name}</p>
                        <p className="text-xs text-muted-foreground mt-2">Subject</p>
                        <p className="text-sm">{letter.subject}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className={getLetterTypeColor(letter.letterType)}>
                          {letterTypeLabels[letter.letterType]}
                        </Badge>
                        <Badge className={getLetterStatusColor(letter.status)}>
                          {letter.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatDate(new Date(letter.letterDate))}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDetail(letter)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Detail
                        </DropdownMenuItem>
                          {letter.status === 'ACTIVE' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setConfirmVoid(letter)}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Void Surat
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              )}
            </div>
            {visibleLetters.length < filteredLetters.length && (
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

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Buat Surat Baru</DialogTitle>
              <DialogDescription>
                Nomor surat akan di-generate otomatis
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients
                        .filter((c) => c.isActive)
                        .map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tanggal Surat *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !formData.letterDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.letterDate
                          ? format(formData.letterDate, 'dd/MM/yyyy')
                          : 'Pilih tanggal'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.letterDate}
                        onSelect={(date) =>
                          date && setFormData({ ...formData, letterDate: date })
                        }
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="letterType">Tipe Surat *</Label>
                <Select
                  value={formData.letterType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, letterType: value as LetterType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HRGA">HR/GA</SelectItem>
                    <SelectItem value="FINANCE">Finance</SelectItem>
                    <SelectItem value="SURAT_JALAN">Surat Jalan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Perihal surat"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                  rows={3}
                />
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
                  'Buat Surat'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmVoid !== null} onOpenChange={() => setConfirmVoid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Surat</AlertDialogTitle>
            <AlertDialogDescription>
              Yakin ingin void surat{" "}
              <span className="font-mono">{confirmVoid?.letterNumber}</span>? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmVoid}>
              Ya, void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Dialog */}
      <Dialog
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) setSelectedLetter(null);
        }}
      >
        <DialogContent className="sm:max-w-[640px] p-0">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <DialogTitle>Detail Surat</DialogTitle>
            <DialogDescription>Ringkasan informasi surat terpilih</DialogDescription>
          </DialogHeader>
          {selectedLetter && (
            <div className="px-6 pb-6 pt-4 space-y-5">
              {(settings?.companyLogoUrl || settings?.companyName || settings?.companyAddress) && (
                <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
                  <div className="flex items-center gap-4">
                    {settings.companyLogoUrl && (
                      <img
                        src={settings.companyLogoUrl}
                        alt="Logo"
                        className="h-12 w-12 rounded-lg object-contain bg-white"
                      />
                    )}
                    <div className="text-sm">
                      {settings.companyName && (
                        <p className="text-base font-semibold text-foreground">
                          {settings.companyName}
                        </p>
                      )}
                      {settings.companyAddress && (
                        <p className="text-muted-foreground">{settings.companyAddress}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase text-muted-foreground">No. Surat</p>
                  <p className="mt-2 font-mono text-base font-semibold">
                    {selectedLetter.letterNumber}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Tanggal</p>
                      <p className="mt-2 text-sm">
                        {formatDate(new Date(selectedLetter.letterDate))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Tipe</p>
                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className={getLetterTypeColor(selectedLetter.letterType)}
                        >
                          {letterTypeLabels[selectedLetter.letterType]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Client</p>
                    <p className="mt-2 text-sm font-medium">
                      {selectedLetter.client?.name ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Status</p>
                    <div className="mt-2">
                      <Badge className={getLetterStatusColor(selectedLetter.status)}>
                        {selectedLetter.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-background p-4 space-y-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Subject</p>
                  <p className="mt-2 text-sm">{selectedLetter.subject}</p>
                </div>
                {selectedLetter.notes && (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Notes</p>
                    <p className="mt-2 text-sm whitespace-pre-wrap">
                      {selectedLetter.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="border-t border-border/60 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setIsDetailOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function LettersSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid w-full gap-2 md:w-auto md:grid-cols-2 md:items-center">
          <Skeleton className="h-9 w-full md:w-28" />
          <Skeleton className="h-9 w-full md:w-28" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
          <Skeleton className="h-10 w-full md:max-w-sm" />
          <Skeleton className="h-10 w-full md:w-36" />
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
