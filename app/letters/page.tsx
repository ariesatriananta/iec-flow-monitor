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
  Pencil,
  XCircle,
  Download,
  Filter,
  Mail,
  Printer,
  CalendarIcon,
} from 'lucide-react';
import type {
  Client,
  Letter,
  LetterType,
  LetterStatus,
  HrgaCategory,
  LetterAssignment,
} from '@/types';
import { formatDate } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchClients } from '@/lib/api/clients';
import {
  createLetter,
  deleteLetter,
  fetchLetterDetail,
  fetchLetters,
  updateLetter,
} from '@/lib/api/letters';
import { fetchSettings, type SettingsPayload } from '@/lib/api/settings';
import * as XLSX from 'xlsx';

const letterTypeLabels: Record<LetterType, string> = {
  HRGA: 'HR/GA',
  UMUM: 'Umum',
  SURAT_TUGAS: 'Surat Tugas',
};

const hrgaCategoryLabels: Record<HrgaCategory, string> = {
  PERMANEN: 'Permanen',
  NON_PERMANEN: 'Non-Permanen',
  INTERNSHIP: 'Internship',
};

const createEmptyAssignment = () => ({
  title: 'Penugasan Jasa Audit Laporan Keuangan.',
  auditPeriodText: 'Untuk Tahun yang Berakhir .....',
  members: [{ name: '', role: '' }],
});

const buildSuratTugasIntro = (
  title: string,
  clientName: string,
  auditPeriodText: string
) =>
  `Sehubungan dengan pelaksanaan ${title} ${clientName} ${auditPeriodText}, dengan ini kami menugaskan Tim yang terdiri atas :`;

const suratTugasClosingText =
  'Demi kelancaran pelaksanaan pekerjaan, kami yakin manajemen akan mendukung dan bekerjasama dengan Tim tersebut di atas.';

