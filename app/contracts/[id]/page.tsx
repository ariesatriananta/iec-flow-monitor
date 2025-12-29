"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  ArrowLeft,
  Plus,
  Receipt,
  Check,
  Trash2,
  Undo2,
  CalendarIcon,
  Building2,
  FileText,
  DollarSign,
} from 'lucide-react';
import type { Contract, Termin, TerminStatus, Invoice } from '@/types';
import { formatCurrency, formatDate, calculatePercentage } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchContract } from '@/lib/api/contracts';
import { fetchInvoices } from '@/lib/api/invoices';
import { createTermin, deleteTermin, updateTermin } from '@/lib/api/termins';
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

export default function ContractDetail() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const contractId = id ?? '';
  const { toast } = useToast();

  const [contract, setContract] = useState<Contract | null>(null);
  const [termins, setTermins] = useState<Termin[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<{
    id: string;
    type: 'invoice' | 'paid' | 'delete' | 'revert' | 'pending';
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'invoice' | 'paid' | 'delete' | 'revert' | 'pending';
    termin: Termin;
  } | null>(null);

  const [isTerminDialogOpen, setIsTerminDialogOpen] = useState(false);
  const [terminFormData, setTerminFormData] = useState({
    terminName: '',
    terminAmount: '',
    dueDate: undefined as Date | undefined,
  });

  useEffect(() => {
    if (!contractId) return;
    let active = true;
    const loadData = async () => {
      try {
        const [contractData, invoiceData] = await Promise.all([
          fetchContract(contractId),
          fetchInvoices(contractId),
        ]);
        if (!active) return;
        setContract(contractData);
        setTermins(contractData.termins ?? []);
        setInvoices(invoiceData);
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
  }, [contractId]);

  const totalPaid = useMemo(
    () => termins.filter((t) => t.status === 'PAID').reduce((sum, t) => sum + t.terminAmount, 0),
    [termins]
  );

  const paymentProgress = useMemo(
    () => (contract ? calculatePercentage(totalPaid, contract.contractValue) : 0),
    [totalPaid, contract]
  );

  const derivedPaymentStatus = useMemo(() => {
    if (!contract) return null;
    const contractValue = contract.contractValue;
    if (totalPaid <= 0) return 'UNPAID';
    if (totalPaid < contractValue) return 'PARTIAL';
    return 'PAID';
  }, [contract, totalPaid]);

  const sortedTermins = useMemo(
    () =>
      [...termins].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [termins]
  );

  useEffect(() => {
    if (!derivedPaymentStatus) return;
    setContract((prev) =>
      prev && prev.paymentStatus !== derivedPaymentStatus
        ? { ...prev, paymentStatus: derivedPaymentStatus }
        : prev
    );
  }, [derivedPaymentStatus]);

  if (!contract && !isLoading) {
    return (
      <AdminLayout title="Contract Not Found">
        <div className="flex flex-col items-center justify-center py-12">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Contract tidak ditemukan</h2>
          <Button onClick={() => router.push('/contracts')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali ke Contracts
          </Button>
        </div>
      </AdminLayout>
    );
  }

  if (!contract) {
    return (
      <AdminLayout title="Contract Detail">
        <ContractDetailSkeleton />
      </AdminLayout>
    );
  }

  const handleAddTermin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const amount = parseFloat(terminFormData.terminAmount.replace(/[^0-9]/g, ''));
      if (isNaN(amount) || amount <= 0) {
        toast({
          title: 'Error',
          description: 'Masukkan nominal yang valid',
          variant: 'destructive',
        });
        return;
      }

      const created = await createTermin({
        contractId: contract.id,
        terminName: terminFormData.terminName,
        terminAmount: amount,
        dueDate: terminFormData.dueDate,
        status: 'PENDING',
      });
      setTermins([...termins, created]);
      setIsTerminDialogOpen(false);
      setTerminFormData({ terminName: '', terminAmount: '', dueDate: undefined });
      toast({
        title: 'Termin Ditambahkan',
        description: `${terminFormData.terminName} berhasil ditambahkan`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal menambahkan termin',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (termin: Termin) => {
    setActionLoading({ id: termin.id, type: 'paid' });
    try {
      const updated = await updateTermin(termin.id, {
        status: 'PAID',
        paymentReceivedDate: new Date(),
      });
      setTermins(termins.map((t) => (t.id === updated.id ? updated : t)));
      const refreshedInvoices = await fetchInvoices(contract.id);
      setInvoices(refreshedInvoices);
      toast({
        title: 'Payment Received',
        description: `${termin.terminName} telah ditandai sebagai PAID`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal update termin',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateInvoice = async (termin: Termin) => {
    setActionLoading({ id: termin.id, type: 'invoice' });
    try {
      const updated = await updateTermin(termin.id, {
        status: 'INVOICED',
      });
      setTermins(termins.map((t) => (t.id === updated.id ? updated : t)));
      const refreshedInvoices = await fetchInvoices(contract.id);
      setInvoices(refreshedInvoices);
      toast({
        title: 'Invoice Created',
        description: `Invoice untuk ${termin.terminName} berhasil dibuat`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal membuat invoice',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteTermin = async (termin: Termin) => {
    setActionLoading({ id: termin.id, type: 'delete' });
    try {
      await deleteTermin(termin.id);
      setTermins(termins.filter((t) => t.id !== termin.id));
      toast({
        title: 'Termin Dihapus',
        description: `${termin.terminName} telah dihapus`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal menghapus termin',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevertToInvoiced = async (termin: Termin) => {
    setActionLoading({ id: termin.id, type: 'revert' });
    try {
      const updated = await updateTermin(termin.id, {
        status: 'INVOICED',
        paymentReceivedDate: null,
      });
      setTermins(termins.map((t) => (t.id === updated.id ? updated : t)));
      const refreshedInvoices = await fetchInvoices(contract.id);
      setInvoices(refreshedInvoices);
      toast({
        title: 'Termin Diubah',
        description: `${termin.terminName} dikembalikan ke INVOICED`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal mengubah status termin',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevertToPending = async (termin: Termin) => {
    setActionLoading({ id: termin.id, type: 'pending' });
    try {
      const updated = await updateTermin(termin.id, {
        status: 'PENDING',
        invoiceId: null,
      });
      setTermins(termins.map((t) => (t.id === updated.id ? updated : t)));
      const refreshedInvoices = await fetchInvoices(contract.id);
      setInvoices(refreshedInvoices);
      toast({
        title: 'Termin Diubah',
        description: `${termin.terminName} dikembalikan ke PENDING`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal mengubah status termin',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, termin } = confirmAction;
    setConfirmAction(null);
    if (type === 'invoice') {
      await handleCreateInvoice(termin);
    } else if (type === 'paid') {
      await handleMarkAsPaid(termin);
    } else if (type === 'revert') {
      await handleRevertToInvoiced(termin);
    } else if (type === 'pending') {
      await handleRevertToPending(termin);
    } else {
      await handleDeleteTermin(termin);
    }
  };

  const confirmCopy =
    confirmAction?.type === 'invoice'
      ? {
          title: 'Buat Invoice',
          description: `Buat invoice untuk termin "${confirmAction.termin.terminName}"?`,
          action: 'Ya, buat invoice',
        }
      : confirmAction?.type === 'paid'
        ? {
            title: 'Tandai Paid',
            description: `Tandai termin "${confirmAction.termin.terminName}" sebagai PAID?`,
            action: 'Ya, tandai paid',
          }
        : confirmAction?.type === 'delete'
          ? {
              title: 'Hapus Termin',
              description: `Hapus termin "${confirmAction.termin.terminName}"? Tindakan ini tidak dapat dibatalkan.`,
              action: 'Ya, hapus',
            }
          : confirmAction?.type === 'revert'
            ? {
                title: 'Kembalikan ke Invoiced',
                description: `Ubah status "${confirmAction.termin.terminName}" kembali ke INVOICED?`,
                action: 'Ya, kembalikan',
              }
            : confirmAction?.type === 'pending'
              ? {
                  title: 'Kembalikan ke Pending',
                  description: `Ubah status "${confirmAction.termin.terminName}" kembali ke PENDING dan hapus invoice terkait?`,
                  action: 'Ya, kembalikan',
                }
          : null;

  const getTerminStatusColor = (status: TerminStatus) => {
    switch (status) {
      case 'PAID':
        return 'bg-success text-success-foreground';
      case 'INVOICED':
        return 'bg-primary text-primary-foreground';
      case 'PENDING':
        return 'bg-warning text-warning-foreground';
      case 'VOID':
        return 'bg-destructive text-destructive-foreground';
      default:
        return '';
    }
  };

  return (
    <AdminLayout title={contract.proposalNumber}>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.push('/contracts')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Kembali
        </Button>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{contract.proposalNumber}</h1>
              <Badge
                className={
                  contract.status === 'ACTIVE'
                    ? 'bg-success text-success-foreground'
                    : 'bg-destructive text-destructive-foreground'
                }
              >
                {contract.status}
              </Badge>
            </div>
            {contract.contractTitle && (
              <p className="text-muted-foreground">{contract.contractTitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-lg px-4 py-2">
              {formatCurrency(contract.contractValue)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-medium">{contract.client?.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <DollarSign className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="font-medium">{formatCurrency(totalPaid)}</p>
                <p className="text-xs text-muted-foreground">{paymentProgress}% dari total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Receipt className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className="font-medium">
                  {formatCurrency(contract.contractValue - totalPaid)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {100 - paymentProgress}% pending
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-1/20">
                <Check className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment Status</p>
                <Badge
                  className={
                    contract.paymentStatus === 'PAID'
                      ? 'bg-success text-success-foreground'
                      : contract.paymentStatus === 'PARTIAL'
                      ? 'bg-warning text-warning-foreground'
                      : 'bg-muted text-muted-foreground'
                  }
                >
                  {contract.paymentStatus}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Progress */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Payment Progress</span>
            <span className="text-sm text-muted-foreground">{paymentProgress}%</span>
          </div>
          <Progress value={paymentProgress} className="h-3" />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="termins" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="termins">Termins ({termins.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Tanggal Proposal</p>
                    <p className="font-medium">{formatDate(new Date(contract.proposalDate))}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Service Code</p>
                    <Badge variant="outline">{contract.serviceCode}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Engagement No</p>
                    <p className="font-medium">{contract.engagementNo}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nilai Kontrak</p>
                    <p className="font-medium text-lg">{formatCurrency(contract.contractValue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Status</p>
                    <Badge
                      className={
                        contract.paymentStatus === 'PAID'
                          ? 'bg-success text-success-foreground'
                          : contract.paymentStatus === 'PARTIAL'
                          ? 'bg-warning text-warning-foreground'
                          : ''
                      }
                    >
                      {contract.paymentStatus}
                    </Badge>
                  </div>
                  {contract.notes && (
                    <div>
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="font-medium">{contract.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="termins">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Payment Termins</CardTitle>
                <CardDescription>Daftar pembayaran bertahap</CardDescription>
              </div>
              {contract.status === 'ACTIVE' && (
                <Button onClick={() => setIsTerminDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah Termin
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Termin</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {termins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Belum ada termin
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTermins.map((termin) => {
                      const isRowLoading = actionLoading?.id === termin.id;
                      const isInvoiceLoading = isRowLoading && actionLoading?.type === 'invoice';
                      const isDeleteLoading = isRowLoading && actionLoading?.type === 'delete';
                      const isPaidLoading = isRowLoading && actionLoading?.type === 'paid';
                      const isRevertLoading = isRowLoading && actionLoading?.type === 'revert';
                      const isPendingLoading = isRowLoading && actionLoading?.type === 'pending';

                      return (
                      <TableRow key={termin.id}>
                        <TableCell className="font-medium">{termin.terminName}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(termin.terminAmount)}
                        </TableCell>
                        <TableCell>
                          {calculatePercentage(termin.terminAmount, contract.contractValue)}%
                        </TableCell>
                        <TableCell>
                          {termin.dueDate ? formatDate(new Date(termin.dueDate)) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={getTerminStatusColor(termin.status)}>
                            {termin.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {termin.status === 'PENDING' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() =>
                                    setConfirmAction({ type: 'invoice', termin })
                                  }
                                  disabled={isRowLoading}
                                >
                                  {isInvoiceLoading ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                  ) : (
                                    <>
                                      <Receipt className="w-3 h-3 mr-1" />
                                      Invoice
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setConfirmAction({ type: 'delete', termin })
                                  }
                                  disabled={isRowLoading}
                                >
                                  {isDeleteLoading ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                  ) : (
                                    <>
                                      <Trash2 className="w-3 h-3 mr-1" />
                                      Hapus
                                    </>
                                  )}
                                </Button>
                              </>
                            )}
                            {termin.status === 'INVOICED' && (
                              <Button
                                size="sm"
                                onClick={() => setConfirmAction({ type: 'paid', termin })}
                                disabled={isRowLoading}
                              >
                                {isPaidLoading ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                ) : (
                                  <>
                                    <Check className="w-3 h-3 mr-1" />
                                    Paid
                                  </>
                                )}
                              </Button>
                            )}
                            {termin.status === 'INVOICED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmAction({ type: 'pending', termin })}
                                disabled={isRowLoading}
                              >
                                {isPendingLoading ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                ) : (
                                  <>
                                    <Undo2 className="w-3 h-3 mr-1" />
                                    Pending
                                  </>
                                )}
                              </Button>
                            )}
                            {termin.status === 'PAID' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmAction({ type: 'revert', termin })}
                                disabled={isRowLoading}
                              >
                                {isRevertLoading ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                ) : (
                                  <>
                                    <Undo2 className="w-3 h-3 mr-1" />
                                    Revert
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Daftar invoice untuk kontrak ini</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Invoice</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Belum ada invoice
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{formatDate(new Date(invoice.invoiceDate))}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(invoice.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              invoice.status === 'PAID'
                                ? 'bg-success text-success-foreground'
                                : ''
                            }
                          >
                            {invoice.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Termin Dialog */}
      <Dialog open={isTerminDialogOpen} onOpenChange={setIsTerminDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAddTermin}>
            <DialogHeader>
              <DialogTitle>Tambah Termin</DialogTitle>
              <DialogDescription>Tambahkan pembayaran bertahap baru</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="terminName">Nama Termin *</Label>
                <Input
                  id="terminName"
                  value={terminFormData.terminName}
                  onChange={(e) =>
                    setTerminFormData({ ...terminFormData, terminName: e.target.value })
                  }
                  placeholder="DP 30%, Termin 2, Pelunasan, etc."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terminAmount">Nominal *</Label>
                <Input
                  id="terminAmount"
                  value={terminFormData.terminAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setTerminFormData({ ...terminFormData, terminAmount: value });
                  }}
                  placeholder="45000000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !terminFormData.dueDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {terminFormData.dueDate
                        ? format(terminFormData.dueDate, 'dd/MM/yyyy')
                        : 'Pilih tanggal'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={terminFormData.dueDate}
                      onSelect={(date) =>
                        setTerminFormData({ ...terminFormData, dueDate: date })
                      }
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTerminDialogOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  'Tambah Termin'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAction !== null} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              {confirmCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function ContractDetailSkeleton() {
  return (
    <>
      <div className="mb-6 space-y-3">
        <Skeleton className="h-9 w-32" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
