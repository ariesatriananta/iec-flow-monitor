type NotificationRow = {
  employeeId: string;
  employeeName: string;
  overtimeDate: string;
  approverLevel1EmployeeId: string;
  approverLevel2EmployeeId: string;
  status: string;
};

export type OvertimeNotificationPlan = {
  employeeId: string;
  type: string;
  title: string;
  message: string;
};

/** Snapshot assignees only. Actionable notices take priority over progress notices. */
export function planOvertimeNotifications(row: NotificationRow, fromStatus: string | null): OvertimeNotificationPlan[] {
  const context = `${row.employeeName}, tanggal ${row.overtimeDate}`;
  if (fromStatus === null && row.status === "SUBMITTED") {
    return [{ employeeId: row.approverLevel1EmployeeId, type: "OVERTIME_SUBMITTED", title: "Pengajuan Lembur Baru", message: `Pengajuan lembur ${context} menunggu persetujuan level 1.` }];
  }
  if (fromStatus === "SUBMITTED" && row.status === "WAITING_LEVEL_2") {
    const plans: OvertimeNotificationPlan[] = [{ employeeId: row.approverLevel2EmployeeId, type: "OVERTIME_WAITING_LEVEL_2", title: "Persetujuan Lembur Level 2", message: `Pengajuan lembur ${context} telah disetujui level 1 dan menunggu persetujuan Anda.` }];
    if (row.employeeId !== row.approverLevel2EmployeeId) plans.push({ employeeId: row.employeeId, type: "OVERTIME_PROGRESS", title: "Lembur Disetujui Level 1", message: `Pengajuan lembur tanggal ${row.overtimeDate} telah disetujui level 1 dan menunggu level 2.` });
    return plans;
  }
  if ((fromStatus === "SUBMITTED" || fromStatus === "WAITING_LEVEL_2") && ["APPROVED", "REJECTED"].includes(row.status)) {
    const approved = row.status === "APPROVED";
    return [{ employeeId: row.employeeId, type: approved ? "OVERTIME_APPROVED" : "OVERTIME_REJECTED", title: approved ? "Pengajuan Lembur Disetujui" : "Pengajuan Lembur Ditolak", message: `Pengajuan lembur tanggal ${row.overtimeDate} telah ${approved ? "disetujui sepenuhnya" : "ditolak"}. Lihat detail pengajuan untuk riwayat keputusan.` }];
  }
  if ((fromStatus === "SUBMITTED" || fromStatus === "WAITING_LEVEL_2") && row.status === "CANCELLED") {
    const employeeIds = fromStatus === "SUBMITTED" ? [row.approverLevel1EmployeeId] : [row.approverLevel1EmployeeId, row.approverLevel2EmployeeId];
    return [...new Set(employeeIds)].filter(employeeId => employeeId !== row.employeeId).map(employeeId => ({ employeeId, type: "OVERTIME_CANCELLED", title: "Pengajuan Lembur Dibatalkan", message: `Pengajuan lembur ${context} telah dibatalkan oleh pengaju.` }));
  }
  return [];
}

export function resolveOvertimeNotificationRecipients(plans: OvertimeNotificationPlan[], accounts: { id: string; employeeId: string | null; isActive: boolean }[]) {
  const seen = new Set<string>();
  return plans.flatMap(plan => accounts.filter(account => account.isActive && account.employeeId === plan.employeeId).flatMap(account => {
    if (seen.has(account.id)) return [];
    seen.add(account.id);
    return [{ ...plan, userId: account.id }];
  }));
}
