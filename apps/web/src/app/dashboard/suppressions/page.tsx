'use client';

import { useState, useEffect } from 'react';

interface Suppression {
  id: string;
  email: string;
  reason: 'bounce' | 'complaint' | 'unsubscribe' | 'manual';
  bounceType?: 'hard' | 'soft';
  source?: string;
  createdAt: string;
}

interface SuppressionStats {
  total: number;
  byReason: Record<string, number>;
}

export default function SuppressionsPage() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [stats, setStats] = useState<SuppressionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState<string>('manual');
  const [bulkEmails, setBulkEmails] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);

  useEffect(() => {
    fetchSuppressions();
    fetchStats();
  }, [search, reasonFilter]);

  const fetchSuppressions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (reasonFilter) params.append('reason', reasonFilter);
      params.append('limit', '50');

      const response = await fetch(`/api/suppressions?${params}`);
      const data = await response.json();
      setSuppressions(data.suppressions || []);
    } catch (error) {
      console.error('Error fetching suppressions:', error);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/suppressions/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const addSuppression = async () => {
    if (!newEmail) return;

    try {
      const response = await fetch('/api/suppressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, reason: newReason }),
      });

      if (response.ok) {
        setNewEmail('');
        setShowAddModal(false);
        fetchSuppressions();
        fetchStats();
      }
    } catch (error) {
      console.error('Error adding suppression:', error);
    }
  };

  const bulkAddSuppressions = async () => {
    const emails = bulkEmails.split('\n').map(e => e.trim()).filter(e => e);
    if (emails.length === 0) return;

    try {
      const response = await fetch('/api/suppressions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, reason: newReason }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Added ${result.created} new, updated ${result.updated} existing suppressions`);
        setBulkEmails('');
        setShowBulkModal(false);
        fetchSuppressions();
        fetchStats();
      }
    } catch (error) {
      console.error('Error bulk adding suppressions:', error);
    }
  };

  const removeSuppression = async (email: string) => {
    if (!confirm(`Remove ${email} from suppression list?`)) return;

    try {
      await fetch(`/api/suppressions/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      fetchSuppressions();
      fetchStats();
    } catch (error) {
      console.error('Error removing suppression:', error);
    }
  };

  const exportSuppressions = () => {
    const params = new URLSearchParams();
    if (reasonFilter) params.append('reason', reasonFilter);
    window.open(`/api/suppressions/export?${params}`, '_blank');
  };

  const getReasonBadgeColor = (reason: string) => {
    switch (reason) {
      case 'bounce': return 'bg-red-100 text-red-800';
      case 'complaint': return 'bg-orange-100 text-orange-800';
      case 'unsubscribe': return 'bg-blue-100 text-blue-800';
      case 'manual': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Suppression List</h1>
        <p className="text-gray-600">Manage email addresses that should not receive marketing emails</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Suppressed</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-red-600">{stats.byReason.bounce || 0}</div>
            <div className="text-sm text-gray-600">Bounces</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-orange-600">{stats.byReason.complaint || 0}</div>
            <div className="text-sm text-gray-600">Complaints</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-blue-600">{stats.byReason.unsubscribe || 0}</div>
            <div className="text-sm text-gray-600">Unsubscribes</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-gray-600">{stats.byReason.manual || 0}</div>
            <div className="text-sm text-gray-600">Manual</div>
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 border rounded-lg w-64"
          />
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">All Reasons</option>
            <option value="bounce">Bounce</option>
            <option value="complaint">Complaint</option>
            <option value="unsubscribe">Unsubscribe</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Email
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Bulk Import
          </button>
          <button
            onClick={exportSuppressions}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Suppressions Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Added</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : suppressions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No suppressed emails found
                </td>
              </tr>
            ) : (
              suppressions.map((suppression) => (
                <tr key={suppression.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{suppression.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${getReasonBadgeColor(suppression.reason)}`}>
                      {suppression.reason}
                      {suppression.bounceType && ` (${suppression.bounceType})`}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{suppression.source || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(suppression.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => removeSuppression(suppression.email)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-lg font-semibold mb-4">Add to Suppression List</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="manual">Manual</option>
                  <option value="bounce">Bounce</option>
                  <option value="complaint">Complaint</option>
                  <option value="unsubscribe">Unsubscribe</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addSuppression}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[500px]">
            <h2 className="text-lg font-semibold mb-4">Bulk Import Suppressions</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Emails (one per line)
                </label>
                <textarea
                  value={bulkEmails}
                  onChange={(e) => setBulkEmails(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg h-48 font-mono text-sm"
                  placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="manual">Manual</option>
                  <option value="bounce">Bounce</option>
                  <option value="complaint">Complaint</option>
                  <option value="unsubscribe">Unsubscribe</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={bulkAddSuppressions}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
