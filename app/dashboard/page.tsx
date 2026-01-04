"use client";

import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, Receipt, TrendingUp, Clock, ArrowRight, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/numbering';
import { fetchDashboardKPI, fetchDashboardMonthly } from '@/lib/api/dashboard';
import { fetchContracts } from '@/lib/api/contracts';
import { fetchInvoices } from '@/lib/api/invoices';
import type { Contract, DashboardKPI, DashboardMonthlyDatum, Invoice } from '@/types';
import { useRouter } from 'next/navigation';
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

export default function Dashboard() {
  const router = useRouter();
  const [kpi, setKpi] = useState<DashboardKPI | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [monthlyData, setMonthlyData] = useState<DashboardMonthlyDatum[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quickActionLoading, setQuickActionLoading] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [kpiData, contractData, invoiceData, monthlyData] = await Promise.all([
          fetchDashboardKPI(),
          fetchContracts(),
          fetchInvoices(),
          fetchDashboardMonthly(),
        ]);
        if (!active) return;
        setKpi(kpiData);
        setContracts(contractData);
        setInvoices(invoiceData);
        setMonthlyData(monthlyData);
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

  const kpiSafe: DashboardKPI = kpi ?? {
    totalContracts: 0,
    totalContractValue: 0,
    totalPaymentReceived: 0,
    pendingPayments: 0,
  };

  if (isLoading) {
    return (
      <AdminLayout title="Dashboard">
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  const kpiCards = [
    {
      title: 'Total Contracts',
      value: kpiSafe.totalContracts.toString(),
      subtitle: 'Active contracts',
      icon: FileText,
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Contract Value',
      value: formatCurrency(kpiSafe.totalContractValue),
      subtitle: 'Total nilai kontrak',
      icon: TrendingUp,
      color: 'bg-success/10 text-success',
    },
    {
      title: 'Payment Received',
      value: formatCurrency(kpiSafe.totalPaymentReceived),
      subtitle: 'Total diterima',
      icon: Receipt,
      color: 'bg-chart-1/20 text-chart-1',
    },
    {
      title: 'Pending Payments',
      value: formatCurrency(kpiSafe.pendingPayments),
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
            <CardContent className="p-4 md:p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-xl font-bold">{card.value}</p>
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
            <CardDescription>Jumlah kontrak tahun ini</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 md:h-64">
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
            <CardDescription>Trend pembayaran tahun ini</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 md:h-64">
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
          onClick={() => {
            setQuickActionLoading('contracts');
            router.push('/contracts');
          }}
        >
          <div className="flex items-center gap-3">
            {quickActionLoading === 'contracts' ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Plus className="w-5 h-5 text-primary" />
            )}
            <span>Lihat Contracts</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button
          variant="outline"
          className="h-auto p-4 flex items-center justify-between"
          onClick={() => {
            setQuickActionLoading('invoices');
            router.push('/invoices');
          }}
        >
          <div className="flex items-center gap-3">
            {quickActionLoading === 'invoices' ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Plus className="w-5 h-5 text-primary" />
            )}
            <span>Lihat Invoices</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button
          variant="outline"
          className="h-auto p-4 flex items-center justify-between"
          onClick={() => {
            setQuickActionLoading('clients');
            router.push('/clients');
          }}
        >
          <div className="flex items-center gap-3">
            {quickActionLoading === 'clients' ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Plus className="w-5 h-5 text-primary" />
            )}
            <span>Lihat Clients</span>
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
            <Button variant="ghost" size="sm" onClick={() => router.push('/contracts')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.slice(0, 5).map((contract) => (
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
            </div>
            <div className="space-y-3 md:hidden">
              {contracts.slice(0, 5).map((contract) => (
                <div key={contract.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Number</p>
                      <p className="font-mono text-sm font-medium">
                        {contract.proposalNumber}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">Client</p>
                      <p className="text-sm">{contract.client?.name}</p>
                    </div>
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
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Invoices & Letters */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Invoices</CardTitle>
              <CardDescription>Invoice terbaru</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.slice(0, 5).map((invoice) => (
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
            </div>
            <div className="space-y-3 md:hidden">
              {invoices.slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Number</p>
                      <p className="font-mono text-sm font-medium">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">Amount</p>
                      <p className="text-sm">{formatCurrency(invoice.amount)}</p>
                    </div>
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
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-11 w-11 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-md" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-8 w-16" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, row) => (
                  <Skeleton key={row} className="h-5 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
