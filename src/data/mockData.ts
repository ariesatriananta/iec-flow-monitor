import type { Client, Contract, Termin, Invoice, Letter } from '@/types';

// Sample Clients
export const mockClients: Client[] = [
  {
    id: '1',
    name: 'PT Astra Prima Indonesiaaaa',
    code: '2',
    address: 'Jl. Sudirman No. 123, Jakarta Pusat',
    picName: 'Budi Santoso',
    email: 'budi@astraprima.co.id',
    phone: '021-5551234',
    isActive: true,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  },
  {
    id: '2',
    name: 'PT Berkah Mandiri Sejahtera',
    code: '3',
    address: 'Jl. Gatot Subroto No. 45, Jakarta Selatan',
    picName: 'Siti Rahayu',
    email: 'siti@berkahms.com',
    phone: '021-5559876',
    isActive: true,
    createdAt: new Date('2024-02-20'),
    updatedAt: new Date('2024-02-20')
  },
  {
    id: '3',
    name: 'CV Cahaya Nusantara',
    code: '4',
    address: 'Jl. Pemuda No. 78, Surabaya',
    picName: 'Ahmad Wijaya',
    email: 'ahmad@cahayanusantara.id',
    phone: '031-5557890',
    isActive: true,
    createdAt: new Date('2024-03-10'),
    updatedAt: new Date('2024-03-10')
  },
  {
    id: '4',
    name: 'PT Delta Konsultan',
    code: '1',
    address: 'Jl. Diponegoro No. 12, Bandung',
    picName: 'Dewi Lestari',
    email: 'dewi@deltakonsultan.co.id',
    phone: '022-5554321',
    isActive: false,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-06-15')
  },
  {
    id: '5',
    name: 'PT Energi Lestari',
    code: '5',
    address: 'Jl. Rasuna Said No. 56, Jakarta Selatan',
    picName: 'Eko Prasetyo',
    email: 'eko@energilestari.com',
    phone: '021-5558765',
    isActive: true,
    createdAt: new Date('2024-04-01'),
    updatedAt: new Date('2024-04-01')
  }
];

// Sample Contracts
export const mockContracts: Contract[] = [
  {
    id: '1',
    proposalDate: new Date('2024-12-01'),
    clientId: '1',
    client: mockClients[0],
    serviceCode: 'A',
    engagementNo: 1,
    seqNo: 1,
    proposalNumber: 'P.001/A/AP.2137-1/XII/2024',
    contractTitle: 'Audit Laporan Keuangan 2024',
    contractValue: 150000000,
    paymentStatus: 'PARTIAL',
    status: 'ACTIVE',
    notes: 'Audit tahunan untuk laporan keuangan',
    createdAt: new Date('2024-12-01'),
    updatedAt: new Date('2024-12-01')
  },
  {
    id: '2',
    proposalDate: new Date('2024-12-05'),
    clientId: '2',
    client: mockClients[1],
    serviceCode: 'B',
    engagementNo: 1,
    seqNo: 2,
    proposalNumber: 'P.002/B/AP.2137-1/XII/2024',
    contractTitle: 'Review Sistem Pengendalian Internal',
    contractValue: 85000000,
    paymentStatus: 'UNPAID',
    status: 'ACTIVE',
    createdAt: new Date('2024-12-05'),
    updatedAt: new Date('2024-12-05')
  },
  {
    id: '3',
    proposalDate: new Date('2024-12-10'),
    clientId: '1',
    client: mockClients[0],
    serviceCode: 'A',
    engagementNo: 2,
    seqNo: 3,
    proposalNumber: 'P.003/A/AP.2137-2/XII/2024',
    contractTitle: 'Audit Special Purpose 2024',
    contractValue: 75000000,
    paymentStatus: 'PAID',
    status: 'ACTIVE',
    createdAt: new Date('2024-12-10'),
    updatedAt: new Date('2024-12-10')
  },
  {
    id: '4',
    proposalDate: new Date('2024-11-15'),
    clientId: '3',
    client: mockClients[2],
    serviceCode: 'B',
    engagementNo: 1,
    seqNo: 5,
    proposalNumber: 'P.005/B/AP.2137-1/XI/2024',
    contractTitle: 'Due Diligence Akuisisi',
    contractValue: 200000000,
    paymentStatus: 'PARTIAL',
    status: 'ACTIVE',
    createdAt: new Date('2024-11-15'),
    updatedAt: new Date('2024-11-15')
  },
  {
    id: '5',
    proposalDate: new Date('2024-10-20'),
    clientId: '5',
    client: mockClients[4],
    serviceCode: 'A',
    engagementNo: 1,
    seqNo: 3,
    proposalNumber: 'P.003/A/AP.2137-1/X/2024',
    contractTitle: 'Audit Laporan Keuangan 2023',
    contractValue: 120000000,
    paymentStatus: 'PAID',
    status: 'ACTIVE',
    createdAt: new Date('2024-10-20'),
    updatedAt: new Date('2024-10-20')
  }
];