export default function Letters() {
  const { toast } = useToast();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<LetterType | 'ALL'>('ALL');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [editingLetter, setEditingLetter] = useState<Letter | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<Letter | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Letter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(createEmptyAssignment());
  const [isAssignmentLoading, setIsAssignmentLoading] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printLetter, setPrintLetter] = useState<Letter | null>(null);
  const [printAssignment, setPrintAssignment] = useState<LetterAssignment | null>(null);
  const [headerDataUrl, setHeaderDataUrl] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    letterDate: new Date(),
    letterType: 'HRGA' as LetterType,
    hrgaCategory: '' as HrgaCategory | '',
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

  useEffect(() => {
    let active = true;
    const loadHeader = async () => {
      try {
        const response = await fetch('/invoice-header.png');
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
          if (!active) return;
          setHeaderDataUrl(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error(error);
      }
    };
    loadHeader();
    return () => {
      active = false;
    };
  }, []);

  const visibleLetters = filteredLetters.slice(0, visibleCount);

  const resetForm = () => {
    setFormData({
      clientId: '',
      letterDate: new Date(),
      letterType: 'HRGA',
      hrgaCategory: '',
      subject: '',
      notes: '',
    });
    setAssignmentForm(createEmptyAssignment());
    setEditingLetter(null);
  };

  const handleOpenDialog = async (letter?: Letter) => {
    if (letter) {
      setEditingLetter(letter);
      setFormData({
        clientId: letter.clientId ?? '',
        letterDate: new Date(letter.letterDate),
        letterType: letter.letterType,
        hrgaCategory: letter.hrgaCategory ?? '',
        subject: letter.subject,
        notes: letter.notes ?? '',
      });
      setAssignmentForm(createEmptyAssignment());
      setIsDialogOpen(true);

      if (letter.letterType === 'SURAT_TUGAS') {
        setIsAssignmentLoading(true);
        try {
          const detail = await fetchLetterDetail(letter.id);
          if (detail.assignment) {
            setAssignmentForm({
              title: detail.assignment.title,
              auditPeriodText: detail.assignment.auditPeriodText,
              members:
                detail.assignment.members?.map((member) => ({
                  name: member.name,
                  role: member.role,
                })) ?? [{ name: '', role: '' }],
            });
          } else {
            setAssignmentForm(createEmptyAssignment());
          }
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Gagal memuat detail surat tugas',
            variant: 'destructive',
          });
        } finally {
          setIsAssignmentLoading(false);
        }
      }
    } else {
      resetForm();
      setIsDialogOpen(true);
    }
  };

  const handleOpenDetail = (letter: Letter) => {
    setSelectedLetter(letter);
    setIsDetailOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const requiresClient = formData.letterType === 'SURAT_TUGAS';
      const client = formData.clientId
        ? clients.find((c) => c.id === formData.clientId)
        : undefined;
      if (requiresClient && !client) {
        toast({
          title: 'Error',
          description: 'Pilih client terlebih dahulu',
          variant: 'destructive',
        });
        return;
      }

      if (formData.letterType === 'HRGA' && !formData.hrgaCategory) {
        toast({
          title: 'Error',
          description: 'Pilih kategori HRGA terlebih dahulu',
          variant: 'destructive',
        });
        return;
      }
      if (formData.letterType === 'SURAT_TUGAS') {
        const cleanedMembers = assignmentForm.members.filter(
          (member) => member.name.trim() && member.role.trim()
        );
        if (!assignmentForm.title.trim() || !assignmentForm.auditPeriodText.trim()) {
          toast({
            title: 'Error',
            description: 'Lengkapi data surat tugas terlebih dahulu',
            variant: 'destructive',
          });
          return;
        }
        if (cleanedMembers.length === 0) {
          toast({
            title: 'Error',
            description: 'Minimal satu anggota tim wajib diisi',
            variant: 'destructive',
          });
          return;
        }
      }

      if (editingLetter) {
        const updated = await updateLetter(editingLetter.id, {
          letterDate: formData.letterDate,
          letterType: formData.letterType,
          hrgaCategory: formData.hrgaCategory || null,
          subject: formData.subject,
          notes: formData.notes,
          clientId: formData.clientId || null,
          assignment:
            formData.letterType === 'SURAT_TUGAS'
              ? {
                  title: assignmentForm.title,
                  auditPeriodText: assignmentForm.auditPeriodText,
                  members: assignmentForm.members
                    .filter((member) => member.name.trim() && member.role.trim())
                    .map((member) => ({
                      name: member.name,
                      role: member.role,
                    })),
                }
              : undefined,
        });
        setLetters(
          letters.map((l) => (l.id === updated.id ? { ...updated, client } : l))
        );
        toast({
          title: 'Success',
          description: `Surat ${updated.letterNumber} berhasil diupdate`,
        });
      } else {
        const created = await createLetter({
          letterDate: formData.letterDate,
          clientId: formData.clientId || undefined,
          letterType: formData.letterType,
          hrgaCategory: formData.hrgaCategory || undefined,
          subject: formData.subject,
          status: 'ACTIVE',
          notes: formData.notes,
          assignment:
            formData.letterType === 'SURAT_TUGAS'
              ? {
                  title: assignmentForm.title,
                  auditPeriodText: assignmentForm.auditPeriodText,
                  members: assignmentForm.members
                    .filter((member) => member.name.trim() && member.role.trim())
                    .map((member) => ({
                      name: member.name,
                      role: member.role,
                    })),
                }
              : undefined,
        });
        setLetters([...letters, { ...created, client }]);
        toast({
          title: 'Success',
          description: `Surat ${created.letterNumber} berhasil dibuat`,
        });
      }

      setIsDialogOpen(false);
      resetForm();
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

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const letter = confirmDelete;
    setIsDeleting(true);
    try {
      await deleteLetter(letter.id);
      setLetters(letters.filter((item) => item.id !== letter.id));
      toast({
        title: 'Surat dihapus',
        description: `Surat ${letter.letterNumber} berhasil dihapus`,
      });
    } catch (error) {
      toast({
        title: 'Gagal menghapus surat',
        description:
          error instanceof Error && error.message
            ? error.message
            : 'Terjadi kesalahan saat menghapus surat',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
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
      'Kategori HRGA':
        letter.letterType === 'HRGA'
          ? hrgaCategoryLabels[letter.hrgaCategory ?? 'PERMANEN']
          : '',
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

  const formatDateLong = (value: Date | string) =>
    new Date(value).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });


  const updateAssignmentField = (
    field: 'title' | 'auditPeriodText',
    value: string
  ) => {
    setAssignmentForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateAssignmentMember = (
    index: number,
    field: 'name' | 'role',
    value: string
  ) => {
    setAssignmentForm((prev) => {
      const members = prev.members.map((member, memberIndex) =>
        memberIndex === index ? { ...member, [field]: value } : member
      );
      return { ...prev, members };
    });
  };

  const addAssignmentMember = () => {
    setAssignmentForm((prev) => ({
      ...prev,
      members: [...prev.members, { name: '', role: '' }],
    }));
  };

  const removeAssignmentMember = (index: number) => {
    setAssignmentForm((prev) => {
      const members = prev.members.filter((_, memberIndex) => memberIndex !== index);
      return { ...prev, members: members.length ? members : [{ name: '', role: '' }] };
    });
  };

  const handleOpenPrint = async (letter: Letter) => {
    setIsPrintOpen(true);
    setPrintLetter(null);
    setPrintAssignment(null);
    try {
      const detail = await fetchLetterDetail(letter.id);
      if (!detail.assignment) {
        throw new Error('Detail surat tugas belum lengkap');
      }
      setPrintLetter(detail);
      setPrintAssignment(detail.assignment);
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Gagal memuat data surat tugas',
        variant: 'destructive',
      });
      setIsPrintOpen(false);
    }
  };

  const handlePrintSuratTugas = () => {
    if (!printLetter || !printAssignment) return;
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) return;
    const headerUrl = headerDataUrl || `${window.location.origin}/invoice-header.png`;
    const letterDate = formatDateLong(printLetter.letterDate);
    const clientName = printLetter.client?.name ?? 'PT xxx';
    const clientAddress = printLetter.client?.address ?? 'Alamatxx';
    const introText = buildSuratTugasIntro(
      printAssignment.title,
      clientName,
      printAssignment.auditPeriodText
    );
    const members = printAssignment.members ?? [];
    const membersHtml = members
      .map(
        (member) => `
          <tr>
            <td style="width: 24px;">*</td>
            <td style="padding-right: 24px;">${member.name}</td>
            <td>${member.role}</td>
          </tr>
        `
      )
      .join('');
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Surat Tugas ${printLetter.letterNumber}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            :root { --primary: #1e4e8c; --muted: #6b7280; }
            body { font-family: Arial, sans-serif; color: #111; background: #fff; }
            .header { position: relative; height: 180px; margin-bottom: 24px; }
            .header-bg { position: absolute; inset: 0; background-image: url('${headerUrl}'); background-size: cover; background-position: top center; }
            .content { font-size: 14px; line-height: 1.6; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
            .title { text-align: center; font-weight: 700; margin: 24px 0; }
            .title-line { font-size: 15px; }
            .title-client { font-size: 15px; }
            .title-period { font-size: 15px; }
            .title .line { text-decoration: underline; }
            .signature { margin-top: 36px; }
            .signature .name { margin-top: 90px; font-weight: 700; }
            .members { margin: 16px 0 20px; }
            table { width: 100%; border-collapse: collapse; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-bg"></div>
          </div>
          <div class="content">
            <div class="meta">
              <div>No. ${printLetter.letterNumber}</div>
              <div>Jakarta, ${letterDate}</div>
            </div>
            <div style="margin-bottom: 16px;">
              <div>Yang Terhormat,</div>
              <div><strong>${clientName}</strong></div>
              <div>${clientAddress}</div>
            </div>
            <div class="title">
              <div class="title-line">${printAssignment.title}</div>
              <div class="title-client">${clientName}</div>
              <div class="title-period">${printAssignment.auditPeriodText}</div>
            </div>
            <div>Dengan hormat,</div>
            <p>${introText}</p>
            <div class="members">
              <table>
                ${membersHtml}
              </table>
            </div>
            <p>${suratTugasClosingText}</p>
            <div class="signature">
              <div>Hormat kami,</div>
              <div>${settings?.companyName || 'KAP Krisnawan, Nugroho & Fahmy'}</div>
              <div class="name">${settings?.defaultSignerName || 'Anita Rahman, CPA'}</div>
              <div>Rekan Penanggung Jawab</div>
            </div>
          </div>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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
      case 'UMUM':
        return 'bg-success/10 text-success border-success/20';
      case 'SURAT_TUGAS':
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
            <Button onClick={() => handleOpenDialog()} className="w-full">
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
                <SelectItem value="UMUM">Umum</SelectItem>
                <SelectItem value="SURAT_TUGAS">Surat Tugas</SelectItem>
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
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={getLetterTypeColor(letter.letterType)}>
                              {letterTypeLabels[letter.letterType]}
                            </Badge>
                            {letter.letterType === 'HRGA' && (
                              <span className="text-xs text-muted-foreground">
                                {letter.hrgaCategory
                                  ? hrgaCategoryLabels[letter.hrgaCategory]
                                  : 'Permanen'}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{letter.client?.name ?? '-'}</p>
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
                              {letter.letterType === 'SURAT_TUGAS' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleOpenPrint(letter)}>
                                    <Printer className="w-4 h-4 mr-2" />
                                    Print
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {letter.status === 'ACTIVE' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleOpenDialog(letter)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
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
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setConfirmDelete(letter)}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Hapus Surat
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
                        <p className="text-sm">{letter.client?.name ?? '-'}</p>
                        <p className="text-xs text-muted-foreground mt-2">Subject</p>
                        <p className="text-sm">{letter.subject}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={getLetterTypeColor(letter.letterType)}>
                            {letterTypeLabels[letter.letterType]}
                          </Badge>
                          {letter.letterType === 'HRGA' && (
                            <span className="text-xs text-muted-foreground">
                              {letter.hrgaCategory
                                ? hrgaCategoryLabels[letter.hrgaCategory]
                                : 'Permanen'}
                            </span>
                          )}
                        </div>
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
                          {letter.letterType === 'SURAT_TUGAS' && (
                            <>
                              <DropdownMenuItem onClick={() => handleOpenPrint(letter)}>
                                <Printer className="w-4 h-4 mr-2" />
                                Print
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {letter.status === 'ACTIVE' && (
                            <>
                              <DropdownMenuItem onClick={() => handleOpenDialog(letter)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
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
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setConfirmDelete(letter)}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Hapus Surat
                          </DropdownMenuItem>
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
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingLetter ? 'Edit Surat' : 'Buat Surat Baru'}
              </DialogTitle>
              <DialogDescription>
                {editingLetter
                  ? 'Update informasi surat yang dipilih.'
                  : 'Nomor surat akan di-generate otomatis'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="letterType">Tipe Surat *</Label>
                <Select
                  value={formData.letterType}
                  onValueChange={(value) =>
                    {
                      const nextType = value as LetterType;
                      setFormData({
                        ...formData,
                        letterType: nextType,
                        clientId:
                          nextType === 'SURAT_TUGAS' ? formData.clientId : '',
                        hrgaCategory: nextType === 'HRGA' ? formData.hrgaCategory : '',
                      });
                      if (nextType === 'SURAT_TUGAS') {
                        setAssignmentForm(createEmptyAssignment());
                      }
                    }
                  }
                  disabled={!!editingLetter}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HRGA">HR/GA</SelectItem>
                    <SelectItem value="UMUM">Umum</SelectItem>
                    <SelectItem value="SURAT_TUGAS">Surat Tugas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.letterType === 'HRGA' && (
                <div className="space-y-2">
                  <Label htmlFor="hrgaCategory">Kategori HRGA *</Label>
                  <Select
                    value={formData.hrgaCategory}
                    onValueChange={(value) =>
                      setFormData({ ...formData, hrgaCategory: value as HrgaCategory })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERMANEN">Permanen</SelectItem>
                    <SelectItem value="NON_PERMANEN">Non-Permanen</SelectItem>
                    <SelectItem value="INTERNSHIP">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                <Label htmlFor="client">
                  Client{' '}
                  {formData.letterType === 'SURAT_TUGAS' ? (
                    <span className="text-destructive">*</span>
                  ) : (
                    '(opsional)'
                  )}
                </Label>
                <Select
                  value={formData.clientId}
                  onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                  disabled={formData.letterType === 'HRGA'}
                >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          formData.letterType === 'SURAT_TUGAS'
                            ? 'Pilih Client'
                            : 'Tidak wajib'
                        }
                      />
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
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Perihal surat"
                  required
                />
              </div>
              {formData.letterType === 'SURAT_TUGAS' && (
                <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Detail Surat Tugas</p>
                    {isAssignmentLoading && (
                      <span className="text-xs text-muted-foreground">Memuat...</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Judul Surat *</Label>
                    <Textarea
                      id="title"
                      value={assignmentForm.title}
                      onChange={(e) => updateAssignmentField('title', e.target.value)}
                      placeholder="Penugasan Jasa Audit..."
                      rows={2}
                      disabled={isAssignmentLoading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="auditPeriodText">Periode Audit *</Label>
                    <Textarea
                      id="auditPeriodText"
                      value={assignmentForm.auditPeriodText}
                      onChange={(e) =>
                        updateAssignmentField('auditPeriodText', e.target.value)
                      }
                      placeholder="Untuk Tahun yang Berakhir..."
                      rows={2}
                      disabled={isAssignmentLoading}
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Anggota Tim *</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addAssignmentMember}
                        disabled={isAssignmentLoading}
                      >
                        Tambah
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {assignmentForm.members.map((member, index) => (
                        <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={member.name}
                            onChange={(e) =>
                              updateAssignmentMember(index, 'name', e.target.value)
                            }
                            placeholder="Nama anggota"
                            disabled={isAssignmentLoading}
                          />
                          <Input
                            value={member.role}
                            onChange={(e) =>
                              updateAssignmentMember(index, 'role', e.target.value)
                            }
                            placeholder="Peran"
                            disabled={isAssignmentLoading}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAssignmentMember(index)}
                            disabled={assignmentForm.members.length === 1 || isAssignmentLoading}
                          >
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/80 p-3 text-xs text-muted-foreground">
                    Nama/alamat penerima, kota, paragraf pembuka, dan penutup
                    akan di-generate otomatis.
                  </div>
                </div>
              )}
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
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  (formData.letterType === 'SURAT_TUGAS' && isAssignmentLoading)
                }
              >
                {isSubmitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  editingLetter ? 'Simpan Perubahan' : 'Buat Surat'
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

      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Surat</AlertDialogTitle>
            <AlertDialogDescription>
              Surat{" "}
              <span className="font-mono">{confirmDelete?.letterNumber}</span> akan dihapus permanen. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                'Hapus'
              )}
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
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] p-0 flex flex-col">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <DialogTitle>Detail Surat</DialogTitle>
            <DialogDescription>Ringkasan informasi surat terpilih</DialogDescription>
          </DialogHeader>
          {selectedLetter && (
            <div className="flex-1 overflow-y-auto">
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
                        {selectedLetter.letterType === 'HRGA' && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {selectedLetter.hrgaCategory
                              ? hrgaCategoryLabels[selectedLetter.hrgaCategory]
                              : 'Permanen'}
                          </p>
                        )}
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
                {selectedLetter.letterType === 'HRGA' && (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Kategori HRGA</p>
                    <p className="mt-2 text-sm">
                      {selectedLetter.hrgaCategory
                        ? hrgaCategoryLabels[selectedLetter.hrgaCategory]
                        : 'Permanen'}
                    </p>
                  </div>
                )}
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
            </div>
          )}
          <DialogFooter className="border-t border-border/60 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setIsDetailOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPrintOpen}
        onOpenChange={(open) => {
          setIsPrintOpen(open);
          if (!open) {
            setPrintLetter(null);
            setPrintAssignment(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[900px] h-[85vh] bg-muted p-0 grid grid-rows-[auto,1fr,auto]">
          <DialogHeader className="bg-muted/95 px-6 py-4 backdrop-blur">
            <DialogTitle>Preview Surat Tugas</DialogTitle>
            <DialogDescription>
              Pastikan data sudah sesuai sebelum print.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto px-6 pb-6">
            {(!printLetter || !printAssignment) && (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {printLetter && printAssignment && (
              <SuratTugasPreview
                letter={printLetter}
                assignment={printAssignment}
                headerSrc={headerDataUrl || "/invoice-header.png"}
                signerName={settings?.defaultSignerName || "Anita Rahman, CPA"}
                companyName={settings?.companyName || "KAP Krisnawan, Nugroho & Fahmy"}
                formatDateLong={formatDateLong}
              />
            )}
          </div>
          <DialogFooter className="gap-2 bg-muted/95 px-6 py-4 backdrop-blur border-t">
            <Button variant="outline" onClick={() => setIsPrintOpen(false)}>
              Tutup
            </Button>
            <Button onClick={handlePrintSuratTugas} disabled={!printLetter || !printAssignment}>
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function SuratTugasPreview({
  letter,
  assignment,
  headerSrc,
  signerName,
  companyName,
  formatDateLong,
}: {
  letter: Letter;
  assignment: LetterAssignment;
  headerSrc: string;
  signerName: string;
  companyName: string;
  formatDateLong: (value: Date | string) => string;
}) {
  const members = assignment.members ?? [];
  const clientName = letter.client?.name ?? 'PT xxx';
  const clientAddress = letter.client?.address ?? 'Alamatxx';
  const introText = buildSuratTugasIntro(
    assignment.title,
    clientName,
    assignment.auditPeriodText
  );
  const closingText = suratTugasClosingText;
  return (
    <div className="space-y-6 rounded-md bg-white p-6 text-black font-[Arial]">
      <div className="relative h-44">
        <div
          className="absolute inset-0 bg-cover bg-top"
          style={{ backgroundImage: `url(${headerSrc})` }}
        />
      </div>
      <div className="flex flex-col gap-3 text-sm md:flex-row md:items-start md:justify-between">
        <div>No. {letter.letterNumber}</div>
        <div>
          Jakarta, {formatDateLong(letter.letterDate)}
        </div>
      </div>
      <div className="text-sm">
        <p>Yang Terhormat,</p>
        <p className="font-semibold">{clientName}</p>
        <p>{clientAddress}</p>
      </div>
      <div className="text-center font-semibold">
        <p className="text-base ">{assignment.title}</p>
        <p className="text-base ">{clientName}</p>
        <p className="text-base ">{assignment.auditPeriodText}</p>
      </div>
      <div className="text-sm space-y-3">
        <p>Dengan hormat,</p>
        <p className="whitespace-pre-line">{introText}</p>
      </div>
      <div className="text-sm">
        <table className="w-full border-collapse">
          <tbody>
            {members.map((member, index) => (
              <tr key={`${member.id}-${index}`}>
                <td className="w-6 align-top">*</td>
                <td className="pr-8 align-top">{member.name}</td>
                <td className="align-top">{member.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm space-y-3">
        <p className="whitespace-pre-line">{closingText}</p>
      </div>
      <div className="text-sm">
        <p>Hormat kami,</p>
        <p>{companyName}</p>
        <div className="h-32" />
        <p className="font-semibold">{signerName}</p>
        <p>Rekan Penanggung Jawab</p>
      </div>
    </div>
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
