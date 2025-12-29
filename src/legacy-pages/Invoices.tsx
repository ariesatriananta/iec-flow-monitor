import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

export default function Invoices() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'ALL'>('ALL');

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch = invoice.invoiceNumber
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || invoice.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

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
      } catch (error) {
        console.error(error);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, []);

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
    toast({
      title: 'Export Excel',
      description: 'File Excel sedang diunduh...',
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

  return (
    <AdminLayout title="Invoices">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl">Daftar Invoices</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={() => toast({ title: 'Info', description: 'Buat invoice dari halaman Contract Detail' })}>
              <Plus className="w-4 h-4 mr-2" />
              Buat Invoice
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
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
              <SelectTrigger className="w-[150px]">
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
                  filteredInvoices.map((invoice) => {
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
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
