"use client";

import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Printer,
  Check,
  XCircle,
  Download,
  Filter,
  Receipt,
} from 'lucide-react';
import type { Contract, Invoice, InvoiceStatus } from '@/types';
import { formatCurrency, formatDate } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { fetchInvoices, updateInvoice } from '@/lib/api/invoices';
import { fetchContracts } from '@/lib/api/contracts';
import { fetchTermins } from '@/lib/api/termins';
import * as XLSX from 'xlsx';

export default function Invoices() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);
  const [terminNameById, setTerminNameById] = useState<Record<string, string>>({});

  const filteredInvoices = invoices
    .filter((invoice) => {
      const matchesSearch = invoice.invoiceNumber
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || invoice.status === filterStatus;
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
        const [invoiceData, contractData] = await Promise.all([
          fetchInvoices(),
          fetchContracts(),
        ]);
        if (!active) return;
        setInvoices(invoiceData);
        setContracts(contractData);
        const contractIds = Array.from(
          new Set(invoiceData.map((invoice) => invoice.contractId))
        );
        const terminsList = (
          await Promise.all(
            contractIds.map((id) => fetchTermins(id).catch(() => []))
          )
        ).flat();
        const nextTerminMap: Record<string, string> = {};
        for (const termin of terminsList) {
          nextTerminMap[termin.id] = termin.terminName;
        }
        if (active) {
          setTerminNameById(nextTerminMap);
        }
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

  const visibleInvoices = filteredInvoices.slice(0, visibleCount);

  const handlePrintPdf = (invoice: Invoice) => {
    toast({
      title: 'Template Belum Tersedia',
      description: 'Template PDF invoice akan tersedia segera',
    });
  };

  const handleMarkAsIssued = async (invoice: Invoice) => {
    try {
      const updated = await updateInvoice(invoice.id, {
        status: 'ISSUED',
      });
      setInvoices(invoices.map((i) => (i.id === updated.id ? updated : i)));
      toast({
        title: 'Status Updated',
        description: `Invoice ${invoice.invoiceNumber} telah di-issued`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal update status invoice',
        variant: 'destructive',
      });
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice) => {
    try {
      const updated = await updateInvoice(invoice.id, {
        status: 'PAID',
      });
      setInvoices(invoices.map((i) => (i.id === updated.id ? updated : i)));
      toast({
        title: 'Payment Received',
        description: `Invoice ${invoice.invoiceNumber} telah lunas`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal update invoice',
        variant: 'destructive',
      });
    }
  };

  const handleVoidInvoice = async (invoice: Invoice) => {
    try {
      const updated = await updateInvoice(invoice.id, {
        status: 'VOID',
      });
      setInvoices(invoices.map((i) => (i.id === updated.id ? updated : i)));
      toast({
        title: 'Invoice Voided',
        description: `Invoice ${invoice.invoiceNumber} telah di-void`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal void invoice',
        variant: 'destructive',
      });
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

    const rows = filteredInvoices.map((invoice) => {
      const contractInfo = getContractInfo(invoice.contractId);
      return {
        'No. Invoice': invoice.invoiceNumber,
        'Tgl Invoice': formatDate(new Date(invoice.invoiceDate)),
        'No. Proposal': contractInfo.number,
        Termin: terminNameById[invoice.terminId] ?? '',
        Nominal: Number(invoice.amount),
        Status: invoice.status,
        created_at: formatDateTime(invoice.createdAt),
        updated_at: formatDateTime(invoice.updatedAt),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
    const fileName = `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
    toast({
      title: 'Export Excel',
      description: 'File Excel sudah diunduh.',
    });
  };

  const getInvoiceStatusColor = (status: InvoiceStatus) => {
    switch (status) {
      case 'PAID':
        return 'bg-success text-success-foreground';
      case 'ISSUED':
        return 'bg-primary text-primary-foreground';
      case 'DRAFT':
        return 'bg-muted text-muted-foreground';
      case 'VOID':
        return 'bg-destructive text-destructive-foreground';
      default:
        return '';
    }
  };

  const getContractInfo = (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId);
    return contract
      ? { number: contract.proposalNumber, client: contract.client?.name }
      : { number: '-', client: '-' };
  };

  if (isLoading) {
    return (
      <AdminLayout title="Invoices">
        <InvoicesSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Invoices">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-xl">Daftar Invoices</CardTitle>
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-2 md:items-center">
            <Button variant="outline" onClick={handleExportExcel} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button
              onClick={() =>
                toast({ title: 'Info', description: 'Buat invoice dari halaman Contract Detail' })
              }
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Buat Invoice
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={filterStatus}
              onValueChange={(value) => setFilterStatus(value as InvoiceStatus | 'ALL')}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ISSUED">Issued</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Invoice</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Receipt className="w-8 h-8" />
                          <p>Tidak ada invoice ditemukan</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleInvoices.map((invoice) => {
                      const contractInfo = getContractInfo(invoice.contractId);
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono font-medium">
                            {invoice.invoiceNumber}
                          </TableCell>
                          <TableCell>{formatDate(new Date(invoice.invoiceDate))}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {contractInfo.number}
                          </TableCell>
                          <TableCell>{contractInfo.client}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(invoice.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge className={getInvoiceStatusColor(invoice.status)}>
                              {invoice.status}
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
                                <DropdownMenuItem>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Detail
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintPdf(invoice)}>
                                  <Printer className="w-4 h-4 mr-2" />
                                  Print PDF
                                </DropdownMenuItem>
                                {invoice.status === 'DRAFT' && (
                                  <DropdownMenuItem onClick={() => handleMarkAsIssued(invoice)}>
                                    <Check className="w-4 h-4 mr-2" />
                                    Mark as Issued
                                  </DropdownMenuItem>
                                )}
                                {invoice.status === 'ISSUED' && (
                                  <DropdownMenuItem onClick={() => handleMarkAsPaid(invoice)}>
                                    <Check className="w-4 h-4 mr-2" />
                                    Mark as Paid
                                  </DropdownMenuItem>
                                )}
                                {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => handleVoidInvoice(invoice)}
                                    >
                                      <XCircle className="w-4 h-4 mr-2" />
                                      Void Invoice
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {filteredInvoices.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
                  <Receipt className="w-8 h-8" />
                  <p>Tidak ada invoice ditemukan</p>
                </div>
              ) : (
                visibleInvoices.map((invoice) => {
                  const contractInfo = getContractInfo(invoice.contractId);
                  return (
                    <div key={invoice.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">No. Invoice</p>
                          <p className="font-mono text-sm font-medium">
                            {invoice.invoiceNumber}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">Contract</p>
                          <p className="font-mono text-sm">{contractInfo.number}</p>
                          <p className="text-xs text-muted-foreground mt-2">Client</p>
                          <p className="text-sm">{contractInfo.client}</p>
                        </div>
                        <Badge className={getInvoiceStatusColor(invoice.status)}>
                          {invoice.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {formatDate(new Date(invoice.invoiceDate))}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(invoice.amount)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="w-4 h-4 mr-2" />
                              View Detail
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrintPdf(invoice)}>
                              <Printer className="w-4 h-4 mr-2" />
                              Print PDF
                            </DropdownMenuItem>
                            {invoice.status === 'DRAFT' && (
                              <DropdownMenuItem onClick={() => handleMarkAsIssued(invoice)}>
                                <Check className="w-4 h-4 mr-2" />
                                Mark as Issued
                              </DropdownMenuItem>
                            )}
                            {invoice.status === 'ISSUED' && (
                              <DropdownMenuItem onClick={() => handleMarkAsPaid(invoice)}>
                                <Check className="w-4 h-4 mr-2" />
                                Mark as Paid
                              </DropdownMenuItem>
                            )}
                            {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleVoidInvoice(invoice)}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Void Invoice
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {visibleInvoices.length < filteredInvoices.length && (
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
    </AdminLayout>
  );
}

function InvoicesSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-6 w-44" />
        <div className="grid w-full gap-2 md:w-auto md:grid-cols-2 md:items-center">
          <Skeleton className="h-9 w-full md:w-28" />
          <Skeleton className="h-9 w-full md:w-32" />
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
