"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  XCircle,
  RotateCcw,
  Download,
  FileText,
  CalendarIcon,
  Filter,
} from 'lucide-react';
import { fetchClients } from '@/lib/api/clients';
import { createContract, fetchContracts, updateContract } from '@/lib/api/contracts';
import type { Client, Contract, ServiceCode, PaymentStatus, ContractStatus } from '@/types';
import { formatCurrency, formatDate, generateProposalNumber } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function Contracts() {
  const router = useRouter();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'ALL'>('ALL');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    proposalDate: new Date(),
    serviceCode: 'A' as ServiceCode,
    contractTitle: '',
    contractValue: '',
    notes: '',
  });

  const filteredContracts = contracts
    .filter((contract) => {
      const matchesSearch =
        contract.proposalNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contract.client?.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || contract.paymentStatus === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [contractData, clientData] = await Promise.all([
          fetchContracts(),
          fetchClients(),
        ]);
        if (!active) return;
        setContracts(contractData);
        setClients(clientData);
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
  }, [searchQuery, filterStatus]);

  const visibleContracts = filteredContracts.slice(0, visibleCount);

  const resetForm = () => {
    setFormData({
      clientId: '',
      proposalDate: new Date(),
      serviceCode: 'A',
      contractTitle: '',
      contractValue: '',
      notes: '',
    });
    setEditingContract(null);
  };

  const handleOpenDialog = (contract?: Contract) => {
    if (contract) {
      setActionLoadingId(contract.id);
      setEditingContract(contract);
      setFormData({
        clientId: contract.clientId,
        proposalDate: new Date(contract.proposalDate),
        serviceCode: contract.serviceCode,
        contractTitle: contract.contractTitle || '',
        contractValue: contract.contractValue.toString(),
        notes: contract.notes || '',
      });
    } else {
      resetForm();
      setActionLoadingId(null);
    }
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setActionLoadingId(null);
    }
  };

  const getNextSeqNo = (date: Date) => {
    const year = date.getFullYear();
    const existingInYear = contracts.filter((c) => {
      const cDate = new Date(c.proposalDate);
      return cDate.getFullYear() === year;
    });
    return existingInYear.length + 1;
  };

  const getPreviewEngagementNo = (clientId: string, serviceCode: ServiceCode) => {
    if (!clientId) return 1;
    const clientContracts = contracts.filter(
      (c) => c.clientId === clientId && c.serviceCode === serviceCode
    );
    if (clientContracts.length === 0) return 1;
    return Math.max(...clientContracts.map((c) => c.engagementNo)) + 1;
  };

  const previewProposalNumber = formData.clientId
    ? generateProposalNumber({
        seqNo: getNextSeqNo(formData.proposalDate),
        serviceCode: formData.serviceCode,
        engagementNo: getPreviewEngagementNo(formData.clientId, formData.serviceCode),
        proposalDate: formData.proposalDate,
      })
    : '';

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

      const contractValue = parseFloat(formData.contractValue.replace(/[^0-9]/g, ''));
      if (isNaN(contractValue) || contractValue <= 0) {
        toast({
          title: 'Error',
          description: 'Masukkan nilai kontrak yang valid',
          variant: 'destructive',
        });
        return;
      }

      if (editingContract) {
        // Update existing contract
        const updated = await updateContract(editingContract.id, {
          contractTitle: formData.contractTitle,
          contractValue,
          notes: formData.notes,
        });
        setContracts(
          contracts.map((c) =>
            c.id === updated.id ? { ...updated, client: c.client } : c
          )
        );
        toast({
          title: 'Success',
          description: 'Contract berhasil diupdate',
        });
      } else {
        // Create new contract
        const seqNo = getNextSeqNo(formData.proposalDate);

        const created = await createContract({
          proposalDate: formData.proposalDate,
          clientId: formData.clientId,
          serviceCode: formData.serviceCode,
          seqNo,
          contractTitle: formData.contractTitle,
          contractValue,
          paymentStatus: 'UNPAID',
          status: 'ACTIVE',
          notes: formData.notes,
        });
        setContracts([...contracts, { ...created, client }]);
        toast({
          title: 'Success',
          description: `Contract ${created.proposalNumber} berhasil dibuat`,
        });
      }

      handleDialogOpenChange(false);
      resetForm();
    } catch (error) {
      toast({
        title: 'Error',
        description: editingContract ? 'Gagal update contract' : 'Gagal membuat contract',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidContract = async (contract: Contract) => {
    setActionLoadingId(contract.id);
    try {
      const updated = await updateContract(contract.id, {
        status: 'VOID',
      });
      setContracts(
        contracts.map((c) =>
          c.id === updated.id ? { ...updated, client: c.client } : c
        )
      );
      toast({
        title: 'Contract Voided',
        description: `Contract ${contract.proposalNumber} telah di-void`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal void contract',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivateContract = async (contract: Contract) => {
    setActionLoadingId(contract.id);
    try {
      const updated = await updateContract(contract.id, {
        status: 'ACTIVE',
      });
      setContracts(
        contracts.map((c) =>
          c.id === updated.id ? { ...updated, client: c.client } : c
        )
      );
      toast({
        title: 'Contract Reactivated',
        description: `Contract ${contract.proposalNumber} telah diaktifkan kembali`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal re-activate contract',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExportExcel = () => {
    const rows = filteredContracts.map((contract) => ({
      'No. Proposal/Kontrak': contract.proposalNumber,
      'Tanggal Proposal': formatDate(new Date(contract.proposalDate)),
      'Nama Client': contract.client?.name ?? '',
      'Nama Service (A - audit / B-non audit)':
        contract.serviceCode === 'A' ? 'A - Audit' : 'B - Non Audit',
      'Engagement No': contract.engagementNo,
      'Contract Title': contract.contractTitle ?? '',
      'Contract Value': Number(contract.contractValue),
      'Payment Status': contract.paymentStatus,
      'Proposal Status': contract.status,
      created_at: formatDate(new Date(contract.createdAt)),
      updated_at: formatDate(new Date(contract.updatedAt)),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contracts');
    const fileName = `contracts-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
    toast({
      title: 'Export Excel',
      description: 'File Excel sudah diunduh.',
    });
  };

  const getPaymentStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case 'PAID':
        return 'bg-success text-success-foreground';
      case 'PARTIAL':
        return 'bg-warning text-warning-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getContractStatusColor = (status: ContractStatus) => {
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

  if (isLoading) {
    return (
      <AdminLayout title="Contracts">
        <ContractsSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Contracts">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-xl">Daftar Contracts</CardTitle>
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-2 md:items-center md:gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={() => handleOpenDialog()} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Tambah Contract
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor atau client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={filterStatus}
              onValueChange={(value) => setFilterStatus(value as PaymentStatus | 'ALL')}
            >
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="UNPAID">Unpaid</SelectItem>
                <SelectItem value="PARTIAL">Partial</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Proposal</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileText className="w-8 h-8" />
                          <p>Tidak ada contract ditemukan</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleContracts.map((contract) => (
                      <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-mono text-sm font-medium">
                          {contract.proposalNumber}
                        </TableCell>
                        <TableCell>{formatDate(new Date(contract.proposalDate))}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{contract.client?.name}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{contract.serviceCode}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contract.contractValue)}
                        </TableCell>
                        <TableCell>
                          <Badge className={getPaymentStatusColor(contract.paymentStatus)}>
                            {contract.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getContractStatusColor(contract.status)}
                          >
                            {contract.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={actionLoadingId === contract.id}
                              >
                                {actionLoadingId === contract.id ? (
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                ) : (
                                  <MoreHorizontal className="w-4 h-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setActionLoadingId(contract.id);
                                  router.push(`/contracts/${contract.id}`);
                                }}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View Detail
                              </DropdownMenuItem>
                              {contract.status === 'ACTIVE' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleOpenDialog(contract)}
                                  >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleVoidContract(contract)}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Void Contract
                                  </DropdownMenuItem>
                                </>
                              )}
                              {contract.status === 'VOID' && (
                                <DropdownMenuItem
                                  onClick={() => handleReactivateContract(contract)}
                                >
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  Reactivate
                                </DropdownMenuItem>
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
              {filteredContracts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
                  <FileText className="w-8 h-8" />
                  <p>Tidak ada contract ditemukan</p>
                </div>
              ) : (
                visibleContracts.map((contract) => (
                  <div key={contract.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground">No. Proposal</p>
                          <p className="font-mono text-sm font-medium">
                            {contract.proposalNumber}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Client</p>
                          <p className="text-sm">{contract.client?.name}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{contract.serviceCode}</Badge>
                          <Badge className={getPaymentStatusColor(contract.paymentStatus)}>
                            {contract.paymentStatus}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getContractStatusColor(contract.status)}
                          >
                            {contract.status}
                          </Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={actionLoadingId === contract.id}
                          >
                            {actionLoadingId === contract.id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : (
                              <MoreHorizontal className="w-4 h-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setActionLoadingId(contract.id);
                              router.push(`/contracts/${contract.id}`);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Detail
                          </DropdownMenuItem>
                          {contract.status === 'ACTIVE' && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleOpenDialog(contract)}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleVoidContract(contract)}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Void Contract
                              </DropdownMenuItem>
                            </>
                          )}
                          {contract.status === 'VOID' && (
                            <DropdownMenuItem
                              onClick={() => handleReactivateContract(contract)}
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Reactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatDate(new Date(contract.proposalDate))}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(contract.contractValue)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {visibleContracts.length < filteredContracts.length && (
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
      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingContract ? 'Edit Contract' : 'Tambah Contract Baru'}
              </DialogTitle>
              <DialogDescription>
                {editingContract
                  ? 'Update informasi contract'
                  : 'Buat proposal/contract baru. Nomor akan di-generate otomatis.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(value) =>
                      setFormData({ ...formData, clientId: value })
                    }
                    disabled={!!editingContract}
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
                  <Label>Tanggal Proposal *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !formData.proposalDate && 'text-muted-foreground'
                        )}
                        disabled={!!editingContract}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.proposalDate
                          ? format(formData.proposalDate, 'dd/MM/yyyy')
                          : 'Pilih tanggal'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.proposalDate}
                        onSelect={(date) =>
                          date && setFormData({ ...formData, proposalDate: date })
                        }
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="serviceCode">Service Code *</Label>
                  <Select
                    value={formData.serviceCode}
                    onValueChange={(value) =>
                      setFormData({ ...formData, serviceCode: value as ServiceCode })
                    }
                    disabled={!!editingContract}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A (Audit)</SelectItem>
                      <SelectItem value="B">B (Non-Audit)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contractValue">Nilai Kontrak (excl. PPN) *</Label>
                  <Input
                    id="contractValue"
                    value={formData.contractValue}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      setFormData({ ...formData, contractValue: value });
                    }}
                    placeholder="150000000"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Preview Nomor Kontrak</Label>
                <p className="text-sm text-muted-foreground">
                  {previewProposalNumber || 'Pilih client untuk melihat preview'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Nomor final ditentukan oleh server saat simpan.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractTitle">Judul Kontrak</Label>
                <Input
                  id="contractTitle"
                  value={formData.contractTitle}
                  onChange={(e) =>
                    setFormData({ ...formData, contractTitle: e.target.value })
                  }
                  placeholder="Audit Laporan Keuangan 2024"
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
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  editingContract ? 'Update' : 'Buat Contract'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function ContractsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <Skeleton className="h-6 w-44" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-10 w-44" />
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
