import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Download,
  FileText,
  CalendarIcon,
  Filter,
} from 'lucide-react';
import { mockContracts, mockClients } from '@/data/mockData';
import type { Contract, ServiceCode, PaymentStatus, ContractStatus } from '@/types';
import { formatCurrency, formatDate, generateProposalNumber } from '@/lib/numbering';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function Contracts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>(mockContracts);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'ALL'>('ALL');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    proposalDate: new Date(),
    serviceCode: 'A' as ServiceCode,
    contractTitle: '',
    contractValue: '',
    notes: '',
  });

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      contract.proposalNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.client?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || contract.paymentStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

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
    }
    setIsDialogOpen(true);
  };

  const getNextSeqNo = (date: Date) => {
    const month = date.getMonth();
    const year = date.getFullYear();
    const existingInMonth = contracts.filter((c) => {
      const cDate = new Date(c.proposalDate);
      return cDate.getMonth() === month && cDate.getFullYear() === year;
    });
    return existingInMonth.length + 1;
  };

  const getNextEngagementNo = (clientId: string) => {
    const clientContracts = contracts.filter((c) => c.clientId === clientId);
    if (clientContracts.length === 0) return 1;
    return Math.max(...clientContracts.map((c) => c.engagementNo)) + 1;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const client = mockClients.find((c) => c.id === formData.clientId);
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
      setContracts(
        contracts.map((c) =>
          c.id === editingContract.id
            ? {
                ...c,
                contractTitle: formData.contractTitle,
                contractValue,
                notes: formData.notes,
                updatedAt: new Date(),
              }
            : c
        )
      );
      toast({
        title: 'Success',
        description: 'Contract berhasil diupdate',
      });
    } else {
      // Create new contract
      const seqNo = getNextSeqNo(formData.proposalDate);
      const engagementNo = getNextEngagementNo(formData.clientId);
      const proposalNumber = generateProposalNumber({
        seqNo,
        serviceCode: formData.serviceCode,
        clientCode: client.code,
        engagementNo,
        proposalDate: formData.proposalDate,
      });

      const newContract: Contract = {
        id: Date.now().toString(),
        proposalDate: formData.proposalDate,
        clientId: formData.clientId,
        client,
        serviceCode: formData.serviceCode,
        engagementNo,
        seqNo,
        proposalNumber,
        contractTitle: formData.contractTitle,
        contractValue,
        paymentStatus: 'UNPAID',
        status: 'ACTIVE',
        notes: formData.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setContracts([...contracts, newContract]);
      toast({
        title: 'Success',
        description: `Contract ${proposalNumber} berhasil dibuat`,
      });
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleVoidContract = (contract: Contract) => {
    setContracts(
      contracts.map((c) =>
        c.id === contract.id
          ? { ...c, status: 'VOID' as ContractStatus, updatedAt: new Date() }
          : c
      )
    );
    toast({
      title: 'Contract Voided',
      description: `Contract ${contract.proposalNumber} telah di-void`,
    });
  };

  const handleExportExcel = () => {
    toast({
      title: 'Export Excel',
      description: 'File Excel sedang diunduh...',
    });
    // TODO: Implement actual Excel export
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

  return (
    <AdminLayout title="Contracts">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl">Daftar Contracts</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Tambah Contract
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
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
              <SelectTrigger className="w-[180px]">
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
                  filteredContracts.map((contract) => (
                    <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-sm font-medium">
                        {contract.proposalNumber}
                      </TableCell>
                      <TableCell>{formatDate(new Date(contract.proposalDate))}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{contract.client?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {contract.client?.code}
                          </p>
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
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate(`/contracts/${contract.id}`)}
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
              <div className="grid grid-cols-2 gap-4">
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
                      {mockClients
                        .filter((c) => c.isActive)
                        .map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.code} - {client.name}
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
              <div className="grid grid-cols-2 gap-4">
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
                      <SelectItem value="NA">NA (Non-Audit)</SelectItem>
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
                onClick={() => setIsDialogOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit">
                {editingContract ? 'Update' : 'Buat Contract'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
