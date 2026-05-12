import React, { useMemo } from 'react';
import { StatCard } from '../components/StatCard';
import { Card } from '../components/Card';
import { useAppContext } from '../context/AppContext';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  AlertCircle,
  Briefcase,
  CreditCard
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export const Dashboard: React.FC = () => {
  const { transactions, services } = useAppContext();

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayTransactions = transactions.filter(
      t => new Date(t.transaction_date).toDateString() === today
    );

    const totalSales = todayTransactions.reduce((sum, t) => sum + t.total_amount, 0);
    const totalPaid = todayTransactions.reduce((sum, t) => sum + t.total_paid, 0);
    const totalUnpaid = todayTransactions.reduce((sum, t) => sum + t.balance, 0);
    const partialPayments = todayTransactions.filter(t => t.payment_status === 'Partial').length;
    const transactionCount = todayTransactions.length;

    const allPendingBalances = transactions
      .filter(t => t.payment_status !== 'Paid')
      .reduce((sum, t) => sum + t.balance, 0);

    return {
      totalSales,
      totalPaid,
      totalUnpaid,
      partialPayments,
      transactionCount,
      allPendingBalances
    };
  }, [transactions]);

  const serviceData = useMemo(() => {
    const serviceCounts: Record<string, number> = {};
    transactions.forEach(transaction => {
      transaction.items.forEach(item => {
        const category = services.find(s => s.id === item.service_id)?.category || 'Other';
        serviceCounts[category] = (serviceCounts[category] || 0) + item.quantity;
      });
    });

    return Object.entries(serviceCounts).map(([name, value]) => ({
      name,
      value
    }));
  }, [transactions, services]);

  const paymentMethodData = useMemo(() => {
    const paymentMethods: Record<string, number> = {};
    transactions.forEach(transaction => {
      transaction.payments.forEach(payment => {
        paymentMethods[payment.payment_method] =
          (paymentMethods[payment.payment_method] || 0) + payment.amount;
      });
    });

    return Object.entries(paymentMethods).map(([name, value]) => ({
      name,
      value
    }));
  }, [transactions]);

  const COLORS = ['#0d9488', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Today's Total Sales"
          value={`₱${stats.totalSales.toLocaleString()}`}
          icon={DollarSign}
          iconColor="text-teal-600"
        />
        <StatCard
          title="Total Paid Today"
          value={`₱${stats.totalPaid.toLocaleString()}`}
          icon={TrendingUp}
          iconColor="text-green-600"
        />
        <StatCard
          title="Total Unpaid Today"
          value={`₱${stats.totalUnpaid.toLocaleString()}`}
          icon={AlertCircle}
          iconColor="text-red-600"
        />
        <StatCard
          title="Partial Payments Today"
          value={stats.partialPayments}
          icon={CreditCard}
          iconColor="text-yellow-600"
        />
        <StatCard
          title="Transactions Today"
          value={stats.transactionCount}
          icon={Receipt}
          iconColor="text-blue-600"
        />
        <StatCard
          title="All Pending Balances"
          value={`₱${stats.allPendingBalances.toLocaleString()}`}
          icon={AlertCircle}
          iconColor="text-orange-600"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Service Category */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Services Availed
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={serviceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#0d9488" name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Payment Method Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Payment Method Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={paymentMethodData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {paymentMethodData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Recent Transactions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Transaction #
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Client
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Date
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Amount
                </th>
                <th className="text-center py-3 px-2 text-sm font-medium text-slate-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 5).map((transaction) => (
                <tr key={transaction.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.transaction_number}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.client_name}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600">
                    {new Date(transaction.transaction_date).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900 text-right">
                    ₱{transaction.total_amount.toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        transaction.payment_status === 'Paid'
                          ? 'bg-green-100 text-green-800'
                          : transaction.payment_status === 'Partial'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {transaction.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