// Sample Termins
export const mockTermins: Termin[] = [
  {
    id: '1',
    contractId: '1',
    terminName: 'DP 30%',
    terminAmount: 45000000,
    dueDate: new Date('2024-12-15'),
    status: 'PAID',
    paymentReceivedDate: new Date('2024-12-14'),
    createdAt: new Date('2024-12-01'),
    updatedAt: new Date('2024-12-14')
  },
  {
    id: '2',
    contractId: '1',
    terminName: 'Termin 2 (40%)',
    terminAmount: 60000000,
    dueDate: new Date('2025-01-15'),
    status: 'INVOICED',
    invoiceId: '1',
    createdAt: new Date('2024-12-01'),
    updatedAt: new Date('2024-12-20')
  },
  {
    id: '3',
    contractId: '1',
    terminName: 'Pelunasan (30%)',
    terminAmount: 45000000,
    dueDate: new Date('2025-02-15'),
    status: 'PENDING',
    createdAt: new Date('2024-12-01'),
    updatedAt: new Date('2024-12-01')
  },
  {
    id: '4',
    contractId: '3',
    terminName: 'Full Payment',
    terminAmount: 75000000,
    status: 'PAID',
    paymentReceivedDate: new Date('2024-12-20'),
    createdAt: new Date('2024-12-10'),
    updatedAt: new Date('2024-12-20')
  },
  {
    id: '5',
    contractId: '4',
    terminName: 'DP 50%',
    terminAmount: 100000000,
    dueDate: new Date('2024-11-30'),
    status: 'PAID',
    paymentReceivedDate: new Date('2024-11-28'),
    createdAt: new Date('2024-11-15'),
    updatedAt: new Date('2024-11-28')
  },
  {
    id: '6',
    contractId: '4',
    terminName: 'Pelunasan 50%',
    terminAmount: 100000000,
    dueDate: new Date('2025-01-30'),
    status: 'PENDING',
    createdAt: new Date('2024-11-15'),
    updatedAt: new Date('2024-11-15')
  }
];

// Sample Invoices
export const mockInvoices: Invoice[] = [
  {
    id: '1',
    invoiceDate: new Date('2024-12-20'),
    contractId: '1',
    terminId: '2',
    seqNo: 1,
    invoiceNumber: 'I.001/2/XII/2024',
    amount: 60000000,
    status: 'ISSUED',
    createdAt: new Date('2024-12-20'),
    updatedAt: new Date('2024-12-20')
  },
  {
    id: '2',
    invoiceDate: new Date('2024-12-14'),
    contractId: '1',
    terminId: '1',
    seqNo: 2,
    invoiceNumber: 'I.002/2/XII/2024',
    amount: 45000000,
    status: 'PAID',
    createdAt: new Date('2024-12-14'),
    updatedAt: new Date('2024-12-14')
  }
];

// Sample Letters
export const mockLetters: Letter[] = [
  {
    id: '1',
    letterDate: new Date('2024-12-15'),
    clientId: '1',
    client: mockClients[0],
    letterType: 'HRGA',
    subject: 'Surat Penugasan Tim Audit',
    seqNo: 1,
    letterNumber: 'L.001/2/XII/2024',
    status: 'ACTIVE',
    createdAt: new Date('2024-12-15'),
    updatedAt: new Date('2024-12-15')
  },
  {
    id: '2',
    letterDate: new Date('2024-12-18'),
    clientId: '2',
    client: mockClients[1],
    letterType: 'FINANCE',
    subject: 'Konfirmasi Pembayaran Termin 1',
    seqNo: 2,
    letterNumber: 'L.002/3/XII/2024',
    status: 'ACTIVE',
    createdAt: new Date('2024-12-18'),
    updatedAt: new Date('2024-12-18')
  },
  {
    id: '3',
    letterDate: new Date('2024-12-20'),
    clientId: '3',
    client: mockClients[2],
    letterType: 'SURAT_JALAN',
    subject: 'Pengiriman Dokumen Audit',
    seqNo: 3,
    letterNumber: 'L.003/4/XII/2024',
    status: 'ACTIVE',
    createdAt: new Date('2024-12-20'),
    updatedAt: new Date('2024-12-20')
  }
];

// Dashboard KPI calculation
export const getDashboardKPI = () => {
  const activeContracts = mockContracts.filter(c => c.status === 'ACTIVE');
  const totalContractValue = activeContracts.reduce((sum, c) => sum + c.contractValue, 0);
  
  const paidTermins = mockTermins.filter(t => t.status === 'PAID');
  const totalPaymentReceived = paidTermins.reduce((sum, t) => sum + t.terminAmount, 0);
  
  const pendingTermins = mockTermins.filter(t => t.status === 'PENDING' || t.status === 'INVOICED');
  const pendingPayments = pendingTermins.reduce((sum, t) => sum + t.terminAmount, 0);

  return {
    totalContracts: activeContracts.length,
    totalContractValue,
    totalPaymentReceived,
    pendingPayments
  };
};
