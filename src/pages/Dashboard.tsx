import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, Receipt, TrendingUp, Clock, ArrowRight, Plus } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/numbering';
import { getDashboardKPI, mockContracts, mockInvoices, mockLetters } from '@/data/mockData';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

const monthlyData = [
  { month: 'Jul', contracts: 8, payments: 450000000 },
  { month: 'Aug', contracts: 12, payments: 680000000 },
  { month: 'Sep', contracts: 10, payments: 520000000 },
  { month: 'Oct', contracts: 15, payments: 890000000 },
  { month: 'Nov', contracts: 11, payments: 720000000 },
  { month: 'Dec', contracts: 14, payments: 950000000 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const kpi = getDashboardKPI();

  const kpiCards = [
    {
      title: 'Total Contracts',
      value: kpi.totalContracts.toString(),
      subtitle: 'Active contracts',
      icon: FileText,
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Contract Value',
      value: formatCurrency(kpi.totalContractValue),
      subtitle: 'Total nilai kontrak',
      icon: TrendingUp,
      color: 'bg-success/10 text-success',
    },
    {
      title: 'Payment Received',
      value: formatCurrency(kpi.totalPaymentReceived),
      subtitle: 'Total diterima',
      icon: Receipt,
      color: 'bg-chart-1/20 text-chart-1',
    },
    {
      title: 'Pending Payments',
      value: formatCurrency(kpi.pendingPayments),
      subtitle: 'Menunggu pembayaran',
      icon: Clock,
      color: 'bg-warning/10 text-warning',
    },
  ];

  return (
    <AdminLayout title="Dashboard">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((card) => (
          <Card key={card.title} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                </div>
                <div className={`p-3 rounded-lg ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Contracts Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contracts per Month</CardTitle>
            <CardDescription>Jumlah kontrak 6 bulan terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                  />
                  <Bar dataKey="contracts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Payment Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Trend</CardTitle>
            <CardDescription>Trend pembayaran 6 bulan terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis 
                    className="text-xs" 
                    tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Payments']}
                  />
                  <Line
                    type="monotone"
                    dataKey="payments"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--success))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Button
          variant="outline"
          className="h-auto p-4 flex items-center justify-between"
          onClick={() => navigate('/contracts/new')}
        >
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-primary" />
            <span>Tambah Contract</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button
          variant="outline"
          className="h-auto p-4 flex items-center justify-between"
          onClick={() => navigate('/invoices/new')}
        >
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-primary" />
            <span>Buat Invoice</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button
          variant="outline"
          className="h-auto p-4 flex items-center justify-between"
          onClick={() => navigate('/clients/new')}
        >
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-primary" />
            <span>Tambah Client</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Contracts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Contracts</CardTitle>
              <CardDescription>Kontrak terbaru</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/contracts')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockContracts.slice(0, 5).map((contract) => (
                  <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">
                      {contract.proposalNumber}
                    </TableCell>
                    <TableCell>{contract.client?.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          contract.paymentStatus === 'PAID'
                            ? 'default'
                            : contract.paymentStatus === 'PARTIAL'
                            ? 'secondary'
                            : 'outline'
                        }
                        className={
                          contract.paymentStatus === 'PAID'
                            ? 'bg-success text-success-foreground'
                            : ''
                        }
                      >
                        {contract.paymentStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Invoices & Letters */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Invoices</CardTitle>
              <CardDescription>Invoice terbaru</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockInvoices.slice(0, 5).map((invoice) => (
                  <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.status === 'PAID'
                            ? 'default'
                            : invoice.status === 'ISSUED'
                            ? 'secondary'
                            : 'outline'
                        }
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
