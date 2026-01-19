'use client';

import { Plus, Send, Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const mockCampaigns = [
  {
    id: 'camp_1',
    name: 'Welcome Series - Day 1',
    subject: 'Welcome to our platform!',
    status: 'sent',
    type: 'regular',
    sentAt: '2024-01-15T10:00:00Z',
    stats: {
      sent: 1234,
      delivered: 1220,
      openRate: 42,
      clickRate: 8.2,
    },
  },
  {
    id: 'camp_2',
    name: 'Product Launch Announcement',
    subject: 'Introducing our new feature',
    status: 'scheduled',
    type: 'regular',
    scheduledAt: '2024-01-20T09:00:00Z',
    stats: null,
  },
  {
    id: 'camp_3',
    name: 'Monthly Newsletter - January',
    subject: 'January updates and news',
    status: 'draft',
    type: 'regular',
    stats: null,
  },
  {
    id: 'camp_4',
    name: 'Re-engagement Campaign',
    subject: 'We miss you!',
    status: 'sending',
    type: 'ab_test',
    stats: {
      sent: 567,
      delivered: 560,
      openRate: 38,
      clickRate: 5.1,
    },
  },
];

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    sending: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.draft}`}
    >
      {status}
    </span>
  );
}

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground">
            Create and manage email campaigns
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Campaign
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockCampaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockCampaigns.filter((c) => c.status === 'sent').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockCampaigns.filter((c) => c.status === 'scheduled').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockCampaigns.filter((c) => c.status === 'draft').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
          <CardDescription>
            View and manage all your email campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead className="text-right">Click Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCampaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.subject}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                  <TableCell className="capitalize">{campaign.type.replace('_', ' ')}</TableCell>
                  <TableCell className="text-right">
                    {campaign.stats?.sent?.toLocaleString() || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.stats?.openRate ? `${campaign.stats.openRate}%` : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.stats?.clickRate ? `${campaign.stats.clickRate}%` : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
