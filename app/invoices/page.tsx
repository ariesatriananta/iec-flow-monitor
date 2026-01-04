"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Download,
  Filter,
  Receipt,
} from 'lucide-react';
import type { Contract, Invoice, InvoiceStatus } from '@/types';
import { formatCurrency, formatDate } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { fetchInvoices } from '@/lib/api/invoices';
import { fetchContracts } from '@/lib/api/contracts';
import { fetchTermins } from '@/lib/api/termins';
import { fetchSettings, type SettingsPayload } from '@/lib/api/settings';
import * as XLSX from 'xlsx';
import { terbilang } from '@/lib/terbilang';

export default function Invoices() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);
  const [terminNameById, setTerminNameById] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [headerDataUrl, setHeaderDataUrl] = useState<string>('');
  const [settings, setSettings] = useState<SettingsPayload | null>(null);

  const searchQuery = searchParams.get('q') ?? '';
  const filterStatus = (searchParams.get('status') ?? 'ALL') as InvoiceStatus | 'ALL';
  const filterClientId = searchParams.get('client') ?? 'ALL';

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredInvoices = invoices
    .filter((invoice) => {
      const contract = contracts.find((c) => c.id === invoice.contractId);
      const matchesSearch =
        searchLower.length === 0 ||
        invoice.invoiceNumber.toLowerCase().includes(searchLower) ||
        (contract?.proposalNumber ?? '').toLowerCase().includes(searchLower);
      const matchesStatus = filterStatus === 'ALL' || invoice.status === filterStatus;
      const matchesClient =
        filterClientId === 'ALL' || contract?.clientId === filterClientId;
      return matchesSearch && matchesStatus && matchesClient;
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
    let active = true;
    const loadSettings = async () => {
      try {
        const data = await fetchSettings();
        if (active) setSettings(data);
      } catch (error) {
        console.error(error);
      }
    };
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery, filterStatus, filterClientId]);

  const setQueryParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'ALL') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const clientOptions = Array.from(
    new Map(
      contracts
        .filter((contract) => contract.client)
        .map((contract) => [contract.clientId, contract.client?.name ?? ''])
    )
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const visibleInvoices = filteredInvoices.slice(0, visibleCount);

  const handleOpenPreview = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsPreviewOpen(true);
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

  const getContractById = (contractId: string) =>
    contracts.find((c) => c.id === contractId);

  const formatDateLong = (value: Date | string) =>
    new Date(value).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

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

  const getInvoicePreviewData = (invoice: Invoice) => {
    const contract = getContractById(invoice.contractId);
    const client = contract?.client;
    const terminName = terminNameById[invoice.terminId] ?? '';
    const descriptionParts = [contract?.contractTitle, terminName].filter(Boolean);
    const description = descriptionParts.join('\n');
    const dpp = Number(invoice.amount);
    const ppnRate = Number(settings?.defaultPpnRate ?? 11);
    const ppn = Math.round(dpp * (ppnRate / 100));
    const total = dpp + ppn;
    return {
      contractNumber: contract?.proposalNumber ?? '-',
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: formatDateLong(invoice.invoiceDate),
      clientName: client?.name ?? '-',
      clientAddress: client?.address ?? '-',
      clientPic: client?.picName ?? '-',
      description: description || '-',
      dpp,
      ppn,
      ppnRate,
      total,
      terbilang: terbilang(total).toUpperCase(),
      signerName: settings?.defaultSignerName || 'Anita Rahman, CPA',
      companyName: settings?.companyName || '',
      companyAddress: settings?.companyAddress || '',
      companyPhone: settings?.companyPhone || '',
      companyEmail: settings?.companyEmail || '',
      companyLogoUrl: settings?.companyLogoUrl || '',
      createdAt: formatDateTime(invoice.createdAt),
      updatedAt: formatDateTime(invoice.updatedAt),
    };
  };

  const handlePrintInvoice = () => {
    if (!selectedInvoice) return;
    const data = getInvoicePreviewData(selectedInvoice);
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) return;
    const headerUrl = headerDataUrl || `${window.location.origin}/invoice-header.png`;
    const logoUrl = data.companyLogoUrl || `${window.location.origin}/logo-1.png`;
    const descriptionHtml = data.description.replace(/\n/g, '<br/>');
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice ${data.invoiceNumber}</title>
          <style>
              @page { size: A4; margin: 20mm; }
              :root { --primary: #1e4e8c; --primary-soft: #e7eef8; --border: #94a3b8; --muted: #6b7280; }
            body { font-family: "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
            .page { page-break-after: always; }
            .header { position: relative; height: 180px; margin-bottom: 18px; }
            .header-bg { position: absolute; inset: 0; background-image: url('${headerUrl}'); background-size: cover; background-position: top center; }
            .header-content { position: relative; text-align: center; padding-top: 175px; }
            .page:last-child { page-break-after: auto; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            .title { font-size: 18px; font-weight: 700; letter-spacing: 1px; color: var(--primary); }
            .meta { display: flex; justify-content: space-between; margin-top: 46px; font-size: 12px; }
            .meta .left { max-width: 60%; }
              .box {
                border: 0.5px solid var(--border);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: none;
                }
              .table,
                .totals,
                .note-table,
                .kw-table {
                width: 100%;
                border-collapse: collapse; /* penting untuk rapihin garis */
                margin-top: 0;
                font-size: 12px;
                border: none; /* ✅ HILANGKAN border luar table */
                }
                
              .table th, .table td { border: none; padding: 8px; vertical-align: top; }
              .table tr + tr td { border-top: 1px solid var(--border); }
              .table th { text-align: left; background: var(--primary-soft); color: var(--primary); }
              .table tbody tr:nth-child(even) { background: #f2f6fc; }
              .right { text-align: right; }
              
              .totals td { border: none; padding: 6px 8px; }
              .totals tr + tr td { border-top: 1px solid var(--border); }
              .note { font-size: 12px; }
              .sign { text-align: right; font-size: 12px; }
              
              .note-table td { border: none; padding: 10px; vertical-align: bottom; }
              .kw-title { text-align: center; font-size: 16px; font-weight: 700; margin-top: 8px; }
              
              .kw-table td { border: none; padding: 8px; vertical-align: top; }
              .kw-table tr + tr td { border-top: 1px solid var(--border); }
              .kw-label { width: 180px; }
              .kw-box { border: 0.5px solid var(--border); padding: 6px 10px; display: inline-block; }
            .kw-amount { font-size: 14px; font-weight: 700; }
            .spacer { height: 120px; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="header-bg"></div>
              <div class="header-content">
                <div class="title">FAKTUR TAGIHAN</div>
              </div>
            </div>
            <div class="meta">
              <div class="left">
                <div><strong>${data.clientName}</strong></div>
                <div>${data.clientAddress}</div>
                <div style="padding-top: 0.5rem;">Up : ${data.clientPic}</div>
              </div>
              <div class="right">
                <table style="margin-left:auto;font-size:12px;">
                  <tr>
                    <td style="padding:0 10px 4px 0; font-weight:600;">No. Invoice</td>
                    <td style="padding:0 8px 4px 0;">:</td>
                    <td style="text-align:left;">${data.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding-right:10px; font-weight:600;">Reff</td>
                    <td style="padding-right:8px;">:</td>
                    <td style="text-align:left;">${data.contractNumber}</td>
                  </tr>
                </table>
              </div>
            </div>
              <div class="box" style="margin-top:14px;">
              <table class="table">
              <thead>
                <tr>
                  <th style="width: 40px;">No</th>
                  <th>Keterangan</th>
                  <th style="width: 180px;" class="right">Nilai (Rp)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>${descriptionHtml}</td>
                  <td class="right">${formatCurrency(data.dpp)}</td>
                </tr>
              </tbody>
              </table>
              </div>
              <div class="box" style="margin-top:8px;">
              <table class="totals">
              <tr>
                <td class="right">TOTAL</td>
                <td class="right" style="width: 180px;">${formatCurrency(data.dpp)}</td>
              </tr>
              <tr>
                <td class="right">PPN (${data.ppnRate}%)</td>
                <td class="right">${formatCurrency(data.ppn)}</td>
              </tr>
              <tr>
                <td class="right"><strong>TOTAL TAGIHAN</strong></td>
                <td class="right"><strong>${formatCurrency(data.total)}</strong></td>
              </tr>
              </table>
              </div>
              <div class="box" style="margin-top:12px;">
              <table class="note-table">
              <tr>
                <td class="note">
                  <div><strong>Catatan:</strong></div>
                  <div>Pembayaran dapat dilakukan dengan cara transfer kepada:</div>
                  <div>KAP KRISNAWAN, NUGROHO & FAHMY</div>
                  <div>BANK MANDIRI</div>
                  <div>KCP JAKARTA LEBAK BULUS</div>
                  <div>No. Rekening 101-00-1469009-1</div>
                  <div>Bukti transfer email office.rasunasaid@knfdts.id</div>
                </td>
                <td class="sign" style="width: 176px;">
                  <div>Jakarta, ${data.invoiceDate}</div>
                  <div class="spacer"></div>
                  <div>${data.signerName}</div>
                </td>
              </tr>
              </table>
              </div>
          </div>
          <div class="page">
            <div class="header">
              <div class="header-bg"></div>
              <div class="header-content">
                <div class="title">KWITANSI</div>
              </div>
            </div>
              <div class="box" style="margin-top:44px;">
              <table class="kw-table">
              <tr>
                <td class="kw-label">No:</td>
                <td>${data.invoiceNumber}</td>
              </tr>
              <tr>
                <td class="kw-label">TELAH DITERIMA DARI:</td>
                <td>${data.clientName}</td>
              </tr>
              <tr>
                <td class="kw-label">UANG SEJUMLAH:</td>
                <td><span class="kw-box">#${data.terbilang}#</span></td>
              </tr>
              <tr>
                <td class="kw-label">UNTUK PEMBAYARAN:</td>
                <td>${descriptionHtml}</td>
              </tr>
              <tr>
                <td class="kw-label">JUMLAH:</td>
                <td class="kw-amount">${formatCurrency(data.total)}</td>
              </tr>
              <tr>
                <td></td>
                <td class="sign">
                  <div>Jakarta, ${data.invoiceDate}</div>
                  <div class="spacer"></div>
                  <div>${data.signerName}</div>
                </td>
              </tr>
              </table>
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
          <div className="grid w-full gap-2 md:w-auto md:items-center">
            <Button variant="outline" onClick={handleExportExcel} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor invoice/contract..."
                value={searchQuery}
                onChange={(e) => setQueryParam('q', e.target.value.trim())}
                className="pl-9"
              />
            </div>
            <Select
              value={filterClientId}
              onValueChange={(value) => setQueryParam('client', value)}
            >
              <SelectTrigger className="w-full md:w-[220px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Client</SelectItem>
                {clientOptions.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterStatus}
              onValueChange={(value) => setQueryParam('status', value)}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
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
                              <DropdownMenuItem onClick={() => handleOpenPreview(invoice)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Detail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenPreview(invoice)}>
                                <Printer className="w-4 h-4 mr-2" />
                                Print PDF
                              </DropdownMenuItem>
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
                            <DropdownMenuItem onClick={() => handleOpenPreview(invoice)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Detail
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenPreview(invoice)}>
                              <Printer className="w-4 h-4 mr-2" />
                              Print PDF
                            </DropdownMenuItem>
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

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) setSelectedInvoice(null);
        }}
      >
        <DialogContent className="sm:max-w-[900px] h-[85vh] bg-muted p-0 grid grid-rows-[auto,1fr,auto]">
          <DialogHeader className="bg-muted/95 px-6 py-4 backdrop-blur">
            <DialogTitle>Preview Invoice</DialogTitle>
            <DialogDescription>
              Pastikan data sudah sesuai sebelum print.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto px-6 pb-6">
            {selectedInvoice && (
              <InvoicePreview
                invoice={selectedInvoice}
                data={getInvoicePreviewData(selectedInvoice)}
                headerSrc={headerDataUrl || "/invoice-header.png"}
              />
            )}
          </div>
          <DialogFooter className="gap-2 bg-muted/95 px-6 py-4 backdrop-blur border-t">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Tutup
            </Button>
            <Button onClick={handlePrintInvoice}>Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

interface InvoicePreviewData {
  contractNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  clientAddress: string;
  clientPic: string;
  description: string;
  dpp: number;
  ppn: number;
  ppnRate: number;
  total: number;
  terbilang: string;
  signerName: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyLogoUrl: string;
  createdAt: string;
  updatedAt: string;
}

function InvoicePreview({
  invoice,
  data,
  headerSrc,
}: {
  invoice: Invoice;
  data: InvoicePreviewData;
  headerSrc: string;
}) {
  return (
    <div className="space-y-8 rounded-md bg-white p-6 text-black">
        <div className="space-y-4">
          <div className="relative h-44">
            <div
              className="absolute inset-0 bg-cover bg-top"
              style={{ backgroundImage: `url(${headerSrc})` }}
            />
          </div>
          <h3 className="mt-4 text-center text-lg font-bold tracking-wide text-primary">FAKTUR TAGIHAN</h3>
          <div className="mt-4 flex flex-col gap-4 text-sm md:flex-row md:justify-between">
            <div className="space-y-1">
              <p className="font-semibold">{data.clientName}</p>
            <p>{data.clientAddress}</p>
            <p className='py-2'>Up : {data.clientPic}</p>
          </div>
          <div className="text-left md:text-right">
            <div className="inline-block text-left">
              <div className="flex items-center gap-2">
                <span className="min-w-[86px] text-right font-semibold">No. Invoice</span>
                <span className="w-3 text-center">:</span>
                <span>{data.invoiceNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-[86px] text-right font-semibold">Reff</span>
                <span className="w-3 text-center">:</span>
                <span>{data.contractNumber}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-auto rounded-md border border-slate-300">
          <table className="w-full text-sm">
            <thead className="bg-primary/10 text-left text-primary uppercase tracking-wide">
              <tr>
                <th className="border-b border-slate-300 p-2 w-10">No</th>
                  <th className="border-b border-slate-300 p-2">Keterangan</th>
                  <th className="border-b border-slate-300 p-2 text-right w-40">Nilai (Rp)</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-slate-50">
              <tr>
                  <td className="border-b border-slate-200 p-2">1</td>
                  <td className="border-b border-slate-200 p-2 whitespace-pre-line">
                    {data.description}
                  </td>
                  <td className="border-b border-slate-200 p-2 text-right">
                    {formatCurrency(data.dpp)}
                  </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-auto rounded-md border border-slate-300">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                  <td className="border-b border-slate-300 p-2 text-right w-[70%]">TOTAL</td>
                  <td className="border-b border-slate-300 p-2 text-right">
                    {formatCurrency(data.dpp)}
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-slate-300 p-2 text-right">PPN ({data.ppnRate}%)</td>
                  <td className="border-b border-slate-300 p-2 text-right">
                    {formatCurrency(data.ppn)}
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-slate-300 p-2 text-right font-semibold">
                    TOTAL TAGIHAN
                  </td>
                  <td className="border-b border-slate-300 p-2 text-right font-semibold">
                    {formatCurrency(data.total)}
                  </td>
                </tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-auto rounded-md border border-slate-300 text-sm">
          <table className="w-full">
            <tbody>
              <tr>
                  <td className="border-b border-slate-300 p-3 align-top w-[60%]">
                    <p className="font-semibold">Catatan:</p>
                  <p>Pembayaran dapat dilakukan dengan cara transfer kepada:</p>
                  <p>KAP KRISNAWAN, NUGROHO & FAHMY</p>
                  <p>BANK MANDIRI</p>
                  <p>KCP JAKARTA LEBAK BULUS</p>
                  <p>No. Rekening 101-00-1469009-1</p>
                  <p>Bukti transfer email ke office.rasunasaid@knfdts.id</p>
                </td>
                  <td className="border-b border-slate-300 p-3 align-top text-right w-[40%]">
                    <p>Jakarta, {data.invoiceDate}</p>
                  <div className="h-32" />
                  <p>{data.signerName}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative h-44">
          <div
            className="absolute inset-0 bg-cover bg-top"
            style={{ backgroundImage: `url(${headerSrc})` }}
          />
        </div>
          <h3 className="mt-4 text-center text-lg font-bold tracking-wide text-primary">KWITANSI</h3>
        <div className="mt-4 overflow-auto rounded-md border border-slate-300">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                  <td className="border-b border-slate-300 p-2 w-[180px]">No:</td>
                  <td className="border-b border-slate-300 p-2">{invoice.invoiceNumber}</td>
                </tr>
                <tr>
                  <td className="border-b border-slate-300 p-2">TELAH DITERIMA DARI:</td>
                  <td className="border-b border-slate-300 p-2">{data.clientName}</td>
                </tr>
                <tr>
                  <td className="border-b border-slate-300 p-2">UANG SEJUMLAH:</td>
                  <td className="border-b border-slate-300 p-2 font-semibold">
                    #{data.terbilang}#
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-slate-300 p-2">UNTUK PEMBAYARAN:</td>
                  <td className="border-b border-slate-300 p-2 whitespace-pre-line">
                    {data.description}
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-slate-300 p-2">JUMLAH:</td>
                  <td className="border-b border-slate-300 p-2 font-semibold">
                    {formatCurrency(data.total)}
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-slate-300 p-2"></td>
                  <td className="border-b border-slate-300 p-2 text-right">
                    <p>Jakarta, {data.invoiceDate}</p>
                  <div className="h-28" />
                  <p>{data.signerName}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
